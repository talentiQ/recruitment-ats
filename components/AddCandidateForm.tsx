// components/AddCandidateForm.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseResumeWithAI } from '@/lib/resumeExtractor'
import { normalizeSkills } from '@/lib/skillNormalization'
import MatchScorePanel from '@/components/MatchScorePanel'

interface Job {
  id: string
  job_title: string
  job_code?: string
  clients: {
    company_name: string
  }[]
}

interface AddCandidateFormProps {
  userRole: 'recruiter' | 'team_leader' | 'sr_team_leader' | string
  redirectPath?: string
  preSelectedJobId?: string
  existingCandidate?: any
  isEditMode?: boolean
}

export default function AddCandidateForm({ 
  userRole, 
  redirectPath,
  preSelectedJobId,
  existingCandidate,
  isEditMode = false
}: AddCandidateFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobFromUrl = searchParams.get('job')
  
  const [loading, setLoading] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [user, setUser] = useState<any>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<string>('')
  const [duplicateCandidate, setDuplicateCandidate] = useState<any>(null)
  
  // Resume upload state
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseConfidence, setParseConfidence] = useState(existingCandidate?.auto_fill_confidence || 0)
  const [autoFilled, setAutoFilled] = useState(existingCandidate?.auto_filled || false)
  const [parseError, setParseError] = useState<string>('')

  // Validation errors for mandatory fields
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [resumeRawText, setResumeRawText] = useState<string>('')
  // ── NEW: store full parsed result for MatchScorePanel ──────────────────────
  const [parsedResume, setParsedResume] = useState<{
    skills: string[]
    total_experience: number | null
    expected_ctc: number | null
  } | null>(null)

  // ── NEW: track selected job title for MatchScorePanel header ──────────────
  const [selectedJobTitle, setSelectedJobTitle] = useState<string>('')

  // Skills state
  const [skillSuggestions, setSkillSuggestions] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    existingCandidate?.key_skills || []
  )

  const [formData, setFormData] = useState({
    full_name: existingCandidate?.full_name || '',
    email: existingCandidate?.email || '',
    phone: existingCandidate?.phone || '',
    gender: existingCandidate?.gender || '',
    date_of_birth: existingCandidate?.date_of_birth || '',
    current_location: existingCandidate?.current_location || '',
    job_id: existingCandidate?.job_id || preSelectedJobId || jobFromUrl || '',
    current_company: existingCandidate?.current_company || '',
    current_designation: existingCandidate?.current_designation || '',
    total_experience: existingCandidate?.total_experience?.toString() || '',
    relevant_experience: existingCandidate?.relevant_experience?.toString() || '',
    current_ctc: existingCandidate?.current_ctc?.toString() || '',
    expected_ctc: existingCandidate?.expected_ctc?.toString() || '',
    notice_period: existingCandidate?.notice_period?.toString() || '',
    education_level: existingCandidate?.education_level || '',
    education_degree: existingCandidate?.education_degree || '',
    education_field: existingCandidate?.education_field || '',
    education_institution: existingCandidate?.education_institution || '',
    source_portal: existingCandidate?.source_portal || 'Naukri',
    notes: existingCandidate?.notes || '',
  })

  useEffect(() => {
    if (existingCandidate && isEditMode) {
      setFormData({
        full_name: existingCandidate.full_name || '',
        email: existingCandidate.email || '',
        phone: existingCandidate.phone || '',
        gender: existingCandidate.gender || '',
        date_of_birth: existingCandidate.date_of_birth || '',
        current_location: existingCandidate.current_location || '',
        job_id: existingCandidate.job_id || '',
        current_company: existingCandidate.current_company || '',
        current_designation: existingCandidate.current_designation || '',
        total_experience: existingCandidate.total_experience?.toString() || '',
        relevant_experience: existingCandidate.relevant_experience?.toString() || '',
        current_ctc: existingCandidate.current_ctc?.toString() || '',
        expected_ctc: existingCandidate.expected_ctc?.toString() || '',
        notice_period: existingCandidate.notice_period?.toString() || '',
        education_level: existingCandidate.education_level || '',
        education_degree: existingCandidate.education_degree || '',
        education_field: existingCandidate.education_field || '',
        education_institution: existingCandidate.education_institution || '',
        source_portal: existingCandidate.source_portal || 'Naukri',
        notes: existingCandidate.notes || '',
      })
      setSelectedSkills(existingCandidate.key_skills || [])
      setAutoFilled(existingCandidate.auto_filled || false)
      setParseConfidence(existingCandidate.auto_fill_confidence || 0)
    }
  }, [existingCandidate?.id, isEditMode])

  // ── NEW: keep selectedJobTitle in sync when job_id changes ────────────────
  useEffect(() => {
    if (formData.job_id && jobs.length > 0) {
      const found = jobs.find(j => j.id === formData.job_id)
      if (found) setSelectedJobTitle(found.job_title)
    }
  }, [formData.job_id, jobs])

  // ── NEW: keep parsedResume in sync when skills or experience change ────────
  // (covers the case where recruiter manually edits after auto-fill)
  useEffect(() => {
    if (autoFilled || selectedSkills.length > 0) {
      setParsedResume({
        skills:           selectedSkills,
        total_experience: parseFloat(formData.total_experience) || null,
        expected_ctc:     parseFloat(formData.expected_ctc)     || null,
      })
    }
  }, [selectedSkills, formData.total_experience, formData.expected_ctc, autoFilled])

  const loadJobs = async (userId: string, teamId: string, role: string) => {
    try {
      if (role === 'recruiter') {
        const { data: assignments } = await supabase
          .from('job_recruiter_assignments')
          .select('job_id')
          .eq('recruiter_id', userId)
          .eq('is_active', true)

        if (!assignments || assignments.length === 0) { setJobs([]); return }

        const { data } = await supabase
          .from('jobs')
          .select('id, job_title, job_code, clients(company_name)')
          .in('id', assignments.map(a => a.job_id))
          .eq('status', 'open')
          .order('created_at', { ascending: false })

        if (data) setJobs(data as unknown as Job[])

      } else if (role === 'team_leader' || role === 'sr_team_leader') {
        const { data } = await supabase
          .from('jobs')
          .select('id, job_title, job_code, clients(company_name)')
          .eq('assigned_team_id', teamId)
          .eq('status', 'open')
          .order('created_at', { ascending: false })

        if (data) setJobs(data as unknown as Job[])

      } else {
        const { data } = await supabase
          .from('jobs')
          .select('id, job_title, job_code, clients(company_name)')
          .eq('status', 'open')
          .order('created_at', { ascending: false })

        if (data) setJobs(data as unknown as Job[])
      }
    } catch (error) {
      console.error('loadJobs error:', error)
      setJobs([])
    }
  }

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadJobs(parsedUser.id, parsedUser.team_id, parsedUser.role || userRole)
    }
  }, [preSelectedJobId, userRole])

  // ─────────────────────────────────────────────
  // RESUME UPLOAD HANDLER
  // ─────────────────────────────────────────────
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]
    const validExts = ['.pdf', '.doc', '.docx', '.txt']
    const hasValidExt = validExts.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!validTypes.includes(file.type) && !hasValidExt) {
      alert('Please upload PDF, Word (.docx), or Text file only')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File must be less than 10MB')
      return
    }

    setResumeFile(file)
    setParsing(true)
    setParseError('')
    setAutoFilled(false)
    setParsedResume(null)

    try {
      const parsed = await parseResumeWithAI(file)
      setResumeRawText(parsed.rawText || '')
      // Auto-fill form
      setFormData(prev => ({
        ...prev,
        full_name:            parsed.full_name            || prev.full_name,
        email:                parsed.email                || prev.email,
        phone:                parsed.phone                || prev.phone,
        gender:               parsed.gender               || prev.gender,
        date_of_birth:        parsed.date_of_birth        || prev.date_of_birth,
        current_location:     parsed.current_location     || prev.current_location,
        current_company:      parsed.current_company      || prev.current_company,
        current_designation:  parsed.current_designation  || prev.current_designation,
        total_experience:     parsed.total_experience != null ? parsed.total_experience.toString() : prev.total_experience,
        current_ctc:          parsed.current_ctc     != null ? parsed.current_ctc.toString()      : prev.current_ctc,
        expected_ctc:         parsed.expected_ctc    != null ? parsed.expected_ctc.toString()     : prev.expected_ctc,
        notice_period:        parsed.notice_period   != null ? parsed.notice_period.toString()    : prev.notice_period,
        education_level:      parsed.education_level      || prev.education_level,
        education_degree:     parsed.education_degree     || prev.education_degree,
        education_field:      parsed.education_field      || prev.education_field,
        education_institution: parsed.education_institution || prev.education_institution,
      }))

      if (parsed.skills.length > 0) {
        setSelectedSkills(parsed.skills)
      }

      setParseConfidence(parsed.confidence)
      setAutoFilled(true)

      // ── NEW: store parsed data for MatchScorePanel ─────────────────────────
      setParsedResume({
        skills:           parsed.skills,
        total_experience: parsed.total_experience ?? null,
        expected_ctc:     parsed.expected_ctc     ?? null,
      })

      if (parsed.phone || parsed.email) {
        checkDuplicate(parsed.phone || '', parsed.email || '')
      }

    } catch (error: any) {
      console.error('Parse error:', error)
      setParseError(error.message || 'Parsing failed. Please fill manually.')
    } finally {
      setParsing(false)
    }
  }

  const checkDuplicate = async (phone: string, email: string) => {
    if (!phone && !email) return false
    try {
      let query = supabase
        .from('candidates')
        .select('id, full_name, phone, email, current_stage, date_sourced, jobs(job_title, clients(company_name))')

      if (phone && email) {
        query = query.or(`phone.eq.${phone},email.eq.${email}`)
      } else if (phone) {
        query = query.eq('phone', phone)
      } else {
        query = query.eq('email', email)
      }

      if (isEditMode && existingCandidate) {
        query = query.neq('id', existingCandidate.id)
      }

      const { data } = await query

      if (data && data.length > 0) {
        const existing = data[0]
        setDuplicateCandidate(existing)
        setDuplicateWarning(
          `DUPLICATE FOUND!\n\nName: ${existing.full_name}\nPhone: ${existing.phone}\nEmail: ${existing.email || 'N/A'}\nStage: ${existing.current_stage}`
        )
        return true
      }
      setDuplicateWarning('')
      setDuplicateCandidate(null)
      return false
    } catch {
      return false
    }
  }

  useEffect(() => {
    if (isEditMode) return
    const timeoutId = setTimeout(() => {
      if (formData.phone || formData.email) {
        checkDuplicate(formData.phone, formData.email)
      }
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [formData.phone, formData.email, isEditMode])

  const loadSkillSuggestions = async (partial: string) => {
    if (partial.length < 2) { setSkillSuggestions([]); return }
    const { data } = await supabase.rpc('get_skill_suggestions', { partial_skill: partial, limit_count: 10 })
    if (data) setSkillSuggestions(data.map((s: any) => s.skill_name))
  }

  const handleAddSkill = (skill: string) => {
    if (skill && !selectedSkills.includes(skill)) {
      setSelectedSkills([...selectedSkills, skill])
      setSkillInput('')
      setSkillSuggestions([])
    }
  }

  const handleRemoveSkill = (skillToRemove: string) => {
    setSelectedSkills(selectedSkills.filter(s => s !== skillToRemove))
  }

  // ── NEW: persist match score after candidate is saved ─────────────────────
  const saveMatchScore = async (candidateId: string, jobId: string) => {
    if (!user?.id || !jobId) return
    try {
      await fetch('/api/match-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          candidateId,
          screenedBy: user.id,
        }),
      })
    } catch {
      // Non-blocking — score can be generated later from profile page
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // ── Validate all mandatory fields ────────────────────────────────────────
    const errors: Record<string, string> = {}
    if (!formData.full_name.trim())          errors.full_name         = 'Full name is required'
    if (!formData.phone.trim())              errors.phone             = 'Mobile number is required'
    if (!formData.email.trim())              errors.email             = 'Email ID is required'
    if (!formData.job_id)                    errors.job_id            = 'Please select a job'
    if (!formData.total_experience.trim())   errors.total_experience  = 'Total experience is required'
    if (!formData.current_ctc.trim())        errors.current_ctc       = 'Current CTC is required'
    if (!formData.notice_period.trim())      errors.notice_period     = 'Notice period is required'
    if (!formData.current_location.trim())   errors.current_location  = 'Current location is required'
    if (!formData.education_level)           errors.education_level   = 'Education level is required'
    if (!formData.education_degree.trim())   errors.education_degree  = 'Degree is required'
    if (selectedSkills.length === 0)         errors.skills            = 'Please add at least one skill'

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      // Scroll to first error
      const firstErrorField = Object.keys(errors)[0]
      document.querySelector(`[name="${firstErrorField}"], [data-field="${firstErrorField}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setFormErrors({})

    if (!isEditMode) {
      const isDuplicate = await checkDuplicate(formData.phone, formData.email)
      if (isDuplicate) {
        const confirm = window.confirm(`DUPLICATE DETECTED!\n\n${duplicateWarning}\n\nAdd anyway?`)
        if (!confirm) return
      }
    }

    setLoading(true)

    try {
      let normalizedSkills = selectedSkills
      if (selectedSkills.length > 0) {
        const normalized = await normalizeSkills(selectedSkills)
        normalizedSkills = normalized.normalized
      }

      const candidateData = {
        ...formData,
        total_experience: parseFloat(formData.total_experience) || 0,
        relevant_experience: parseFloat(formData.relevant_experience) || 0,
        current_ctc: parseFloat(formData.current_ctc) || 0,
        expected_ctc: parseFloat(formData.expected_ctc) || 0,
        notice_period: parseInt(formData.notice_period) || 0,
        key_skills: normalizedSkills,
        last_activity_date: new Date().toISOString(),
      }

      if (isEditMode && existingCandidate) {
        const { error } = await supabase
          .from('candidates')
          .update(candidateData)
          .eq('id', existingCandidate.id)

        if (error) throw error

        await supabase.from('candidate_timeline').insert([{
          candidate_id: existingCandidate.id,
          activity_type: 'candidate_updated',
          activity_title: 'Candidate Updated',
          activity_description: 'Candidate information was updated',
          performed_by: user.id,
        }])

        alert('Candidate updated successfully!')
        if (redirectPath) router.push(redirectPath)
        else router.back()

      } else {
        let resumeUrl = null
        if (resumeFile) {
          const fileExt = resumeFile.name.split('.').pop()
          const fileName = `${Date.now()}_${formData.full_name.replace(/\s+/g, '_')}.${fileExt}`
          const { error: uploadError } = await supabase.storage
            .from('resumes')
            .upload(`resumes/${fileName}`, resumeFile)

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(`resumes/${fileName}`)
            resumeUrl = urlData.publicUrl
          }
        }

        const { data, error } = await supabase
          .from('candidates')
          .insert([{
            ...candidateData,
            assigned_to: user.id,
            team_id: user.team_id,
            created_by: user.id,
            current_stage: 'sourced',
            date_sourced: new Date().toISOString(),
            resume_url: resumeUrl,
            resume_file_name: resumeFile?.name,
            resume_file_size: resumeFile?.size,
            resume_uploaded_at: resumeUrl ? new Date().toISOString() : null,
            resume_parsed: autoFilled,
            auto_filled: autoFilled,
            auto_fill_confidence: parseConfidence,
          }])
          .select()

        if (error) throw error

        const newCandidateId = data[0].id

        await supabase.from('candidate_timeline').insert([{
          candidate_id: newCandidateId,
          activity_type: 'candidate_created',
          activity_title: 'Candidate Created',
          activity_description: autoFilled
            ? `Candidate added via Talent IQ resume parsing (${(parseConfidence * 100).toFixed(0)}% confidence)`
            : 'Candidate added manually',
          metadata: { auto_filled: autoFilled, confidence: parseConfidence, skills_count: normalizedSkills.length },
          performed_by: user.id,
        }])

        // ── NEW: persist match score (non-blocking) ────────────────────────
        saveMatchScore(newCandidateId, formData.job_id)

        alert('Candidate added successfully!')

        if (redirectPath) router.push(redirectPath)
        else if (userRole === 'team_leader') router.push('/tl/candidates')
        else if (userRole === 'sr_team_leader') router.push('/sr-tl/candidates')
        else router.push('/recruiter/dashboard')
      }
    } catch (error: any) {
      console.error('Submit error:', error)
      alert('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    // Clear error for this field when user starts typing
    if (formErrors[e.target.name]) {
      setFormErrors(prev => { const n = { ...prev }; delete n[e.target.name]; return n })
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {isEditMode ? 'Edit Candidate' : 'Add New Candidate'}
        </h2>
        <p className="text-gray-600">
          {isEditMode
            ? 'Update candidate information'
            : 'Upload resume for Talent IQ auto-fill or enter manually'}
        </p>
        {!isEditMode && (
          <p className="text-xs text-gray-500 mt-1">
            Fields marked <span className="text-red-500 font-semibold">*</span> are mandatory
          </p>
        )}
      </div>

      {/* Resume Upload - Only in Add Mode */}
      {!isEditMode && (
        <div className="card mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">🤖</span>
            <h3 className="text-lg font-semibold text-blue-900">Talent IQ Resume Parser</h3>
            <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full">Powered by Talent IQ</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Resume (PDF, Word .docx, or Text) — extracts all fields automatically
              </label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleResumeUpload}
                disabled={parsing}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-3 file:px-6
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-600 file:text-white
                  hover:file:bg-blue-700
                  disabled:opacity-50"
              />
            </div>

            {parsing && (
              <div className="flex items-center gap-3 p-3 bg-blue-100 rounded-lg text-blue-800">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-700 flex-shrink-0"></div>
                <div>
                  <p className="text-sm font-medium">Talent IQ is reading the resume...</p>
                  <p className="text-xs text-blue-600 mt-1">Extracting name, contact, experience, skills, education</p>
                </div>
              </div>
            )}

            {parseError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                ⚠️ {parseError}
              </div>
            )}

            {autoFilled && !isEditMode && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800 mb-1">
                  <span className="text-lg">✅</span>
                  <span className="font-semibold">Parsing Complete!</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-green-700">
                  <span>Confidence: <strong>{(parseConfidence * 100).toFixed(0)}%</strong></span>
                  <span>Skills found: <strong>{selectedSkills.length}</strong></span>
                </div>
                <p className="text-xs text-green-600 mt-2">
                  Review the auto-filled fields below and complete any missing information
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Mode - parse badge */}
      {isEditMode && existingCandidate?.auto_filled && (
        <div className="card mb-6 bg-green-50 border border-green-200">
          <div className="flex items-center gap-2 text-green-800">
            <span>🤖</span>
            <div>
              <strong>Originally parsed by Talent IQ</strong>
              <p className="text-sm text-green-700">
                Confidence at parse time: {(existingCandidate.auto_fill_confidence * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Warning */}
      {duplicateWarning && !isEditMode && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-6">
          <strong className="text-red-900">⚠️ DUPLICATE DETECTED!</strong>
          <pre className="mt-2 text-sm whitespace-pre-wrap font-mono text-red-800">{duplicateWarning}</pre>
          {duplicateCandidate && (
            <button
              type="button"
              onClick={() => {
                const basePath = userRole === 'sr_team_leader' ? '/sr-tl' : userRole === 'team_leader' ? '/tl' : '/recruiter'
                router.push(`${basePath}/candidates/${duplicateCandidate.id}`)
              }}
              className="mt-3 px-4 py-2 bg-white text-red-700 border border-red-300 rounded-lg text-sm font-medium hover:bg-red-50"
            >
              View Existing Candidate →
            </button>
          )}
        </div>
      )}

      {jobs.length === 0 && !loading && !isEditMode && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-yellow-900">No Jobs Available</h3>
          <p className="text-sm text-yellow-800 mt-1">
            {userRole === 'recruiter'
              ? 'You have no assigned jobs. Please contact your Team Leader.'
              : 'No open jobs found. Please create a job first.'}
          </p>
        </div>
      )}

      {/* MAIN FORM */}
      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Basic Information */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            Basic Information
            {autoFilled && !isEditMode && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">🤖 AI-Filled</span>}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Name <span className="text-red-500">*</span></label>
              <input type="text" name="full_name" value={formData.full_name} onChange={handleChange}
                className={`input ${formErrors.full_name ? 'border-red-500 border-2' : ''}`} required />
              {formErrors.full_name && <p className="text-xs text-red-600 mt-1">{formErrors.full_name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email ID <span className="text-red-500">*</span></label>
              <input type="email" name="email" value={formData.email} onChange={handleChange}
                className={`input ${formErrors.email || (duplicateWarning && formData.email && !isEditMode) ? 'border-red-500 border-2' : ''}`}
                required />
              {formErrors.email && <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number <span className="text-red-500">*</span></label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                className={`input ${formErrors.phone || (duplicateWarning && formData.phone && !isEditMode) ? 'border-red-500 border-2' : ''}`}
                required />
              {formErrors.phone && <p className="text-xs text-red-600 mt-1">{formErrors.phone}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
              <select name="gender" value={formData.gender} onChange={handleChange} className="input">
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
              <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange}
                className="input" max={new Date().toISOString().split('T')[0]} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Current Location <span className="text-red-500">*</span></label>
              <input type="text" name="current_location" value={formData.current_location} onChange={handleChange}
                className={`input ${formErrors.current_location ? 'border-red-500 border-2' : ''}`}
                placeholder="e.g., Mumbai, Bangalore" />
              {formErrors.current_location && <p className="text-xs text-red-600 mt-1">{formErrors.current_location}</p>}
            </div>
          </div>
        </div>

        {/* Job Assignment */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Assignment</h3>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Job Role <span className="text-red-500">*</span></label>
            <select
              name="job_id"
              value={formData.job_id}
              onChange={(e) => {
                handleChange(e)
                const found = jobs.find(j => j.id === e.target.value)
                setSelectedJobTitle(found?.job_title || '')
              }}
              className={`input ${formErrors.job_id ? 'border-red-500 border-2' : ''}`}
              required
              disabled={!!preSelectedJobId || !!jobFromUrl}
            >
              <option value="">Select Job</option>
              {jobs.map(job => (
                <option key={job.id} value={job.id}>
                  {job.job_code && `${job.job_code} - `}{job.job_title} - {job.clients?.[0]?.company_name}
                </option>
              ))}
            </select>
            {formErrors.job_id
              ? <p className="text-xs text-red-600 mt-1">{formErrors.job_id}</p>
              : <p className="text-xs text-gray-500 mt-1">{jobs.length} job{jobs.length !== 1 ? 's' : ''} available</p>
            }
          </div>

          {/* ── NEW: MatchScorePanel — preview mode ──────────────────────────── */}
          {!isEditMode && (
            <MatchScorePanel
          jobId={formData.job_id || null}
          jobTitle={selectedJobTitle}
          parsedData={parsedResume}
          rawText={resumeRawText}
          autoRun={true}
          />
          )}
        </div>

        {/* Professional Details */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            Professional Details
            {autoFilled && !isEditMode && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">🤖 AI-Filled</span>}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Current Company</label>
              <input type="text" name="current_company" value={formData.current_company} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Current Designation</label>
              <input type="text" name="current_designation" value={formData.current_designation} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Total Experience (Years) <span className="text-red-500">*</span></label>
              <input type="number" step="0.5" name="total_experience" value={formData.total_experience} onChange={handleChange}
                className={`input ${formErrors.total_experience ? 'border-red-500 border-2' : ''}`} placeholder="e.g., 4.5" />
              {formErrors.total_experience && <p className="text-xs text-red-600 mt-1">{formErrors.total_experience}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Relevant Experience (Years)</label>
              <input type="number" step="0.5" name="relevant_experience" value={formData.relevant_experience} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Current CTC (Lakhs) <span className="text-red-500">*</span></label>
              <input type="number" step="0.1" name="current_ctc" value={formData.current_ctc} onChange={handleChange}
                className={`input ${formErrors.current_ctc ? 'border-red-500 border-2' : ''}`} placeholder="e.g., 6.5" />
              {formErrors.current_ctc && <p className="text-xs text-red-600 mt-1">{formErrors.current_ctc}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Expected CTC (Lakhs)</label>
              <input type="number" step="0.1" name="expected_ctc" value={formData.expected_ctc} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notice Period (Days) <span className="text-red-500">*</span></label>
              <input type="number" name="notice_period" value={formData.notice_period} onChange={handleChange}
                className={`input ${formErrors.notice_period ? 'border-red-500 border-2' : ''}`} placeholder="e.g., 30" />
              {formErrors.notice_period && <p className="text-xs text-red-600 mt-1">{formErrors.notice_period}</p>}
            </div>
          </div>
        </div>

        {/* Education */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            Education
            {autoFilled && !isEditMode && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">🤖 AI-Filled</span>}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Education Level <span className="text-red-500">*</span></label>
              <select name="education_level" value={formData.education_level} onChange={handleChange}
                className={`input ${formErrors.education_level ? 'border-red-500 border-2' : ''}`}>
                <option value="">Select Level</option>
                <option value="High School">High School</option>
                <option value="Diploma">Diploma</option>
                <option value="Bachelor">Bachelor's</option>
                <option value="Master">Master's</option>
                <option value="PhD">PhD</option>
              </select>
              {formErrors.education_level && <p className="text-xs text-red-600 mt-1">{formErrors.education_level}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Degree <span className="text-red-500">*</span></label>
              <input type="text" name="education_degree" value={formData.education_degree} onChange={handleChange}
                className={`input ${formErrors.education_degree ? 'border-red-500 border-2' : ''}`}
                placeholder="e.g., B.Tech, MBA" />
              {formErrors.education_degree && <p className="text-xs text-red-600 mt-1">{formErrors.education_degree}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Field of Study</label>
              <input type="text" name="education_field" value={formData.education_field} onChange={handleChange}
                className="input" placeholder="e.g., Computer Science" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Institution</label>
              <input type="text" name="education_institution" value={formData.education_institution} onChange={handleChange}
                className="input" placeholder="e.g., IIT Delhi, Mumbai University" />
            </div>
          </div>
        </div>

        {/* Skills */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            Key Skills <span className="text-red-500">*</span>
            {autoFilled && !isEditMode && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">🤖 AI-Filled</span>}
          </h3>
          <div className="space-y-4">
            {formErrors.skills && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <span>⚠️</span> {formErrors.skills}
              </div>
            )}
            {selectedSkills.length > 0 && (
              <div data-field="skills" className="flex flex-wrap gap-2">
                {selectedSkills.map((skill, index) => (
                  <span key={index} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium flex items-center gap-2">
                    {skill}
                    <button type="button" onClick={() => handleRemoveSkill(skill)} className="text-blue-600 hover:text-blue-900 font-bold">×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                value={skillInput}
                data-field="skills"
                onChange={(e) => { setSkillInput(e.target.value); loadSkillSuggestions(e.target.value) }}
                onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSkill(skillInput) } }}
                className={`input ${formErrors.skills && selectedSkills.length === 0 ? 'border-red-500 border-2' : ''}`}
                placeholder="Type skill and press Enter"
              />
              {skillSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {skillSuggestions.map((suggestion, index) => (
                    <button key={index} type="button" onClick={() => handleAddSkill(suggestion)}
                      className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm">
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">Type to see suggestions or press Enter to add custom skills</p>
          </div>
        </div>

        {/* Additional */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Source Portal</label>
              <select name="source_portal" value={formData.source_portal} onChange={handleChange} className="input">
                <option value="Naukri">Naukri</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Indeed">Indeed</option>
                <option value="Monster">Monster</option>
                <option value="Internal DB">Internal DB</option>
                <option value="Referral">Referral</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="input"
                placeholder="Any additional notes..." />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="card">
          {/* Validation summary banner */}
        {Object.keys(formErrors).length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-800 font-semibold mb-2">
              <span>⚠️</span> Please fix the following before submitting:
            </div>
            <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
              {Object.values(formErrors).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading || (!isEditMode && jobs.length === 0)}
              className={`btn-primary ${duplicateWarning && !isEditMode ? 'bg-orange-600 hover:bg-orange-700' : ''}`}
            >
              {loading
                ? (isEditMode ? 'Updating...' : 'Adding...')
                : isEditMode
                  ? 'Update Candidate'
                  : duplicateWarning
                    ? 'Add Anyway'
                    : autoFilled
                      ? '💾 Save AI-Parsed Candidate'
                      : 'Add Candidate'}
            </button>
            <button type="button" onClick={() => router.back()}
              className="bg-white border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:border-gray-400">
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
