// lib/agent/candidateMatcher.ts  — v3 (final)
//
// Auth: uses your supabase singleton (anon key + session) — no service role.
// Column names match actual candidates table schema.
// Fallback text built from structured fields populated by localResumeParser.ts.
//
// Pipeline:
//   1. Fetch candidates for job (correct columns, RLS-safe)
//   2. For each candidate: getOrParseResumeText() → parses PDF if resume_parsed_text is null
//   3. If PDF parse also fails → buildFallbackText() from key_skills + structured fields
//   4. scoreCandidate() via Groq
//   5. Sort → rank → save to ai_shortlists → return MatchResult

import { supabase } from '@/lib/supabase'
import { scoreCandidate, type AiCandidateScore } from './candidateScorer'
import { getOrParseResumeText } from '@/lib/resumeParser'
import type { JdRequirements } from './jdAnalyzer'

const MIN_SCORE_THRESHOLD = 40
const BATCH_SIZE          = 10
const BATCH_DELAY_MS      = 2500   // ms between Groq batches — stays within 30 req/min

export interface ShortlistedCandidate extends AiCandidateScore {
  current_company:   string | null
  current_stage:     string | null
  has_red_flags:     boolean
  red_flag_critical: boolean
  red_flags:         unknown[]
  resume_url:        string | null
  rank:              number
}

export interface MatchResult {
  job_id:             string
  jd_requirements:    JdRequirements
  shortlist:          ShortlistedCandidate[]
  total_evaluated:    number
  total_shortlisted:  number
  run_at:             string
  groq_model:         string
}

// Mirrors actual candidates table columns
interface CandidateRow {
  id:                  string
  full_name:           string
  resume_parsed_text:  string | null
  resume_url:          string | null
  resume_parsed:       boolean | null
  total_experience:    number | null
  current_location:    string | null
  current_company:     string | null
  current_designation: string | null
  current_stage:       string | null
  has_red_flags:       boolean
  red_flag_critical:   boolean
  red_flags:           unknown[]
  key_skills:          string[] | null
  parsed_skills:       string[] | null
  education_degree:    string | null
  industry:            string | null
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Build synthetic resume text from structured fields.
// localResumeParser.ts populates these fields on candidate creation —
// so even if PDF raw text is missing, Groq can score from this.
function buildFallbackText(row: CandidateRow): string {
  const parts: string[] = []

  if (row.full_name)           parts.push(`Name: ${row.full_name}`)
  if (row.current_designation) parts.push(`Current Role: ${row.current_designation}`)
  if (row.current_company)     parts.push(`Current Company: ${row.current_company}`)
  if (row.total_experience)    parts.push(`Total Experience: ${row.total_experience} years`)
  if (row.current_location)    parts.push(`Location: ${row.current_location}`)
  if (row.education_degree)    parts.push(`Education: ${row.education_degree}`)
  if (row.industry)            parts.push(`Industry: ${row.industry}`)

  // Merge key_skills + parsed_skills, deduplicate
  const allSkills = [
    ...(row.key_skills    ?? []),
    ...(row.parsed_skills ?? []),
  ]
  const uniqueSkills = [...new Set(allSkills)]
  if (uniqueSkills.length > 0) {
    parts.push(`Skills: ${uniqueSkills.join(', ')}`)
  }

  return parts.join('\n')
}

async function scoreBatch(
  jd:         JdRequirements,
  candidates: CandidateRow[]
): Promise<Array<{ score: AiCandidateScore | null; raw: CandidateRow }>> {

  const settled = await Promise.allSettled(
    candidates.map(async c => {
      // Try full resume text first (PDF parse)
      let resumeText = await getOrParseResumeText({
        id:                 c.id,
        resume_parsed_text: c.resume_parsed_text,
        resume_url:         c.resume_url,
        resume_parsed:      c.resume_parsed,
      })

      // Fall back to structured fields if PDF parse returned nothing
      if (!resumeText || resumeText.length < 100) {
        resumeText = buildFallbackText(c)
      }

      return scoreCandidate(jd, resumeText, {
        id:                c.id,
        name:              c.full_name,
        stated_experience: c.total_experience,
        current_location:  c.current_location,
      })
    })
  )

  return settled.map((result, i) => ({
    score: result.status === 'fulfilled' ? result.value : null,
    raw:   candidates[i],
  }))
}

export async function matchCandidates(
  jobId:   string,
  jd:      JdRequirements,
  options: { minScore?: number; maxResults?: number; includeAll?: boolean } = {}
): Promise<MatchResult> {

  // ── Fetch candidates — exact schema column names ───────────────────────────
  // Uses supabase singleton — RLS ensures user only sees their job's candidates
  const { data: candidates, error } = await supabase
    .from('candidates')
    .select(`
      id,
      full_name,
      resume_parsed_text,
      resume_url,
      resume_parsed,
      total_experience,
      current_location,
      current_company,
      current_designation,
      current_stage,
      has_red_flags,
      red_flag_critical,
      red_flags,
      key_skills,
      parsed_skills,
      education_degree,
      industry
    `)
    .eq('job_id', jobId)
    .not('resume_url', 'is', null)
    .not('current_stage', 'in', '("dropped","offer_rejected","interview_rejected","screening_rejected")')

  if (error) throw new Error(`Failed to fetch candidates: ${error.message}`)

  if (!candidates || candidates.length === 0) {
    return {
      job_id: jobId, jd_requirements: jd, shortlist: [],
      total_evaluated: 0, total_shortlisted: 0,
      run_at: new Date().toISOString(), groq_model: 'llama-3.1-70b-versatile',
    }
  }

  // ── Score in batches to respect Groq 30 req/min limit ─────────────────────
  const allScored: Array<{ score: AiCandidateScore | null; raw: CandidateRow }> = []

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE) as CandidateRow[]
    const results = await scoreBatch(jd, batch)
    allScored.push(...results)

    if (i + BATCH_SIZE < candidates.length) await sleep(BATCH_DELAY_MS)
  }

  // ── Build ranked shortlist ─────────────────────────────────────────────────
  const minScore   = options.minScore  ?? (options.includeAll ? 0 : MIN_SCORE_THRESHOLD)
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

  // ── Save shortlist to ai_shortlists ───────────────────────────────────────
  // Uses supabase singleton — RLS write policy allows authenticated users
  const { error: saveError } = await supabase
    .from('ai_shortlists')
    .upsert({
      job_id:            jobId,
      run_at:            new Date().toISOString(),
      jd_requirements:   jd,
      shortlist,
      total_evaluated:   candidates.length,
      total_shortlisted: shortlist.length,
      groq_model:        'llama-3.1-70b-versatile',
    }, { onConflict: 'job_id' })

  if (saveError) {
    // Non-fatal — log but don't fail the whole match run
    console.error('[matchCandidates] Failed to save shortlist:', saveError.message)
  }

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