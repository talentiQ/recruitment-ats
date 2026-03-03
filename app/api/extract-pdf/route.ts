// app/api/extract-pdf/route.ts  v2 — uses Python pdfplumber for accurate column extraction
import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import mammoth from 'mammoth'

const execFileAsync = promisify(execFile)

export async function POST(request: NextRequest) {
  const tmpPath = join('/tmp', `resume_${Date.now()}.pdf`)
  
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const fileName = file.name?.toLowerCase() || ''
    const buffer = Buffer.from(await file.arrayBuffer())

    // ── DOCX: use mammoth (works great) ─────────────────────────────────────
    if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      const result = await mammoth.extractRawText({ buffer })
      return NextResponse.json({ success: true, text: result.value, method: 'mammoth' })
    }

    // ── PDF: use pdfplumber via Python (handles multi-column layouts) ────────
    if (fileName.endsWith('.pdf')) {
      await writeFile(tmpPath, buffer)
      
      try {
        const { stdout, stderr } = await execFileAsync(
          'python3',
          ['scripts/extract_pdf.py', tmpPath],
          { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }
        )
        
        if (stderr && stderr.startsWith('ERROR:')) {
          throw new Error(stderr.replace('ERROR:', '').trim())
        }
        
        const text = stdout.trim()
        if (!text || text.length < 50) {
          throw new Error('Extracted text too short — PDF may be image-based')
        }
        
        return NextResponse.json({ success: true, text, method: 'pdfplumber' })
        
      } finally {
        await unlink(tmpPath).catch(() => {})
      }
    }

    return NextResponse.json({ error: 'Unsupported file type. Please upload PDF or DOCX.' }, { status: 400 })

  } catch (error: any) {
    await unlink(tmpPath).catch(() => {})
    console.error('PDF extraction error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}