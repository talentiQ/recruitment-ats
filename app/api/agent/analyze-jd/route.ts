// app/api/agent/analyze-jd/route.ts
// POST /api/agent/analyze-jd
//
// Parses a raw JD text into structured requirements.
// Called from the "Run AI Match" button on the job detail page.
//
// Request body:
//   { jd_text: string }
//
// Response:
//   { success: true,  requirements: JdRequirements }
//   { success: false, error: string }
//
// Auth: requires valid Supabase session (same as rest of Talent IQ)

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { analyzeJD } from '@/lib/agent/jdAnalyzer'

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
    const { jd_text } = body

    if (!jd_text || typeof jd_text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'jd_text is required' },
        { status: 400 }
      )
    }

    // ── Run JD Analyzer ───────────────────────────────────────────────────────
    const requirements = await analyzeJD(jd_text)

    return NextResponse.json({ success: true, requirements })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analyze-jd]', message)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}