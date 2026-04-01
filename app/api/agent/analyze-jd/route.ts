// app/api/agent/analyze-jd/route.ts
// POST /api/agent/analyze-jd
// Uses supabase singleton (anon key + session) — no service role.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { analyzeJD } from '@/lib/agent/jdAnalyzer'

export async function POST(req: NextRequest) {
  try {
    // Auth check using your singleton
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const { jd_text } = body

    if (!jd_text || typeof jd_text !== 'string' || jd_text.trim().length < 30) {
      return NextResponse.json(
        { success: false, error: 'jd_text is required (min 30 characters)' },
        { status: 400 }
      )
    }

    const requirements = await analyzeJD(jd_text)
    return NextResponse.json({ success: true, requirements })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[analyze-jd]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}