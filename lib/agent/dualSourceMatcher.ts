// lib/agent/dualSourceMatcher.ts

import { supabase } from '@/lib/supabase'
import { getOrParseResumeText } from '@/lib/resumeParser'
import type { JdRequirements } from './jdAnalyzer'
import { matchResumeToJob } from '@/lib/resumeMatchEngine'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BadgeType =
  | 'resume_bank'
  | 'same_client'
  | 'already_placed'
  | 'never_processed'
  | 'active_candidate'

export interface ClientHistory {
  clientName: string
  clientId: string
  jobTitle: string
  stage: string
  outcome: 'selected' | 'rejected' | 'in_progress' | 'placed'
  monthsAgo: number
  recruiterName: string | null
}

export interface AiCandidateScore {
  candidate_id: string
  candidate_name: string
  total_score: number
  grade: 'A' | 'B' | 'C' | 'D'
  dimensions: any
  matched_skills: string[]
  missing_skills: string[]
  confidence: 'low' | 'medium' | 'high'
  shortlist_reason: string
  concern: string
}

export interface DualSourceCandidate extends AiCandidateScore {
  source: 'candidates' | 'resume_bank'
  sourceId: string
  phone: string | null
  email: string | null
  current_company: string | null
  current_designation: string | null
  current_stage: string | null
  has_red_flags: boolean
  red_flag_critical: boolean
  red_flags: unknown[]
  resume_url: string | null
  uploaded_at: string | null
  sourced_by: string | null
  clientHistory: ClientHistory[]
  badges: BadgeType[]
  sameClientWarning: string | null
  rank: number
}

export interface DualMatchResult {
  job_id: string
  client_id: string | null
  jd_requirements: JdRequirements
  shortlist: DualSourceCandidate[]
  total_evaluated: number
  total_shortlisted: number
  candidates_count: number
  resume_bank_count: number
  run_at: string
  match_engine: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFallbackText(row: any): string {
  const parts: string[] = []
  if (row.full_name) parts.push(row.full_name)
  if (row.current_designation) parts.push(row.current_designation)
  if (row.current_company) parts.push(row.current_company)
  if (row.total_experience) parts.push(`${row.total_experience} years`)
  const skills = [...(row.key_skills ?? []), ...(row.parsed_skills ?? [])]
  if (skills.length) parts.push(skills.join(', '))
  return parts.join(' ')
}

// ─── Internal Scoring ─────────────────────────────────────────────────────────

async function scoreRow(jd: JdRequirements, row: any): Promise<AiCandidateScore> {
  let text = await getOrParseResumeText({
    id: row.id,
    resume_parsed_text: row.resume_parsed_text ?? null,
    resume_url: row.resume_url,
    resume_parsed: row.resume_parsed ?? null,
  })

  if (!text || text.length < 100) {
    text = buildFallbackText(row)
  }

  const result = matchResumeToJob({
    resume: {
      skills: [...(row.key_skills ?? []), ...(row.parsed_skills ?? [])],
      total_experience: row.total_experience ?? null,
      rawText: text,
      education_degree: row.education_degree ?? null,
      current_location: row.current_location ?? null,
      current_company: row.current_company ?? null,
    },
    job: {
      job_title: jd.job_title,
      job_description: [
        jd.raw_summary,
        ...(jd.key_responsibilities ?? [])
      ].join(' | '),
      key_skills: jd.must_have_skills?.join(', ') ?? '',
      nice_to_have_skills: jd.nice_to_have_skills?.join(', ') ?? '',
      experience_min: jd.experience_range?.min ?? null,
      experience_max: jd.experience_range?.max ?? null,
      education_requirement: jd.education ?? '',
      location: jd.location ?? '',
    }
  })

  return {
    candidate_id: row.id,
    candidate_name: row.full_name,
    total_score: result.match_score,
    grade:
      result.match_score >= 80 ? 'A' :
      result.match_score >= 65 ? 'B' :
      result.match_score >= 50 ? 'C' : 'D',
    dimensions: {},
    matched_skills: result.matched_skills,
    missing_skills: result.missing_skills,
    confidence: 'high',
    shortlist_reason: result.summary,
    concern: result.recommendation === 'reject' ? 'Low match' : 'None',
  }
}

// ─── Batch Scorer ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 20

async function scoreRows(
  jd: JdRequirements,
  rows: any[],
  source: 'candidates' | 'resume_bank'
): Promise<DualSourceCandidate[]> {
  const results: DualSourceCandidate[] = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const scored = await Promise.all(
      batch.map(async row => {
        const score = await scoreRow(jd, row)
        return {
          ...score,
          source,
          sourceId:            row.id,
          phone:               row.phone               ?? null,
          email:               row.email               ?? null,
          current_company:     row.current_company     ?? null,
          current_designation: row.current_designation ?? null,
          current_stage:       source === 'candidates' ? (row.current_stage ?? null) : null,
          has_red_flags:       row.has_red_flags       ?? false,
          red_flag_critical:   row.red_flag_critical   ?? false,
          red_flags:           row.red_flags           ?? [],
          resume_url:          row.resume_url          ?? null,
          uploaded_at:         source === 'resume_bank' ? (row.uploaded_at ?? null) : null,
          sourced_by:          source === 'resume_bank' ? (row.users?.full_name ?? null) : null,
          clientHistory:       [],
          badges:              [source === 'candidates' ? 'active_candidate' : 'resume_bank'] as BadgeType[],
          sameClientWarning:   null,
          rank:                0,
        } as DualSourceCandidate
      })
    )
    results.push(...scored)
  }

  return results
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCandidates(jobId: string) {
  const { data } = await supabase
    .from('candidates')
    .select('*')
    .eq('job_id', jobId)
    .not('resume_url', 'is', null)

  return data ?? []
}

async function fetchResumeBank() {
  const { data } = await supabase
    .from('resume_bank')
    .select('*')
    .eq('status', 'available')
    .not('resume_url', 'is', null)

  return data ?? []
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function dualSourceMatch(
  jobId: string,
  jd: JdRequirements,
  options: { minScore?: number; maxResults?: number } = {}
): Promise<DualMatchResult> {

  const { data: jobRow } = await supabase
    .from('jobs')
    .select('client_id')
    .eq('id', jobId)
    .single()

  const currentClientId = jobRow?.client_id ?? null

  const [candidateRows, resumeBankRows] = await Promise.all([
    fetchCandidates(jobId),
    fetchResumeBank(),
  ])

  // ── Parallel batch scoring (replaces sequential for-loops) ────────────────
  const [candidateScored, resumeBankScored] = await Promise.all([
    scoreRows(jd, candidateRows, 'candidates'),
    scoreRows(jd, resumeBankRows, 'resume_bank'),
  ])

  const all = [...candidateScored, ...resumeBankScored]

  const minScore  = options.minScore  ?? 0
  const maxResults = options.maxResults ?? 20

  const shortlist = all
    .filter(c => c.total_score >= minScore)
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, maxResults)
    .map((c, i) => ({ ...c, rank: i + 1 }))

  return {
    job_id:              jobId,
    client_id:           currentClientId,
    jd_requirements:     jd,
    shortlist,
    total_evaluated:     all.length,
    total_shortlisted:   shortlist.length,
    candidates_count:    candidateRows.length,
    resume_bank_count:   resumeBankRows.length,
    run_at:              new Date().toISOString(),
    match_engine:        'internal',
  }
}