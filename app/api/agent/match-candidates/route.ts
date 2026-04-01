// app/api/agent/match-candidates/route.ts
// POST /api/agent/match-candidates
//
// Full pipeline: JD text → structured requirements → score all candidates → ranked shortlist
// This is the main endpoint called when recruiter clicks "Run AI Match" on a job.
//
// Request body:
//   {
//     job_id:     string   — Talent IQ job UUID
//     jd_text:    string   — raw job description text
//     min_score?: number   — override minimum score threshold (default: 40)
//     max_results?: number — cap shortlist size (default: 20)
//   }
//
// Response:
//   { success: true,  result: MatchResult }
//   { success: false, error: string }
//
// The result is also saved to the ai_shortlists table in Supabase
// so recruiters can view it later without re-running.

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { analyzeJD } from '@/lib/agent/jdAnalyzer'
import { matchCandidates } from '@/lib/agent/candidateMatcher'

export async function POST(req: NextRequest) {
  try {
    // ── Auth check ────────────────────────────────────────────────────────────
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json()
    const { job_id, jd_text, min_score, max_results } = body

    if (!job_id || !jd_text) {
      return NextResponse.json(
        { success: false, error: 'job_id and jd_text are required' },
        { status: 400 }
      )
    }

    // ── Step 1: Analyse JD ────────────────────────────────────────────────────
    const requirements = await analyzeJD(jd_text)

    // ── Step 2: Match & score candidates ─────────────────────────────────────
    const result = await matchCandidates(job_id, requirements, {
      minScore:   min_score,
      maxResults: max_results,
    })

    // ── Step 3: Save result to Supabase ───────────────────────────────────────
    // Uses service role key via Supabase admin client for write
    const { error: saveError } = await supabase
      .from('ai_shortlists')
      .upsert({
        job_id,
        run_at:          result.run_at,
        jd_requirements: result.jd_requirements,
        shortlist:       result.shortlist,
        total_evaluated: result.total_evaluated,
        total_shortlisted: result.total_shortlisted,
        groq_model:      result.groq_model,
        created_by:      session.user.id,
      }, { onConflict: 'job_id' })   // one shortlist per job — overwrites on re-run

    if (saveError) {
      // Non-fatal — return result even if save fails, log the error
      console.error('[match-candidates] Failed to save shortlist:', saveError.message)
    }

    return NextResponse.json({ success: true, result })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[match-candidates]', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}