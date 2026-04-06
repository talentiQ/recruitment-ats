// app/api/agent/match-candidates/route.ts
// Uses dualSourceMatch — now powered by internal resumeMatchEngine (NO GROQ)

import { NextRequest, NextResponse } from 'next/server'
import { analyzeJD } from '@/lib/agent/jdAnalyzer'
import { dualSourceMatch } from '@/lib/agent/dualSourceMatcher'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret')

    if (
      !process.env.INTERNAL_API_SECRET ||
      secret !== process.env.INTERNAL_API_SECRET
    ) {
      return NextResponse.json(
        { success: false, error: 'Unauthorised' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { job_id, jd_text, max_results } = body

    if (!job_id || !jd_text) {
      return NextResponse.json(
        { success: false, error: 'job_id and jd_text are required' },
        { status: 400 }
      )
    }

    // ✅ Step 1: Parse JD
    const requirements = await analyzeJD(jd_text)

    // ✅ Step 2: Dual-source match (NO minScore anymore)
    const result = await dualSourceMatch(job_id, requirements, {
      maxResults: max_results,
    })

    return NextResponse.json({ success: true, result })

  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown error'

    console.error('[match-candidates]', message)

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}