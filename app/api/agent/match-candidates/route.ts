// app/api/agent/match-candidates/route.ts
// POST /api/agent/match-candidates
//
// Auth: x-internal-secret header (set in useAiMatch hook).
// Plain createClient singleton cannot read browser cookies in App Router
// route handlers — session check always returns null. Secret header is the
// correct pattern for same-origin internal API routes.
//
// Add to .env.local:
//   INTERNAL_API_SECRET=any_random_string
//   NEXT_PUBLIC_INTERNAL_API_SECRET=same_value   ← browser needs to send it

import { NextRequest, NextResponse } from 'next/server'
import { analyzeJD } from '@/lib/agent/jdAnalyzer'
import { matchCandidates } from '@/lib/agent/candidateMatcher'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret')
    if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
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

    const requirements = await analyzeJD(jd_text)
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