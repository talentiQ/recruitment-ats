// components/ResumeUpload.tsx - ENHANCED VERSION
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { parseResumeWithAI } from '@/lib/resumeExtractor'

interface ResumeUploadProps {
  candidateId: string
  candidateName: string
  currentCandidateData: any
  onUploadComplete: (parsedData: any) => void
}

export default function ResumeUpload({ 
  candidateId, 
  candidateName, 
  currentCandidateData,
  onUploadComplete 
}: ResumeUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [parsedData, setParsedData] = useState<any>(null)
  const [showParsedData, setShowParsedData] = useState(false)

  const parseResumeFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string
          
          // For PDFs and Word docs, we'd use proper libraries
          // For now, handle text extraction based on file type
          if (file.type === 'application/pdf') {
            // Would use pdf.js here
            resolve(text) // Placeholder
          } else if (file.type.includes('word')) {
            // Would use mammoth.js here
            resolve(text) // Placeholder
          } else {
            resolve(text)
          }
        } catch (error) {
          reject(error)
        }
      }
      
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = [
      'application/pdf', 
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]
    
    if (!validTypes.includes(file.type)) {
      alert('Please upload only PDF, Word, or Text documents')
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB')
      return
    }

    setUploading(true)
    setProgress(5)

    try {
      // Step 1: Parse resume content
      setParsing(true)
      setProgress(15)
      
      const resumeText = await parseResumeFile(file)
      const parsed = await parseResumeWithAI(file)
      
      setProgress(30)
      setParsedData(parsed)
      
      // Step 2: Upload to Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${candidateId}_${Date.now()}.${fileExt}`
      const filePath = `resumes/${fileName}`

      setProgress(50)

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      setProgress(70)

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('resumes')
        .getPublicUrl(filePath)

      setProgress(80)

      // Step 3: Update candidate with resume URL and parsed data
      const updateData = {
        resume_url: urlData.publicUrl,
        resume_file_name: file.name,
        resume_file_size: file.size,
        resume_uploaded_at: new Date().toISOString(),
        resume_parsed: true,
        resume_parse_date: new Date().toISOString(),
        parsed_skills: parsed.skills,
        parsed_education: parsed.education,
        parsed_certifications: parsed.certifications,
        linkedin_url: parsed.linkedIn,
        github_url: parsed.github,
        languages_known: parsed.languages,
        last_activity_date: new Date().toISOString(),
        
        // Auto-fill if not already present
        ...(parsed.email && !currentCandidateData.email && { email: parsed.email }),
        ...(parsed.phone && !currentCandidateData.phone && { phone: parsed.phone }),
        ...(parsed.location && !currentCandidateData.current_location && { current_location: parsed.location }),
        ...(parsed.dateOfBirth && !currentCandidateData.date_of_birth && { date_of_birth: parsed.dateOfBirth }),
      }

      const { error: updateError } = await supabase
        .from('candidates')
        .update(updateData)
        .eq('id', candidateId)

      if (updateError) throw updateError

      setProgress(90)

      // Step 4: Add to timeline
      const userData = JSON.parse(localStorage.getItem('user') || '{}')
      
      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidateId,
        activity_type: 'resume_uploaded',
        activity_title: 'Resume Uploaded',
        activity_description: `Resume "${file.name}" uploaded and parsed successfully`,
        metadata: {
          file_name: file.name,
          file_size: file.size,
          skills_found: parsed.skills.length,
          parsed_fields: Object.keys(parsed).filter(k => parsed[k as keyof typeof parsed])
        },
        performed_by: userData.id
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
            <span>
              {parsing ? '📄 Parsing resume...' : '📤 Uploading...'}
            </span>
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

      {/* Show parsed data preview */}
      {showParsedData && parsedData && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold text-green-900 mb-3">
            ✅ Parsed Information from Resume
          </h4>
          <div className="space-y-2 text-sm">
            {parsedData.skills.length > 0 && (
              <div>
                <span className="font-medium text-gray-700">Skills Found:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {parsedData.skills.slice(0, 10).map((skill: string, i: number) => (
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
              <div>
                <span className="font-medium text-gray-700">Email:</span>{' '}
                <span className="text-gray-900">{parsedData.email}</span>
              </div>
            )}
            {parsedData.phone && (
              <div>
                <span className="font-medium text-gray-700">Phone:</span>{' '}
                <span className="text-gray-900">{parsedData.phone}</span>
              </div>
            )}
            {parsedData.location && (
              <div>
                <span className="font-medium text-gray-700">Location:</span>{' '}
                <span className="text-gray-900">{parsedData.location}</span>
              </div>
            )}
            {parsedData.linkedIn && (
              <div>
                <span className="font-medium text-gray-700">LinkedIn:</span>{' '}
                <a href={parsedData.linkedIn} target="_blank" className="text-blue-600 hover:underline">
                  {parsedData.linkedIn}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}