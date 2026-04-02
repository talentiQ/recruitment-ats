// app/api/agent/analyze-jd/route.ts
// POST /api/agent/analyze-jd
// Auth: x-internal-secret header.

import { NextRequest, NextResponse } from 'next/server'
import { analyzeJD } from '@/lib/agent/jdAnalyzer'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret')
    if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const { jd_text } = body

    if (!jd_text || typeof jd_text !== 'string' || jd_text.trim().length < 30) {
      return NextResponse.json(
        { success: false, error: 'jd_text is required (min 30 chars)' },
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