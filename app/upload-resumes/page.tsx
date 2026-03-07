// app/upload-resumes/page.tsx - COMPLETE UPLOAD INTERFACE
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { normalizeSkills } from '@/lib/skillNormalization'

interface ParsedResume {
  fileName: string
  file: File
  status: 'pending' | 'parsing' | 'success' | 'error' | 'duplicate'
  progress: number
  error?: string
  parsedData?: {
    full_name?: string
    phone?: string
    email?: string
    current_company?: string
    current_designation?: string
    total_experience?: number
    relevant_experience?: number
    current_location?: string
    preferred_location?: string
    current_ctc?: number
    expected_ctc?: number
    notice_period?: number
    key_skills?: string[]
    education_level?: string
    highest_degree?: string
  }
  duplicateInfo?: {
    found_in: 'candidates' | 'resume_bank'
    record_id: string
    full_name: string
  }
}

export default function UploadResumesPage() {
  const [user, setUser] = useState<any>(null)
  const [files, setFiles] = useState<ParsedResume[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
  }, [])

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    addFiles(droppedFiles)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      addFiles(selectedFiles)
    }
  }

  const addFiles = (newFiles: File[]) => {
    // Accept PDF and Word formats
    const allowedTypes = [
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
    ]
    
    const validFiles = newFiles.filter(file => allowedTypes.includes(file.type))
    
    if (validFiles.length !== newFiles.length) {
      alert('Only PDF and Word (.doc, .docx) files are allowed!')
    }

    const parsedFiles: ParsedResume[] = validFiles.map(file => ({
      fileName: file.name,
      file: file,
      status: 'pending',
      progress: 0
    }))

    setFiles(prev => [...prev, ...parsedFiles])
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const checkDuplicate = async (phone: string, email: string) => {
    try {
      // Check in candidates table
      const { data: candidateMatch } = await supabase
        .from('candidates')
        .select('id, full_name, phone, email')
        .or(`phone.eq.${phone},email.eq.${email}`)
        .limit(1)
        .single()

      if (candidateMatch) {
        return {
          found_in: 'candidates' as const,
          record_id: candidateMatch.id,
          full_name: candidateMatch.full_name
        }
      }

      // Check in resume_bank
      const { data: resumeMatch } = await supabase
        .from('resume_bank')
        .select('id, full_name, phone, email')
        .eq('status', 'available')
        .or(`phone.eq.${phone},email.eq.${email}`)
        .limit(1)
        .single()

      if (resumeMatch) {
        return {
          found_in: 'resume_bank' as const,
          record_id: resumeMatch.id,
          full_name: resumeMatch.full_name
        }
      }

      return null
    } catch (error) {
      return null
    }
  }

  const parseResume = async (file: File): Promise<any> => {
    // Using your existing parser from /api/parse-resume
    const formData = new FormData()
    formData.append('file', file) // Your API expects 'file' field

    try {
      const response = await fetch('/api/parse-resume', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to parse resume')
      }

      const result = await response.json()
      
      if (!result.success || !result.data) {
        throw new Error('Parser returned invalid response')
      }

      // Map your parser's response to our expected format
      const data = result.data
      return {
        full_name: data.name || data.full_name || '',
        phone: data.phone || data.mobile || data.contact || '',
        email: data.email || '',
        current_company: data.company || data.current_company || data.organization || '',
        current_designation: data.designation || data.title || data.role || data.position || '',
        total_experience: data.total_experience || data.experience || data.years_of_experience || 0,
        relevant_experience: data.relevant_experience || 0,
        current_location: data.location || data.city || data.current_location || '',
        preferred_location: data.preferred_location || '',
        current_ctc: data.current_ctc || data.current_salary || 0,
        expected_ctc: data.expected_ctc || data.expected_salary || 0,
        notice_period: data.notice_period || 0,
        key_skills: data.skills || data.key_skills || [],
        education_level: data.education || data.education_level || '',
        highest_degree: data.degree || data.highest_degree || '',
        // Store additional fields if available
        sector: data.sector || '',
        confidence: data.confidence || 0
      }
    } catch (error: any) {
      console.error('Parse error:', error)
      throw error
    }
  }

  const uploadToStorage = async (file: File): Promise<string> => {
    // Generate UUID for storage filename
    const uuid = crypto.randomUUID()
    
    // Get file extension
    const fileExtension = file.name.split('.').pop()
    
    // Storage filename: UUID + extension
    const storageFileName = `${uuid}.${fileExtension}`
    const filePath = `resume_bank/${storageFileName}`

    const { data, error } = await supabase.storage
      .from('resumes') // Using existing bucket
      .upload(filePath, file)

    if (error) {
      console.error('Storage upload error:', error)
      throw error
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('resumes')
      .getPublicUrl(filePath)

    return urlData.publicUrl
  }

  const saveToResumeBank = async (
    resumeUrl: string,
    parsedData: any,
    fileName: string
  ) => {
    const { data, error } = await supabase
      .from('resume_bank')
      .insert({
        resume_url: resumeUrl,
        resume_file_name: fileName,
        parsed_data: parsedData,
        full_name: parsedData.full_name,
        phone: parsedData.phone,
        email: parsedData.email,
        current_company: parsedData.current_company,
        current_designation: parsedData.current_designation,
        total_experience: parsedData.total_experience,
        relevant_experience: parsedData.relevant_experience,
        current_location: parsedData.current_location,
        preferred_location: parsedData.preferred_location,
        current_ctc: parsedData.current_ctc,
        expected_ctc: parsedData.expected_ctc,
        notice_period: parsedData.notice_period,
        key_skills: parsedData.key_skills || [],
        education_level: parsedData.education_level,
        highest_degree: parsedData.highest_degree,
        uploaded_by: user.id,
        source: 'bulk_upload',
        status: 'available'
      })
      .select()
      .single()

    if (error) throw error

    // Log to history
    await supabase
      .from('resume_bank_history')
      .insert({
        resume_id: data.id,
        action_type: 'uploaded',
        performed_by: user.id,
        details: { file_name: fileName, upload_method: 'bulk_upload' }
      })

    return data
  }

  const processFile = async (index: number) => {
    const file = files[index]
    
    try {
      // Update status to parsing
      updateFileStatus(index, 'parsing', 10)

      // Step 1: Parse resume with AI
      const parsedData = await parseResume(file.file)
      updateFileStatus(index, 'parsing', 40, parsedData)

        // Step 2: Check for duplicates
      if (parsedData.phone || parsedData.email) {
        const duplicate = await checkDuplicate(parsedData.phone, parsedData.email)
        if (duplicate) {
          updateFileStatus(index, 'duplicate', 100, parsedData, undefined, duplicate)
          return
        }
      if (parsedData.key_skills?.length > 0) {
      const normalized = await normalizeSkills(parsedData.key_skills)
      parsedData.key_skills = normalized.normalized
        }  

      }
      updateFileStatus(index, 'parsing', 60, parsedData)

      // Step 3: Upload to storage
      const resumeUrl = await uploadToStorage(file.file)
      updateFileStatus(index, 'parsing', 80, parsedData)

      // Step 4: Save to resume_bank
      await saveToResumeBank(resumeUrl, parsedData, file.fileName)
      updateFileStatus(index, 'success', 100, parsedData)

    } catch (error: any) {
      console.error('Process error:', error)
      updateFileStatus(index, 'error', 0, undefined, error.message || 'Failed to process')
    }
  }

  const updateFileStatus = (
    index: number,
    status: ParsedResume['status'],
    progress: number,
    parsedData?: any,
    error?: string,
    duplicateInfo?: any
  ) => {
    setFiles(prev => prev.map((f, i) => 
      i === index 
        ? { ...f, status, progress, parsedData, error, duplicateInfo }
        : f
    ))
  }

  const handleUploadAll = async () => {
    if (!user) {
      alert('Please login first')
      return
    }

    setUploading(true)

    // Process all pending files
    const pendingIndices = files
      .map((f, i) => ({ file: f, index: i }))
      .filter(({ file }) => file.status === 'pending')
      .map(({ index }) => index)

    // Process sequentially to avoid overwhelming the API
    for (const index of pendingIndices) {
      await processFile(index)
    }

    setUploading(false)
  }

  const getStatusIcon = (status: ParsedResume['status']) => {
    switch (status) {
      case 'pending': return '⏳'
      case 'parsing': return '🔄'
      case 'success': return '✅'
      case 'error': return '❌'
      case 'duplicate': return '⚠️'
    }
  }

  const getStatusColor = (status: ParsedResume['status']) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-700'
      case 'parsing': return 'bg-blue-100 text-blue-700'
      case 'success': return 'bg-green-100 text-green-700'
      case 'error': return 'bg-red-100 text-red-700'
      case 'duplicate': return 'bg-yellow-100 text-yellow-700'
    }
  }

  const getStatusText = (status: ParsedResume['status']) => {
    switch (status) {
      case 'pending': return 'Ready to upload'
      case 'parsing': return 'Processing...'
      case 'success': return 'Uploaded successfully'
      case 'error': return 'Failed'
      case 'duplicate': return 'Duplicate found'
    }
  }

  const stats = {
    total: files.length,
    pending: files.filter(f => f.status === 'pending').length,
    success: files.filter(f => f.status === 'success').length,
    error: files.filter(f => f.status === 'error').length,
    duplicate: files.filter(f => f.status === 'duplicate').length
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">📤 Upload Resumes</h2>
          <p className="text-gray-600 mt-2">Bulk upload resumes to the talent pool</p>
        </div>

        {/* Upload Area */}
        <div className="card">
          <div
            className={`
              border-2 border-dashed rounded-lg p-12 text-center transition-colors
              ${dragActive 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
              }
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="space-y-4">
              <div className="text-6xl">📄</div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Drop resumes here
                </h3>
                <p className="text-gray-600 mb-4">
                  PDF or Word documents (.doc, .docx)
                </p>
              </div>
              <div>
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  onChange={handleFileInput}
                />
                <label
                  htmlFor="file-upload"
                  className="btn-primary cursor-pointer inline-block"
                >
                  📁 Choose Files
                </label>
              </div>
              <p className="text-sm text-gray-500">
                Supports: PDF, Word (.doc, .docx) | Max size: 10MB per file
              </p>
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        {files.length > 0 && (
          <div className="card bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200">
            <div className="grid grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-sm text-gray-600 mb-1">Total Files</div>
                <div className="text-3xl font-bold text-blue-900">{stats.total}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">⏳ Pending</div>
                <div className="text-3xl font-bold text-gray-600">{stats.pending}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">✅ Success</div>
                <div className="text-3xl font-bold text-green-600">{stats.success}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">⚠️ Duplicate</div>
                <div className="text-3xl font-bold text-yellow-600">{stats.duplicate}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">❌ Errors</div>
                <div className="text-3xl font-bold text-red-600">{stats.error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {files.length > 0 && (
          <div className="flex gap-4">
            <button
              onClick={handleUploadAll}
              disabled={uploading || stats.pending === 0}
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? '⏳ Processing...' : `🚀 Upload All (${stats.pending})`}
            </button>
            <button
              onClick={() => setFiles([])}
              className="bg-white border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50"
            >
              🗑️ Clear All
            </button>
          </div>
        )}

        {/* Files List */}
        {files.length > 0 && (
          <div className="card">
            <h3 className="font-bold text-lg mb-4">📋 Upload Queue ({files.length})</h3>
            <div className="space-y-3">
              {files.map((file, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-4 ${
                    file.status === 'success' 
                      ? 'bg-green-50 border-green-200' 
                      : file.status === 'error'
                        ? 'bg-red-50 border-red-200'
                        : file.status === 'duplicate'
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-white border-gray-200'
                  }`}
                >
                  {/* File Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-2xl">{getStatusIcon(file.status)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {file.fileName}
                        </p>
                        <p className="text-sm text-gray-500">
                          {(file.file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(file.status)}`}>
                        {getStatusText(file.status)}
                      </span>
                      {file.status === 'pending' && (
                        <button
                          onClick={() => removeFile(index)}
                          className="text-red-600 hover:text-red-800 font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {file.status === 'parsing' && (
                    <div className="mb-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{file.progress}% complete</p>
                    </div>
                  )}

                  {/* Parsed Data Preview */}
                  {file.parsedData && (
                    <div className="bg-white border border-gray-200 rounded p-3 text-sm mt-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-gray-500">Name:</span>{' '}
                          <span className="font-medium">{file.parsedData.full_name || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Phone:</span>{' '}
                          <span className="font-medium">{file.parsedData.phone || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Email:</span>{' '}
                          <span className="font-medium">{file.parsedData.email || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Experience:</span>{' '}
                          <span className="font-medium">{file.parsedData.total_experience || 0} years</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Location:</span>{' '}
                          <span className="font-medium">{file.parsedData.current_location || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Expected CTC:</span>{' '}
                          <span className="font-medium">₹{file.parsedData.expected_ctc || 0}L</span>
                        </div>
                      </div>
                      {file.parsedData.key_skills && file.parsedData.key_skills.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <span className="text-gray-500 text-xs">Skills:</span>{' '}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {file.parsedData.key_skills.slice(0, 8).map((skill: string, i: number) => (
                              <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                {skill}
                              </span>
                            ))}
                            {file.parsedData.key_skills.length > 8 && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                +{file.parsedData.key_skills.length - 8} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error Message */}
                  {file.error && (
                    <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 mt-3">
                      ❌ Error: {file.error}
                    </div>
                  )}

                  {/* Duplicate Info */}
                  {file.duplicateInfo && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800 mt-3">
                      <p className="font-medium mb-1">⚠️ Duplicate Found</p>
                      <p>
                        This resume already exists in{' '}
                        <span className="font-bold">
                          {file.duplicateInfo.found_in === 'candidates' ? 'Candidates' : 'Resume Bank'}
                        </span>
                        {' '}as{' '}
                        <span className="font-bold">{file.duplicateInfo.full_name}</span>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {files.length === 0 && (
          <div className="card text-center py-12 bg-gray-50">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No files yet</h3>
            <p className="text-gray-600 mb-4">
              Upload PDF resumes to start building your talent pool
            </p>
            <p className="text-sm text-gray-500">
              Drag & drop files or click "Choose Files" above
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
