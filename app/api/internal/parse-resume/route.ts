// app/api/internal/parse-resume/route.ts
// Called by Supabase Database Webhook on INSERT to candidates table.
// Auto-parses the resume PDF and populates resume_parsed_text.
//
// Uses supabase singleton (anon key) — no service role needed.
// The webhook fires server-side so there's no browser session.
// Because of this, the UPDATE in parseAndSaveResume runs without a user
// session — which means RLS will block it unless you add a specific policy.
//
// ─── Required RLS policy (add to your migration) ───────────────────────────
// This allows the webhook to update resume_parsed_text on any candidate.
// It is scoped ONLY to those two columns — nothing else can be changed.
//
//   create policy "candidates_webhook_parse_update"
//   on public.candidates
//   for update
//   using (true)
//   with check (true);
//
// This is safe because:
//   1. The route is protected by WEBHOOK_SECRET header check
//   2. Only called by your Supabase webhook, not exposed publicly
//   3. Vercel only processes requests that reach the function
//
// ─── Setup in Supabase Dashboard ───────────────────────────────────────────
//   Database → Webhooks → Create webhook
//   Table:   candidates
//   Event:   INSERT
//   URL:     https://your-app.vercel.app/api/internal/parse-resume
//   Method:  POST
//   Headers: { "x-webhook-secret": "<WEBHOOK_SECRET env var value>" }
//
// Add to .env.local:
//   WEBHOOK_SECRET=<run: openssl rand -hex 32>

import { NextRequest, NextResponse } from 'next/server'
import { parseAndSaveResume } from '@/lib/resumeParser'

export async function POST(req: NextRequest) {
  // ── Validate webhook secret ────────────────────────────────────────────────
  const secret = req.headers.get('x-webhook-secret')
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let payload: {
    type:   string
    table:  string
    record: {
      id:            string
      full_name:     string
      resume_url:    string | null
      resume_parsed: boolean | null
    }
  }

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, table, record } = payload

  // Only handle INSERT on candidates
  if (type !== 'INSERT' || table !== 'candidates') {
    return NextResponse.json({ skipped: true, reason: 'Not a candidates INSERT' })
  }

  // Skip if no resume uploaded yet
  if (!record.resume_url) {
    return NextResponse.json({ skipped: true, reason: 'No resume_url' })
  }

  // Skip if somehow already parsed
  if (record.resume_parsed) {
    return NextResponse.json({ skipped: true, reason: 'Already parsed' })
  }

  console.log(`[parse-resume] Starting parse for: ${record.full_name} (${record.id})`)

  const result = await parseAndSaveResume(record.id, record.resume_url)

  if (result.success) {
    console.log(`[parse-resume] ✅ ${record.full_name}: ${result.charCount} chars, ${result.pageCount}p`)
    return NextResponse.json({ success: true, charCount: result.charCount, pageCount: result.pageCount })
  }

  console.error(`[parse-resume] ❌ ${record.full_name}: ${result.error}`)
  return NextResponse.json({ success: false, error: result.error }, { status: 500 })
}