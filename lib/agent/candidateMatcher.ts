// lib/agent/candidateMatcher.ts
// Agent 2 (Part B) — Candidate Matcher
//
// Orchestrates the full matching pipeline for a given job:
//   1. Query Supabase for candidates in that job
//   2. Score each candidate against the JD requirements
//   3. Sort by score, filter by minimum threshold
//   4. Return ranked shortlist with red flag data merged in
//
// Supabase tables used (read-only from agent):
//   candidates — resume_text, name, stated_experience, current_location, red_flags, has_red_flags
//
// Design decisions:
//   - Parallel scoring via Promise.allSettled — all candidates scored concurrently
//   - MIN_SCORE_THRESHOLD: 40 — don't surface D-grade candidates unless forced
//   - Red flag data from existing redFlagDetector passed through — not re-run here
//   - Groq rate limit: 30 req/min — for >25 candidates, batching is applied

import { createClient } from '@supabase/supabase-js'
import { scoreCandidate, type AiCandidateScore } from './candidateScorer'
import type { JdRequirements } from './jdAnalyzer'

const MIN_SCORE_THRESHOLD = 40   // D-grade candidates excluded by default
const BATCH_SIZE          = 10   // max concurrent Groq calls (well within 30 req/min)
const BATCH_DELAY_MS      = 2500 // pause between batches to respect rate limit

export interface ShortlistedCandidate extends AiCandidateScore {
  // merged from Supabase candidates row
  current_company:   string | null
  current_stage:     string | null
  has_red_flags:     boolean
  red_flag_critical: boolean
  red_flags:         unknown[]
  resume_url:        string | null
  rank:              number
}

export interface MatchResult {
  job_id:          string
  jd_requirements: JdRequirements
  shortlist:       ShortlistedCandidate[]
  total_evaluated: number
  total_shortlisted: number
  run_at:          string
  groq_model:      string
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function scoreBatch(
  jd:         JdRequirements,
  candidates: Array<{
    id: string; name: string; resume_text: string | null
    stated_experience: number | null; current_location: string | null
    current_company: string | null; current_stage: string | null
    has_red_flags: boolean; red_flag_critical: boolean
    red_flags: unknown[]; resume_url: string | null
  }>
): Promise<Array<{ score: AiCandidateScore | null; raw: typeof candidates[0] }>> {
  const results = await Promise.allSettled(
    candidates.map(c =>
      scoreCandidate(jd, c.resume_text ?? '', {
        id:                c.id,
        name:              c.name,
        stated_experience: c.stated_experience,
        current_location:  c.current_location,
      })
    )
  )

  return results.map((result, i) => ({
    score: result.status === 'fulfilled' ? result.value : null,
    raw:   candidates[i],
  }))
}

export async function matchCandidates(
  jobId:           string,
  jd:              JdRequirements,
  options: {
    minScore?:    number   // override MIN_SCORE_THRESHOLD
    maxResults?:  number   // cap shortlist size (default: 20)
    includeAll?:  boolean  // include D-grade candidates too
  } = {}
): Promise<MatchResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!   // service role — bypasses RLS for agent reads
  )

  // ── Fetch candidates for this job ──────────────────────────────────────────
  const { data: candidates, error } = await supabase
    .from('candidates')
    .select(`
      id, name, resume_text, stated_experience, current_location,
      current_company, current_stage, has_red_flags, red_flag_critical,
      red_flags, resume_url
    `)
    .eq('job_id', jobId)
    .not('resume_text', 'is', null)  // skip candidates with no resume text

  if (error) throw new Error(`Supabase query failed: ${error.message}`)
  if (!candidates || candidates.length === 0) {
    return {
      job_id: jobId, jd_requirements: jd,
      shortlist: [], total_evaluated: 0, total_shortlisted: 0,
      run_at: new Date().toISOString(), groq_model: 'llama-3.1-70b-versatile',
    }
  }

  // ── Score in batches to respect Groq rate limit ────────────────────────────
  const allScored: Array<{ score: AiCandidateScore | null; raw: typeof candidates[0] }> = []

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE)
    const batchResults = await scoreBatch(jd, batch)
    allScored.push(...batchResults)

    // Pause between batches — not needed for last batch
    if (i + BATCH_SIZE < candidates.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  // ── Build shortlist ────────────────────────────────────────────────────────
  const minScore  = options.minScore  ?? (options.includeAll ? 0 : MIN_SCORE_THRESHOLD)
  const maxResults = options.maxResults ?? 20

  const shortlist: ShortlistedCandidate[] = allScored
    .filter(({ score }) => score !== null && score.total_score >= minScore)
    .sort((a, b) => (b.score?.total_score ?? 0) - (a.score?.total_score ?? 0))
    .slice(0, maxResults)
    .map(({ score, raw }, index) => ({
      ...(score as AiCandidateScore),
      current_company:   raw.current_company,
      current_stage:     raw.current_stage,
      has_red_flags:     raw.has_red_flags,
      red_flag_critical: raw.red_flag_critical,
      red_flags:         raw.red_flags ?? [],
      resume_url:        raw.resume_url,
      rank:              index + 1,
    }))

  return {
    job_id:            jobId,
    jd_requirements:   jd,
    shortlist,
    total_evaluated:   candidates.length,
    total_shortlisted: shortlist.length,
    run_at:            new Date().toISOString(),
    groq_model:        'llama-3.1-70b-versatile',
  }
}