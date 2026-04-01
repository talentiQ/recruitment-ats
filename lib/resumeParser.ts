// lib/resumeParser.ts
// Fetches a resume PDF from Supabase Storage, extracts raw text,
// saves it back to candidates.resume_parsed_text.
//
// Auth pattern: uses your existing supabase singleton (anon key + session).
// Storage download works with anon key if the bucket policy allows
// authenticated reads — which it does since your app already shows resumes.
//
// Install once:
//   npm install pdf-parse
//   npm install -D @types/pdf-parse
//
// Two entry points:
//   parseAndSaveResume(candidateId, resumeUrl) — fetches, parses, saves
//   getOrParseResumeText(candidate)            — returns text, parsing on-demand if needed

import { supabase } from '@/lib/supabase'
// @ts-ignore — pdf-parse types are incomplete
import pdfParse from 'pdf-parse'

export interface ParseResult {
  candidateId: string
  text:        string
  pageCount:   number
  charCount:   number
  success:     boolean
  error?:      string
}

// ─── Extract bucket + path from resume_url ────────────────────────────────────
// Handles two URL formats your app may produce:
//   A) Full public URL:
//      https://xxx.supabase.co/storage/v1/object/public/resumes/folder/file.pdf
//   B) Relative storage path:
//      resumes/abc123/file.pdf

function parseStorageUrl(resumeUrl: string): { bucket: string; path: string } {
  const marker = '/storage/v1/object/'

  if (resumeUrl.includes(marker)) {
    const afterMarker = resumeUrl.split(marker)[1]
    // afterMarker = "public/resumes/folder/file.pdf"
    const parts  = afterMarker.split('/')
    parts.shift()                    // remove "public" or "authenticated"
    const bucket = parts.shift()!    // first segment = bucket name
    const path   = parts.join('/')
    return { bucket, path }
  }

  // Plain "bucket/path/file.pdf" format
  const parts  = resumeUrl.split('/')
  const bucket = parts.shift()!
  const path   = parts.join('/')
  return { bucket, path }
}

// ─── Fetch PDF buffer from Supabase Storage ───────────────────────────────────

async function fetchPdfBuffer(resumeUrl: string): Promise<Buffer> {
  const { bucket, path } = parseStorageUrl(resumeUrl)

  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path)

  if (error) throw new Error(`Storage download failed: ${error.message}`)
  if (!data)  throw new Error('Storage returned empty file')

  return Buffer.from(await data.arrayBuffer())
}

// ─── Extract text from PDF buffer ─────────────────────────────────────────────

async function extractText(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const result = await pdfParse(buffer)

  let text = result.text || ''

  // Basic cleanup — pdf-parse produces long runs of spaces in columnar PDFs
  text = text
    .replace(/[ \t]{3,}/g, '  ')   // collapse 3+ spaces → 2
    .replace(/\n{4,}/g, '\n\n\n')  // collapse 4+ newlines → 3
    .trim()

  return { text, pageCount: result.numpages }
}

// ─── Main: parse resume PDF and save raw text to candidates table ─────────────

export async function parseAndSaveResume(
  candidateId: string,
  resumeUrl:   string
): Promise<ParseResult> {
  try {
    // 1. Download PDF from Storage
    const buffer = await fetchPdfBuffer(resumeUrl)

    // 2. Extract raw text
    const { text, pageCount } = await extractText(buffer)

    if (!text || text.length < 50) {
      throw new Error(
        'Extracted text too short — PDF may be image-based or password protected'
      )
    }

    // 3. Save to candidates table using your supabase singleton
    //    RLS allows this because the recruiter's session is active
    const { error: updateError } = await supabase
      .from('candidates')
      .update({
        resume_parsed_text: text,
        resume_parsed:      true,
        resume_parse_date:  new Date().toISOString(),
      })
      .eq('id', candidateId)

    if (updateError) {
      throw new Error(`DB update failed: ${updateError.message}`)
    }

    return { candidateId, text, pageCount, charCount: text.length, success: true }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown parse error'

    // Mark as attempted — prevents infinite retry loops
    await supabase
      .from('candidates')
      .update({
        resume_parsed:     true,
        resume_parse_date: new Date().toISOString(),
      })
      .eq('id', candidateId)

    return { candidateId, text: '', pageCount: 0, charCount: 0, success: false, error: message }
  }
}

// ─── Get resume text — parse on demand if not yet parsed ─────────────────────
// Used by candidateMatcher so it never scores a candidate with empty text.

export async function getOrParseResumeText(candidate: {
  id:                 string
  resume_parsed_text: string | null
  resume_url:         string | null
  resume_parsed:      boolean | null
}): Promise<string> {
  // Already has usable text
  if (candidate.resume_parsed_text && candidate.resume_parsed_text.length > 100) {
    return candidate.resume_parsed_text
  }

  // No file to parse
  if (!candidate.resume_url) return ''

  // Parse on demand — save result to DB, return text
  const result = await parseAndSaveResume(candidate.id, candidate.resume_url)
  return result.text
}