'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { parseResumeLocally, LocalParsedResume } from '@/lib/localResumeParser'
import mammoth from 'mammoth'

interface ResumeUploadProps {
  candidateId: string
  candidateName: string
  currentCandidateData: any
  onUploadComplete: (parsedData: LocalParsedResume) => void
}

// ─── Text extraction ──────────────────────────────────────────────────────────

async function extractTextFromFile(file: File): Promise<string> {
  // DOCX → mammoth
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.endsWith('.docx')
  ) {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  }

  // PDF / TXT → plain text read
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve((e.target?.result as string) ?? '')
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResumeUpload({
  candidateId,
  candidateName,
  currentCandidateData,
  onUploadComplete,
}: ResumeUploadProps) {
  const [uploading, setUploading]       = useState(false)
  const [parsing, setParsing]           = useState(false)
  const [progress, setProgress]         = useState(0)
  const [parsedData, setParsedData]     = useState<LocalParsedResume | null>(null)
  const [showParsedData, setShowParsedData] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]
    if (!validTypes.includes(file.type)) {
      alert('Please upload only PDF, Word, or Text documents')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB')
      return
    }

    setUploading(true)
    setProgress(5)

    try {
      // ── Step 1: Extract text then parse ─────────────────────────────────────
      setParsing(true)
      setProgress(15)

      const resumeText = await extractTextFromFile(file)   // FIX: extract first
      const parsed = parseResumeLocally(resumeText)        // FIX: correct fn name + pass string

      setProgress(30)
      setParsedData(parsed)
      setParsing(false)

      // ── Step 2: Upload to Supabase Storage ───────────────────────────────────
      const fileExt  = file.name.split('.').pop()
      const fileName = `${candidateId}_${Date.now()}.${fileExt}`
      const filePath = `resumes/${fileName}`

      setProgress(50)

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, file)
      if (uploadError) throw uploadError

      setProgress(70)

      const { data: urlData } = supabase.storage
        .from('resumes')
        .getPublicUrl(filePath)

      setProgress(80)

      // ── Step 3: Update candidate record ──────────────────────────────────────
      const updateData: Record<string, any> = {
        resume_url:          urlData.publicUrl,
        resume_file_name:    file.name,
        resume_file_size:    file.size,
        resume_uploaded_at:  new Date().toISOString(),
        resume_parsed:       true,
        resume_parse_date:   new Date().toISOString(),
        last_activity_date:  new Date().toISOString(),

        // FIX: use correct field names from LocalParsedResume
        parsed_skills:       parsed.skills,
        education_level:     parsed.education_level,
        education_degree:    parsed.education_degree,
        education_field:     parsed.education_field,
        education_institution: parsed.education_institution,
        sector:              parsed.sector,

        // Auto-fill only if not already present on the candidate record
        ...(parsed.email        && !currentCandidateData.email             && { email: parsed.email }),
        ...(parsed.phone        && !currentCandidateData.phone             && { phone: parsed.phone }),
        ...(parsed.current_location && !currentCandidateData.current_location && { current_location: parsed.current_location }), // FIX: was parsed.location
        ...(parsed.date_of_birth && !currentCandidateData.date_of_birth   && { date_of_birth: parsed.date_of_birth }),           // FIX: was parsed.dateOfBirth
        ...(parsed.gender       && !currentCandidateData.gender            && { gender: parsed.gender }),
        ...(parsed.current_company && !currentCandidateData.current_company && { current_company: parsed.current_company }),
        ...(parsed.current_designation && !currentCandidateData.current_designation && { current_designation: parsed.current_designation }),
        ...(parsed.total_experience !== null && !currentCandidateData.total_experience && { total_experience: parsed.total_experience }),
        ...(parsed.notice_period !== null    && !currentCandidateData.notice_period    && { notice_period: parsed.notice_period }),
        ...(parsed.current_ctc  !== null && !currentCandidateData.current_ctc  && { current_ctc: parsed.current_ctc }),
        ...(parsed.expected_ctc !== null && !currentCandidateData.expected_ctc && { expected_ctc: parsed.expected_ctc }),
      }

      const { error: updateError } = await supabase
        .from('candidates')
        .update(updateData)
        .eq('id', candidateId)
      if (updateError) throw updateError

      setProgress(90)

      // ── Step 4: Timeline entry ────────────────────────────────────────────────
      const userData = JSON.parse(localStorage.getItem('user') || '{}')

      await supabase.from('candidate_timeline').insert([{
        candidate_id:         candidateId,
        activity_type:        'resume_uploaded',
        activity_title:       'Resume Uploaded',
        activity_description: `Resume "${file.name}" uploaded and parsed successfully`,
        metadata: {
          file_name:     file.name,
          file_size:     file.size,
          skills_found:  parsed.skills.length,
          confidence:    parsed.confidence,
          sector:        parsed.sector,
        },
        performed_by: userData.id,
      }])

      setProgress(100)
      setShowParsedData(true)

      setTimeout(() => {
        alert('✅ Resume uploaded and parsed successfully!')
        onUploadComplete(parsed)
      }, 500)

    } catch (error: any) {
      console.error('Upload error:', error)
      alert('Error uploading resume: ' + error.message)
    } finally {
      setUploading(false)
      setParsing(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload Resume (PDF, Word, or Text)
        </label>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          onChange={handleFileUpload}
          disabled={uploading}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-lg file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{parsing ? '📄 Parsing resume...' : '📤 Uploading...'}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {showParsedData && parsedData && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold text-green-900 mb-3">
            ✅ Parsed Information from Resume
            <span className="ml-2 text-xs font-normal text-green-700">
              ({Math.round(parsedData.confidence * 100)}% confidence)
            </span>
          </h4>
          <div className="space-y-2 text-sm">

            {parsedData.skills.length > 0 && (
              <div>
                <span className="font-medium text-gray-700">Skills Found:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {parsedData.skills.slice(0, 10).map((skill, i) => (
                    <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                      {skill}
                    </span>
                  ))}
                  {parsedData.skills.length > 10 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                      +{parsedData.skills.length - 10} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {parsedData.email && (
              <div><span className="font-medium text-gray-700">Email:</span>{' '}{parsedData.email}</div>
            )}
            {parsedData.phone && (
              <div><span className="font-medium text-gray-700">Phone:</span>{' '}{parsedData.phone}</div>
            )}
            {/* FIX: was parsed.location → parsed.current_location */}
            {parsedData.current_location && (
              <div><span className="font-medium text-gray-700">Location:</span>{' '}{parsedData.current_location}</div>
            )}
            {parsedData.current_company && (
              <div><span className="font-medium text-gray-700">Company:</span>{' '}{parsedData.current_company}</div>
            )}
            {parsedData.current_designation && (
              <div><span className="font-medium text-gray-700">Designation:</span>{' '}{parsedData.current_designation}</div>
            )}
            {parsedData.total_experience !== null && (
              <div><span className="font-medium text-gray-700">Experience:</span>{' '}{parsedData.total_experience} yrs</div>
            )}
            {parsedData.education_degree && (
              <div>
                <span className="font-medium text-gray-700">Education:</span>{' '}
                {[parsedData.education_degree, parsedData.education_field, parsedData.education_institution]
                  .filter(Boolean).join(' — ')}
              </div>
            )}
            {/* NOTE: linkedIn / github / languages are NOT in localResumeParser v4 */}
          </div>
        </div>
      )}
    </div>
  )
}
