// scripts/backfillResumeParsing.ts
// Parses all existing candidates with null resume_parsed_text.
// Uses anon key + your Supabase login — no service role needed.
//
// Run with:
//   npx tsx scripts/backfillResumeParsing.ts
//
// Required in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//   BACKFILL_EMAIL     ← your Talent IQ login email (remove after backfill)
//   BACKFILL_PASSWORD  ← your Talent IQ login password (remove after backfill)

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import pdfParse from 'pdf-parse'

dotenv.config({ path: '.env.local' })

const BATCH_SIZE  = 5
const BATCH_DELAY = 2000

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function parseStorageUrl(resumeUrl: string): { bucket: string; path: string } {
  const marker = '/storage/v1/object/'
  if (resumeUrl.includes(marker)) {
    const afterMarker = resumeUrl.split(marker)[1]
    const parts  = afterMarker.split('/')
    parts.shift()
    const bucket = parts.shift()!
    const path   = parts.join('/')
    return { bucket, path }
  }
  const parts  = resumeUrl.split('/')
  const bucket = parts.shift()!
  const path   = parts.join('/')
  return { bucket, path }
}

async function main() {
  const url      = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const email    = process.env.BACKFILL_EMAIL
  const password = process.env.BACKFILL_PASSWORD

  if (!url || !anonKey) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing')
    process.exit(1)
  }
  if (!email || !password) {
    console.error('❌ Add these to .env.local temporarily:')
    console.error('   BACKFILL_EMAIL=your@email.com')
    console.error('   BACKFILL_PASSWORD=yourpassword')
    process.exit(1)
  }

  const supabase = createClient(url, anonKey)

  // Sign in to get a session — Storage + DB reads use this session
  console.log(`🔐 Signing in as ${email}...`)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })

  if (authError || !authData.session) {
    console.error('❌ Login failed:', authError?.message ?? 'No session returned')
    process.exit(1)
  }
  console.log('✅ Signed in\n')

  // Fetch all candidates with unparsed resumes
  console.log('🔍 Fetching candidates...\n')
  const { data: candidates, error: fetchError } = await supabase
    .from('candidates')
    .select('id, full_name, resume_url, resume_parsed, resume_parsed_text')
    .not('resume_url', 'is', null)
    .or('resume_parsed.is.null,resume_parsed.eq.false')
    .order('created_at', { ascending: false })

  if (fetchError) { console.error('❌ Fetch failed:', fetchError.message); process.exit(1) }
  if (!candidates?.length) { console.log('✅ Nothing to parse.'); process.exit(0) }

  const toParse = candidates.filter(c => !c.resume_parsed_text || c.resume_parsed_text.length < 100)
  console.log(`📋 ${toParse.length} candidates to parse\n${'─'.repeat(50)}`)

  const stats = { success: 0, failed: 0, skipped: 0 }
  const failures: string[] = []

  for (let i = 0; i < toParse.length; i += BATCH_SIZE) {
    const batch = toParse.slice(i, i + BATCH_SIZE)
    console.log(`\n📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toParse.length / BATCH_SIZE)}`)

    await Promise.all(batch.map(async c => {
      if (!c.resume_url) { stats.skipped++; console.log(`  ⏭  ${c.full_name} — no URL`); return }

      try {
        const { bucket, path } = parseStorageUrl(c.resume_url)

        const { data: fileData, error: dlError } = await supabase.storage
          .from(bucket)
          .download(path)

        if (dlError) throw new Error(`Download: ${dlError.message}`)
        if (!fileData) throw new Error('Empty file')

        const buffer = Buffer.from(await fileData.arrayBuffer())
        const parsed = await pdfParse(buffer)
        let text = (parsed.text || '').replace(/[ \t]{3,}/g, '  ').replace(/\n{4,}/g, '\n\n\n').trim()

        if (text.length < 50) throw new Error('Text too short — likely image-based PDF')

        const { error: updateError } = await supabase
          .from('candidates')
          .update({
            resume_parsed_text: text,
            resume_parsed:      true,
            resume_parse_date:  new Date().toISOString(),
          })
          .eq('id', c.id)

        if (updateError) throw new Error(`DB update: ${updateError.message}`)

        stats.success++
        console.log(`  ✅ ${c.full_name} — ${text.length} chars, ${parsed.numpages}p`)

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown'
        stats.failed++
        failures.push(`${c.full_name} (${c.id}): ${message}`)
        console.log(`  ❌ ${c.full_name} — ${message}`)

        await supabase
          .from('candidates')
          .update({ resume_parsed: true, resume_parse_date: new Date().toISOString() })
          .eq('id', c.id)
      }
    }))

    if (i + BATCH_SIZE < toParse.length) await sleep(BATCH_DELAY)
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`📊 Done — ✅ ${stats.success} parsed · ❌ ${stats.failed} failed · ⏭ ${stats.skipped} skipped`)

  if (failures.length) {
    console.log('\n⚠️  Failed:')
    failures.forEach(f => console.log(`   • ${f}`))
    console.log('\nRe-run to retry. Image PDFs need manual text entry.')
  }

  await supabase.auth.signOut()
  console.log('\n🔐 Signed out. Remove BACKFILL_EMAIL + BACKFILL_PASSWORD from .env.local.')
  process.exit(0)
}

main().catch(err => { console.error('💥 Fatal:', err); process.exit(1) })