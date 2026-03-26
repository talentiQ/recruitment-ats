// app/api/parse-resume/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { parseResumeLocally } from '@/lib/localResumeParser'
import mammoth from 'mammoth'

// ── CORS headers ──────────────────────────────────────────────────────────────
// Required for Chrome extension sidebar (chrome-extension:// origin)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Handle preflight OPTIONS request
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

async function extractText(file: File): Promise<string> {
  const fileName = (file.name || '').toLowerCase()
  const buffer   = Buffer.from(await file.arrayBuffer())

  if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  }

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

  return buffer.toString('utf-8')
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    let resumeText = ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File
      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400, headers: CORS_HEADERS }
        )
      }
      resumeText = await extractText(file)

    } else if (contentType.includes('application/json')) {
      const body = await request.json()
      resumeText = body.resumeText || body.text || ''
      if (resumeText.startsWith('%PDF')) {
        return NextResponse.json(
          { error: 'Send file via multipart/form-data, not raw bytes.' },
          { status: 400, headers: CORS_HEADERS }
        )
      }
    }

    if (!resumeText || resumeText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Could not extract text from resume' },
        { status: 400, headers: CORS_HEADERS }
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

    return NextResponse.json(
      { success: true, data: result, rawText: resumeText },
      { headers: CORS_HEADERS }
    )

  } catch (error: any) {
    console.error('Resume parse error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}