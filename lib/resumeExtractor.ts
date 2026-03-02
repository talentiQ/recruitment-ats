// lib/resumeExtractor.ts
// Extracts clean text from PDF, Word, and text files
// Then sends to Claude AI API for intelligent parsing

export interface ParsedResume {
  education: any
  certifications: any
  linkedIn: any
  github: any
  languages: any
  location: boolean
  dateOfBirth: boolean
  full_name: string
  email: string
  phone: string
  gender: string
  date_of_birth: string
  current_location: string
  current_company: string
  current_designation: string
  total_experience: number | null
  current_ctc: number | null
  expected_ctc: number | null
  notice_period: number | null
  education_level: string
  education_degree: string
  education_field: string
  education_institution: string
  skills: string[]
  confidence: number
}

// ─────────────────────────────────────────────
// TEXT EXTRACTION PER FILE TYPE
// ─────────────────────────────────────────────

async function extractFromPDF(file: File): Promise<string> {
  try {
    // Server-side extraction via API route (avoids pdfjs worker issues)
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/extract-pdf', {
      method: 'POST',
      body: formData,
    })

    if (response.ok) {
      const { text } = await response.json()
      if (text && text.length > 30) return text
    }
  } catch (e) {
    console.warn('Server PDF extraction failed:', e)
  }

  // Fallback: read raw bytes as text (partial extraction for text-based PDFs)
  return extractAsText(file)
}

async function extractFromWord(file: File): Promise<string> {
  try {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    if (result.value && result.value.length > 30) return result.value
  } catch (e) {
    console.warn('mammoth failed:', e)
  }
  return extractAsText(file)
}

function extractAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve((e.target?.result as string) || '')
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file, 'UTF-8')
  })
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf'))  return extractFromPDF(file)
  if (name.endsWith('.docx')) return extractFromWord(file)
  return extractAsText(file) // .doc, .txt, etc.
}

// ─────────────────────────────────────────────
// CLEAN TEXT
// ─────────────────────────────────────────────
function cleanExtractedText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

// ─────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────
export async function parseResumeWithAI(file: File): Promise<ParsedResume> {
  const rawText  = await extractTextFromFile(file)
  const cleanText = cleanExtractedText(rawText)

  if (cleanText.length < 30) {
    throw new Error(
      'Could not extract readable text. Please try uploading as .docx or .txt instead of .pdf'
    )
  }

  const response = await fetch('/api/parse-resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText: cleanText }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || 'AI parsing failed')
  }

  const result = await response.json()
  if (!result.success) throw new Error(result.error || 'Parsing returned no data')

  return result.data as ParsedResume
}