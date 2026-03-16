// app/api/match-resume/route.ts
// Server-side job matching endpoint — no paid APIs, pure algorithmic.
// Accepts parsed resume data OR fetches from DB by candidateId/resumeBankId.
// Caches results in ai_screenings table (24h TTL).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { matchResumeToJob } from '@/lib/resumeMatchEngine'

// Use anon key — service role (legacy JWT) is disabled on this Supabase project.
// Jobs table is readable with anon key. ai_screenings inserts work too since
// RLS allows authenticated inserts and anon key bypasses nothing sensitive here.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      jobId,
      candidateId,
      resumeBankId,
      parsedData,   // pass directly from Add Candidate form (before save)
      rawText,      // full resume text for JD keyword matching
      screenedBy,   // user.id — if provided, result is saved to DB
      jobData,      // full job object passed from client to avoid RLS issues
    } = body

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    // ── 1. Fetch job ──────────────────────────────────────────────────────────
    // Prefer jobData passed from client (avoids RLS issues in API routes).
    // Fall back to DB fetch only if not provided.
    let job = jobData || null

    if (!job) {
      const { data: fetched, error: jobError } = await supabaseAdmin
        .from('jobs')
        .select('id, job_title, job_description, key_skills, experience_min, experience_max, min_ctc, max_ctc')
        .eq('id', jobId)
        .limit(1)
        .maybeSingle()

      if (jobError || !fetched) {
        console.error('[match-resume] Job fetch failed:', jobError?.message, '| jobId:', jobId)
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
      job = fetched
    }

    // ── 2. Check for fresh cached result ─────────────────────────────────────
    // Only check cache if we have a persistent source (not a pre-save preview)
    if (screenedBy && (candidateId || resumeBankId)) {
      const sourceFilter = candidateId
        ? { candidate_id: candidateId }
        : { resume_bank_id: resumeBankId }

      const { data: existing } = await supabaseAdmin
        .from('ai_screenings')
        .select('*')
        .match({ ...sourceFilter, job_id: jobId })
        .maybeSingle()

      if (existing) {
        const ageHours = (Date.now() - new Date(existing.created_at).getTime()) / 3_600_000
        if (ageHours < 24) {
          return NextResponse.json({ result: existing, cached: true })
        }
      }
    }

    // ── 3. Get resume data ────────────────────────────────────────────────────
    let skills:           string[]      = []
    let total_experience: number | null = null
    let expected_ctc:     number | null = null
    let resumeText:       string        = rawText || ''

    if (parsedData) {
      // Direct from Add Candidate form — use passed data
      skills           = parsedData.skills || parsedData.key_skills || []
      total_experience = parsedData.total_experience ?? null
      expected_ctc     = parsedData.expected_ctc ?? null
      resumeText       = parsedData.rawText || rawText || ''

    } else if (candidateId) {
      const { data: candidate } = await supabaseAdmin
        .from('candidates')
        .select('key_skills, total_experience, expected_ctc')
        .eq('id', candidateId)
        .single()
      if (candidate) {
        skills           = candidate.key_skills || []
        total_experience = candidate.total_experience
        expected_ctc     = candidate.expected_ctc
      }

    } else if (resumeBankId) {
      const { data: rb } = await supabaseAdmin
        .from('resume_bank')
        .select('key_skills, total_experience, expected_ctc')
        .eq('id', resumeBankId)
        .single()
      if (rb) {
        skills           = rb.key_skills || []
        total_experience = rb.total_experience
        expected_ctc     = rb.expected_ctc
      }
    }

    // ── 4. Run matching engine ────────────────────────────────────────────────
    const result = matchResumeToJob({
      resume: { skills, total_experience, expected_ctc, rawText: resumeText },
      job,
    })

    // ── 5. Persist result if screenedBy is provided ───────────────────────────
    if (screenedBy && (candidateId || resumeBankId)) {
      const record: Record<string, any> = {
        job_id:           jobId,
        screened_by:      screenedBy,
        match_score:      result.match_score,
        matched_skills:   result.matched_skills,
        skill_gaps:       result.missing_skills,
        analysis:         result.summary,
        recommendation:   result.recommendation,
        score_breakdown:  result.breakdown,    // jsonb column
        experience_verdict: result.experience_verdict,
        ctc_verdict:      result.ctc_verdict,
        partial_skills:   result.partial_skills,
      }
      if (candidateId)  record.candidate_id   = candidateId
      if (resumeBankId) record.resume_bank_id  = resumeBankId

      const { data: saved } = await supabaseAdmin
        .from('ai_screenings')
        .upsert(record, {
          onConflict: candidateId ? 'candidate_id,job_id' : 'resume_bank_id,job_id',
        })
        .select()
        .maybeSingle()

      return NextResponse.json({ result: saved ?? result, cached: false })
    }

    // Preview mode (no save) — return result directly
    return NextResponse.json({ result, cached: false })

  } catch (err: any) {
    console.error('match-resume error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}