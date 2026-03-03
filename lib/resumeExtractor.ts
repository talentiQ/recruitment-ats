// lib/resumeExtractor.ts
// Sends the file directly as FormData — no client-side reading needed

export async function parseResumeWithAI(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/parse-resume', {
    method: 'POST',
    // DO NOT set Content-Type header — browser sets it automatically with boundary
    body: formData,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `Parse failed (${response.status})`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.error || 'Parsing failed')
  }

  return result.data
}