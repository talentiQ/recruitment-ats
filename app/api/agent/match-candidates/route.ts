// app/api/agent/match-candidates/route.ts
// POST /api/agent/match-candidates
// Full pipeline: JD text → structured requirements → score candidates → ranked shortlist.
// Uses supabase singleton (anon key + session) — no service role.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { analyzeJD } from '@/lib/agent/jdAnalyzer'
import { matchCandidates } from '@/lib/agent/candidateMatcher'

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const { job_id, jd_text, min_score, max_results } = body

    if (!job_id || !jd_text) {
      return NextResponse.json(
        { success: false, error: 'job_id and jd_text are required' },
        { status: 400 }
      )
    }

    // Step 1: Parse JD into structured requirements
    const requirements = await analyzeJD(jd_text)

    // Step 2: Score all candidates for this job
    const result = await matchCandidates(job_id, requirements, {
      minScore:   min_score,
      maxResults: max_results,
    })

    return NextResponse.json({ success: true, result })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[match-candidates]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}