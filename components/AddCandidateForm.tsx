// components/AddCandidateForm.tsx - FIXED: Jobs loading for recruiters
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseResume } from '@/lib/resumeParser'

interface Job {
  id: string
  job_title: string
  job_code?: string
  clients: {
    company_name: string
  }[]
}

interface AddCandidateFormProps {
  userRole: 'recruiter' | 'team_leader' | string
  redirectPath?: string
  preSelectedJobId?: string
}

export default function AddCandidateForm({ 
  userRole, 
  redirectPath,
  preSelectedJobId
}: AddCandidateFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [user, setUser] = useState<any>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<string>('')
  const [existingCandidate, setExistingCandidate] = useState<any>(null)
  
  // Resume upload state
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseConfidence, setParseConfidence] = useState(0)
  const [autoFilled, setAutoFilled] = useState(false)

  // Education options
  const [educationOptions, setEducationOptions] = useState<any[]>([])
  const [skillSuggestions, setSkillSuggestions] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')

  const [formData, setFormData] = useState({
    // Basic - Auto-fillable
    full_name: '',
    email: '',
    phone: '',
    gender: '',
    date_of_birth: '',
    current_location: '',
    
    // Job
    job_id: '',
    
    // Professional - Auto-fillable
    current_company: '',
    current_designation: '',
    total_experience: '',
    relevant_experience: '',
    current_ctc: '',
    expected_ctc: '',
    notice_period: '',
    
    // Education - Auto-fillable
    education_level: '',
    education_degree: '',
    education_field: '',
    education_institution: '',
    
    // Skills - Auto-fillable
    key_skills: [] as string[],
    
    // Additional
    source_portal: 'Naukri',
    notes: '',
  })

  // FIXED: Load jobs with user data passed directly
  const loadJobs = async (userId: string, teamId: string, role: string) => {
    console.log('🔍 Loading jobs for:', { userId, teamId, role })
    
    try {
      if (role === 'recruiter') {
        // RECRUITERS: Get jobs from assignments table
        console.log('📋 Fetching assignments for recruiter:', userId)
        
        const { data: assignments, error: assignError } = await supabase
          .from('job_recruiter_assignments')
          .select('job_id')
          .eq('recruiter_id', userId)
          .eq('is_active', true)

        console.log('✅ Assignments found:', assignments)

        if (assignError) {
          console.error('❌ Assignment query error:', assignError)
          setJobs([])
          return
        }

        if (!assignments || assignments.length === 0) {
          console.log('⚠️ No assignments found for recruiter')
          setJobs([])
          return
        }

        const jobIds = assignments.map(a => a.job_id)
        console.log('🎯 Job IDs for recruiter:', jobIds)

        const { data, error } = await supabase
          .from('jobs')
          .select(`
            id, 
            job_title, 
            job_code,
            clients(company_name)
          `)
          .in('id', jobIds)
          .eq('status', 'open')
          .order('created_at', { ascending: false })

        console.log('📦 Jobs loaded:', data)

        if (error) {
          console.error('❌ Jobs query error:', error)
        }

        if (data) setJobs(data as unknown as Job[])
      } else {
        // TEAM LEADERS: See all team jobs
        console.log('📋 Fetching all team jobs for team:', teamId)
        
        const { data, error } = await supabase
          .from('jobs')
          .select(`
            id, 
            job_title, 
            job_code,
            clients(company_name)
          `)
          .eq('assigned_team_id', teamId)
          .eq('status', 'open')
          .order('created_at', { ascending: false })

        console.log('📦 TL Jobs loaded:', data)

        if (error) {
          console.error('❌ Jobs query error:', error)
        }

        if (data) setJobs(data as unknown as Job[])
      }
    } catch (error) {
      console.error('💥 loadJobs error:', error)
      setJobs([])
    }
  }

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      console.log('👤 User loaded:', parsedUser)
      setUser(parsedUser)
      
      // IMPORTANT: Pass user data directly to loadJobs
      loadJobs(parsedUser.id, parsedUser.team_id, parsedUser.role || userRole)
    }
    loadEducationOptions()
    
    // Pre-select job if provided
    if (preSelectedJobId) {
      setFormData(prev => ({
        ...prev,
        job_id: preSelectedJobId
      }))
    }
  }, [preSelectedJobId, userRole])

  const loadEducationOptions = async () => {
    const { data } = await supabase
      .from('education_standards')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (data) setEducationOptions(data)
  }

  const loadSkillSuggestions = async (partial: string) => {
    if (partial.length < 2) {
      setSkillSuggestions([])
      return
    }

    const { data, error } = await supabase
      .rpc('get_skill_suggestions', {
        partial_skill: partial,
        limit_count: 10
      })

    if (data) {
      setSkillSuggestions(data.map((s: any) => s.skill_name))
    }
  }

  // 🔥 RESUME UPLOAD AND PARSE
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate
    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    if (!validTypes.includes(file.type)) {
      alert('Please upload PDF, Word, or Text file only')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File must be less than 10MB')
      return
    }

    setResumeFile(file)
    setParsing(true)

    try {
      // Read file as text
      const text = await readFileAsText(file)
      
      // Parse with AI
      const parsed = parseResume(text)
      
      // Auto-fill form
      setFormData(prev => ({
        ...prev,
        full_name: parsed.fullName || prev.full_name,
        email: parsed.email || prev.email,
        phone: parsed.phone || prev.phone,
        gender: parsed.gender || prev.gender,
        date_of_birth: parsed.dateOfBirth || prev.date_of_birth,
        current_location: parsed.location || prev.current_location,
        
        current_company: parsed.currentCompany || prev.current_company,
        current_designation: parsed.currentDesignation || prev.current_designation,
        total_experience: parsed.totalExperience?.toString() || prev.total_experience,
        current_ctc: parsed.currentCTC?.toString() || prev.current_ctc,
        expected_ctc: parsed.expectedCTC?.toString() || prev.expected_ctc,
        
        education_level: parsed.educationLevel || prev.education_level,
        education_degree: parsed.educationDegree || prev.education_degree,
        education_field: parsed.educationField || prev.education_field,
        education_institution: parsed.educationInstitution || prev.education_institution,
        
        key_skills: parsed.skills.length > 0 ? parsed.skills : prev.key_skills,
      }))

      setParseConfidence(parsed.confidence.overall)
      setAutoFilled(true)
      
      alert(`✅ Resume parsed successfully!\n\nConfidence: ${(parsed.confidence.overall * 100).toFixed(0)}%\n\nPlease review and complete any missing fields.`)
      
      // Check for duplicates with parsed data
      if (parsed.phone || parsed.email) {
        checkDuplicate(parsed.phone || '', parsed.email || '')
      }
      
    } catch (error) {
      console.error('Parse error:', error)
      alert('Error parsing resume. Please fill manually.')
    } finally {
      setParsing(false)
    }
  }

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        resolve(text)
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  const checkDuplicate = async (phone: string, email: string) => {
    if (!phone && !email) return false

    try {
      let query = supabase
        .from('candidates')
        .select(`
          id, full_name, phone, email, current_stage, date_sourced,
          jobs(job_title, clients(company_name)),
          users:assigned_to(full_name)
        `)

      if (phone && email) {
        query = query.or(`phone.eq.${phone},email.eq.${email}`)
      } else if (phone) {
        query = query.eq('phone', phone)
      } else if (email) {
        query = query.eq('email', email)
      }

      const { data, error } = await query

      if (error) throw error

      if (data && data.length > 0) {
        const existing = data[0]
        setExistingCandidate(existing)
        setDuplicateWarning(
          `⚠️ DUPLICATE FOUND!\n\n` +
          `Name: ${existing.full_name}\n` +
          `Phone: ${existing.phone}\n` +
          `Email: ${existing.email || 'N/A'}\n` +
          `Stage: ${existing.current_stage}\n` +
          `Job: ${(existing as any).jobs?.[0]?.job_title || 'N/A'}`
        )
        return true
      }

      setDuplicateWarning('')
      setExistingCandidate(null)
      return false
    } catch (error) {
      console.error('Duplicate check error:', error)
      return false
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.phone || formData.email) {
        checkDuplicate(formData.phone, formData.email)
      }
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [formData.phone, formData.email])

  const handleAddSkill = (skill: string) => {
    if (skill && !formData.key_skills.includes(skill)) {
      setFormData({
        ...formData,
        key_skills: [...formData.key_skills, skill]
      })
      setSkillInput('')
      setSkillSuggestions([])
    }
  }

  const handleRemoveSkill = (skillToRemove: string) => {
    setFormData({
      ...formData,
      key_skills: formData.key_skills.filter(s => s !== skillToRemove)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields
    if (!formData.full_name || !formData.phone || !formData.job_id) {
      alert('Please fill all required fields (Name, Phone, Job)')
      return
    }

    // Check duplicates
    const isDuplicate = await checkDuplicate(formData.phone, formData.email)
    if (isDuplicate) {
      const confirm = window.confirm(
        `⚠️ DUPLICATE DETECTED!\n\n${duplicateWarning}\n\nAdd anyway?`
      )
      if (!confirm) return
    }

    setLoading(true)

    try {
      // Upload resume first if exists
      let resumeUrl = null
      if (resumeFile) {
        const fileExt = resumeFile.name.split('.').pop()
        const fileName = `${Date.now()}_${formData.full_name.replace(/\s+/g, '_')}.${fileExt}`
        const filePath = `resumes/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(filePath, resumeFile)

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('resumes')
            .getPublicUrl(filePath)
          resumeUrl = urlData.publicUrl
        }
      }

      // Insert candidate
      const { data, error } = await supabase
        .from('candidates')
        .insert([{
          ...formData,
          total_experience: parseFloat(formData.total_experience) || 0,
          relevant_experience: parseFloat(formData.relevant_experience) || 0,
          current_ctc: parseFloat(formData.current_ctc) || 0,
          expected_ctc: parseFloat(formData.expected_ctc) || 0,
          notice_period: parseInt(formData.notice_period) || 0,
          assigned_to: user.id,
          team_id: user.team_id,
          current_stage: 'sourced',
          date_sourced: new Date().toISOString(),
          last_activity_date: new Date().toISOString(),
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

      // Timeline
      await supabase.from('candidate_timeline').insert([{
        candidate_id: data[0].id,
        activity_type: 'candidate_created',
        activity_title: 'Candidate Created',
        activity_description: autoFilled 
          ? `Candidate added via AI-parsed resume (${(parseConfidence * 100).toFixed(0)}% confidence)`
          : 'Candidate added manually',
        metadata: {
          auto_filled: autoFilled,
          confidence: parseConfidence,
          skills_count: formData.key_skills.length,
        },
        performed_by: user.id,
      }])

      alert('✅ Candidate added successfully!')
      
      if (redirectPath) {
        router.push(redirectPath)
      } else if (userRole === 'team_leader') {
        router.push('/tl/candidates')
      } else {
        router.push('/recruiter/dashboard')
      }
    } catch (error: any) {
      console.error('Submit error:', error)
      alert('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Add New Candidate</h2>
        <p className="text-gray-600">Upload resume for AI-powered auto-fill or enter manually</p>
      </div>

      {/* 🔥 RESUME UPLOAD SECTION - FIRST */}
      <div className="card mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">
          🤖 AI-Powered Resume Parser
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Resume (PDF, Word, or Text) - Auto-fills form below
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
            <div className="flex items-center gap-3 text-blue-700">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-700"></div>
              <span className="text-sm font-medium">Parsing resume with AI...</span>
            </div>
          )}

          {autoFilled && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-800 mb-2">
                <span className="text-lg">✅</span>
                <span className="font-semibold">Resume Parsed Successfully!</span>
              </div>
              <p className="text-sm text-green-700">
                Confidence Score: <strong>{(parseConfidence * 100).toFixed(0)}%</strong>
              </p>
              <p className="text-xs text-green-600 mt-1">
                Please review auto-filled fields below and complete any missing information
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Duplicate Warning */}
      {duplicateWarning && (
        <div className="alert mb-6">
          <strong>⚠️ DUPLICATE DETECTED!</strong>
          <pre className="mt-2 text-sm whitespace-pre-wrap font-mono">{duplicateWarning}</pre>
          {existingCandidate && (
            <button
              type="button"
              onClick={() => router.push(`/${userRole === 'team_leader' ? 'tl' : 'recruiter'}/candidates/${existingCandidate.id}`)}
              className="mt-3 px-4 py-2 bg-white text-red-700 border border-red-300 rounded-lg text-sm font-medium hover:bg-red-50"
            >
              View Existing Candidate →
            </button>
          )}
        </div>
      )}

      {/* MAIN FORM */}
      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Basic Information */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            Basic Information
            {autoFilled && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">AI-Filled</span>}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`input ${duplicateWarning && formData.email ? 'border-red-500 border-2' : ''}`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone *
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className={`input ${duplicateWarning && formData.phone ? 'border-red-500 border-2' : ''}`}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Gender
              </label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="input"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date of Birth
              </label>
              <input
                type="date"
                name="date_of_birth"
                value={formData.date_of_birth}
                onChange={handleChange}
                className="input"
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Location
              </label>
              <input
                type="text"
                name="current_location"
                value={formData.current_location}
                onChange={handleChange}
                className="input"
                placeholder="e.g., Mumbai, Bangalore"
              />
            </div>
          </div>
        </div>

        {/* Job Assignment */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Assignment</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Job Role *
            </label>
            <select
              name="job_id"
              value={formData.job_id}
              onChange={handleChange}
              className="input"
              required
              disabled={!!preSelectedJobId}
            >
              <option value="">Select Job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.job_code && `${job.job_code} - `}{job.job_title} - {job.clients?.[0]?.company_name}
                </option>
              ))}
            </select>
            {jobs.length === 0 && !loading && (
              <p className="text-sm text-red-600 mt-2">
                ⚠️ No jobs available. {userRole === 'recruiter' ? 'Ask your team leader to assign jobs to you.' : 'Create a job first.'}
              </p>
            )}
          </div>
        </div>

        {/* Professional Details */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            Professional Details
            {autoFilled && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">AI-Filled</span>}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Company
              </label>
              <input
                type="text"
                name="current_company"
                value={formData.current_company}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Designation
              </label>
              <input
                type="text"
                name="current_designation"
                value={formData.current_designation}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Experience (Years)
              </label>
              <input
                type="number"
                step="0.5"
                name="total_experience"
                value={formData.total_experience}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Relevant Experience (Years)
              </label>
              <input
                type="number"
                step="0.5"
                name="relevant_experience"
                value={formData.relevant_experience}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current CTC (Lakhs)
              </label>
              <input
                type="number"
                step="0.1"
                name="current_ctc"
                value={formData.current_ctc}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expected CTC (Lakhs)
              </label>
              <input
                type="number"
                step="0.1"
                name="expected_ctc"
                value={formData.expected_ctc}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notice Period (Days)
              </label>
              <input
                type="number"
                name="notice_period"
                value={formData.notice_period}
                onChange={handleChange}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Education */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            Education
            {autoFilled && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">AI-Filled</span>}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Education Level
              </label>
              <select
                name="education_level"
                value={formData.education_level}
                onChange={handleChange}
                className="input"
              >
                <option value="">Select Level</option>
                <option value="High School">High School</option>
                <option value="Diploma">Diploma</option>
                <option value="Bachelor">Bachelor's</option>
                <option value="Master">Master's</option>
                <option value="PhD">PhD</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Degree
              </label>
              <input
                type="text"
                name="education_degree"
                value={formData.education_degree}
                onChange={handleChange}
                className="input"
                placeholder="e.g., B.Tech, MBA"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Field of Study
              </label>
              <input
                type="text"
                name="education_field"
                value={formData.education_field}
                onChange={handleChange}
                className="input"
                placeholder="e.g., Computer Science"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Institution
              </label>
              <input
                type="text"
                name="education_institution"
                value={formData.education_institution}
                onChange={handleChange}
                className="input"
                placeholder="e.g., IIT Delhi, Mumbai University"
              />
            </div>
          </div>
        </div>

        {/* Skills - AI-Powered */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            🤖 Key Skills (AI-Powered Suggestions)
            {autoFilled && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">AI-Filled</span>}
          </h3>
          
          <div className="space-y-4">
            {/* Current Skills */}
            {formData.key_skills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.key_skills.map((skill, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium flex items-center gap-2"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Add Skill Input */}
            <div className="relative">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => {
                  setSkillInput(e.target.value)
                  loadSkillSuggestions(e.target.value)
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddSkill(skillInput)
                  }
                }}
                className="input"
                placeholder="Type skill name and press Enter (e.g., React, Python, AWS)"
              />

              {/* Suggestions Dropdown */}
              {skillSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {skillSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleAddSkill(suggestion)}
                      className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500">
              💡 Start typing to see AI-powered suggestions based on our database
            </p>
          </div>
        </div>

        {/* Additional */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Source Portal
              </label>
              <select
                name="source_portal"
                value={formData.source_portal}
                onChange={handleChange}
                className="input"
              >
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                className="input"
                placeholder="Any additional notes..."
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-4 pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={loading}
            className={`btn-primary ${duplicateWarning ? 'bg-orange-600 hover:bg-orange-700' : ''}`}
          >
            {loading ? 'Adding...' : duplicateWarning ? '⚠️ Add Anyway' : autoFilled ? '✅ Save AI-Parsed Candidate' : 'Add Candidate'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-white border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:border-gray-400"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}