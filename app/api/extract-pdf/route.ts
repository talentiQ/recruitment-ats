// app/api/extract-pdf/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)

    return NextResponse.json({ 
      success: true, 
      text: data.text,
      pages: data.numpages
    })

  } catch (error: any) {
    console.error('PDF extraction error:', error)
    return NextResponse.json(
      { error: 'PDF extraction failed: ' + error.message },
      { status: 500 }
    )
  }
}