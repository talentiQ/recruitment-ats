// app/api/parse-resume/route.ts
// Reverted to pdf-parse — pdfjs-dist has irreconcilable compatibility issues
// with Next.js/Turbopack (serverExternalPackages conflict, worker setup fails).
// pdf-parse@1.1.1 is stable, works on Vercel, no worker required.

import { NextRequest, NextResponse } from 'next/server'
import { parseResumeLocally } from '@/lib/localResumeParser'
import mammoth from 'mammoth'

async function extractText(file: File): Promise<string> {
  const fileName = (file.name || '').toLowerCase()
  const buffer   = Buffer.from(await file.arrayBuffer())

  // DOCX → mammoth (best accuracy, no issues)
  if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  }

  // PDF → pdf-parse@1.1.1 (stable, Vercel-compatible, simple function API)
  if (fileName.endsWith('.pdf')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse')
      const data     = await pdfParse(buffer)
      return data.text || ''
    } catch (e: any) {
      throw new Error('Could not read PDF: ' + e.message)
    }
  }

  // Plain text fallback
  return buffer.toString('utf-8')
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    let resumeText = ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File
      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      resumeText = await extractText(file)

    } else if (contentType.includes('application/json')) {
      const body = await request.json()
      resumeText = body.resumeText || body.text || ''
      if (resumeText.startsWith('%PDF')) {
        return NextResponse.json(
          { error: 'Send file via multipart/form-data, not raw bytes.' },
          { status: 400 }
        )
      }
    }

    if (!resumeText || resumeText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Could not extract text from resume' },
        { status: 400 }
      )
    }

    console.log('\n========== RESUME TEXT (first 600 chars) ==========')
    console.log(resumeText.slice(0, 600))
    console.log('===================================================\n')

    const result = parseResumeLocally(resumeText)
    console.log(
      `✅ confidence: ${(result.confidence * 100).toFixed(0)}%` +
      ` | skills: ${result.skills.length}` +
      ` | sector: ${result.sector}` +
      ` | company: "${result.current_company}"` +
      ` | designation: "${result.current_designation}"`
    )

    return NextResponse.json({ success: true, data: result, rawText: resumeText })

  } catch (error: any) {
    console.error('Resume parse error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}