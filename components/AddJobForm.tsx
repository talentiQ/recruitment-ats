// components/AddJobForm.tsx
// Shared job creation form used by both /tl/jobs/add and /sr-tl/jobs/add.
// Role-specific differences (team loading, redirect path) injected via props.

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface TeamMember {
  id: string
  full_name: string
  email: string
  role: string
}

interface AddJobFormProps {
  /** 'tl' loads only direct recruiter reports; 'sr_team_leader' loads full hierarchy */
  userRole: 'team_leader' | 'sr_team_leader'
  /** Where to redirect after successful job creation */
  successRedirect: string
  /** Section heading text for the assignment block */
  assignLabel?: string
}

export default function AddJobForm({
  userRole,
  successRedirect,
  assignLabel = 'Assign Team Members',
}: AddJobFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [user, setUser] = useState<any>(null)
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])

  // Tag inputs
  const [requiredSkills, setRequiredSkills] = useState<string[]>([])
  const [niceSkills, setNiceSkills] = useState<string[]>([])
  const [reqSkillInput, setReqSkillInput] = useState('')
  const [niceSkillInput, setNiceSkillInput] = useState('')

  // Validation
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const [formData, setFormData] = useState({
    client_id: '',
    job_title: '',
    department: '',
    location: '',
    job_type: 'Full-time',
    experience_min: '',
    experience_max: '',
    min_ctc: '',
    max_ctc: '',
    positions: '1',
    job_description: '',
    priority: 'medium',
    target_close_date: '',
    education_requirement: '',
    work_mode: 'Onsite',
    notice_period_pref: 'Any',
  })

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadClients()
      if (userRole === 'team_leader') {
        loadTLMembers(parsedUser)
      } else {
        loadSrTLMembers(parsedUser.id)
      }
    }
  }, [])

  const loadClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, company_name')
      .eq('status', 'active')
      .order('company_name')
    if (data) setClients(data)
  }

  /** TL: include self + direct recruiter reports */
  const loadTLMembers = async (currentUser: any) => {
    try {
      const { data: recruiters } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .eq('reports_to', currentUser.id)
        .eq('role', 'recruiter')
        .order('full_name')

      setTeamMembers([
        { id: currentUser.id, full_name: currentUser.full_name + ' (You)', email: currentUser.email, role: 'team_leader' },
        ...(recruiters || []),
      ])
    } catch (err) {
      console.error(err)
    }
  }

  /** Sr-TL: direct reports (TLs + their recruiters) */
  const loadSrTLMembers = async (srTlId: string) => {
    try {
      const { data: directReports } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .eq('reports_to', srTlId)
        .eq('is_active', true)
        .order('full_name')

      const tlIds = directReports?.filter(m => m.role === 'team_leader').map(m => m.id) || []
      let indirectRecruiters: any[] = []

      if (tlIds.length > 0) {
        const { data: underTLs } = await supabase
          .from('users')
          .select('id, full_name, email, role')
          .in('reports_to', tlIds)
          .eq('role', 'recruiter')
          .eq('is_active', true)
          .order('full_name')
        indirectRecruiters = underTLs || []
      }

      setTeamMembers([...(directReports || []), ...indirectRecruiters])
    } catch (err) {
      console.error(err)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    if (formErrors[e.target.name]) {
      setFormErrors(prev => { const n = { ...prev }; delete n[e.target.name]; return n })
    }
  }

  const toggleMember = (id: string) =>
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  const addSkill = (type: 'required' | 'nice') => {
    if (type === 'required') {
      const v = reqSkillInput.trim()
      if (v && !requiredSkills.includes(v)) {
        setRequiredSkills(prev => [...prev, v])
        if (formErrors.required_skills) setFormErrors(prev => { const n = { ...prev }; delete n.required_skills; return n })
      }
      setReqSkillInput('')
    } else {
      const v = niceSkillInput.trim()
      if (v && !niceSkills.includes(v)) setNiceSkills(prev => [...prev, v])
      setNiceSkillInput('')
    }
  }

  const removeSkill = (type: 'required' | 'nice', skill: string) => {
    if (type === 'required') setRequiredSkills(prev => prev.filter(s => s !== skill))
    else setNiceSkills(prev => prev.filter(s => s !== skill))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // ── Validation ──────────────────────────────────────────────────────────
    const errors: Record<string, string> = {}
    if (!formData.client_id)             errors.client_id             = 'Please select a client'
    if (!formData.job_title.trim())      errors.job_title             = 'Job title is required'
    if (!formData.location.trim())       errors.location              = 'Location is required'
    if (!formData.education_requirement) errors.education_requirement = 'Education requirement is required'
    if (requiredSkills.length === 0)     errors.required_skills       = 'Add at least one required skill'
    if (selectedMembers.length === 0)    errors.members               = 'Assign at least one team member'

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      document.querySelector('[data-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setFormErrors({})
    setLoading(true)

    try {
      // For TL: get fresh team_id from DB
      let teamId = user.team_id
      if (userRole === 'team_leader') {
        const { data: freshUser } = await supabase
          .from('users')
          .select('team_id')
          .eq('id', user.id)
          .single()
        if (!freshUser?.team_id) {
          alert('Error: Could not determine your team. Please re-login.')
          setLoading(false)
          return
        }
        teamId = freshUser.team_id
      }

      // Combine required + nice-to-have into key_skills for match engine
      // key_skills stays as required only (drives 45pt score)
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .insert([{
          client_id:            formData.client_id,
          job_title:            formData.job_title,
          department:           formData.department,
          location:             formData.location,
          job_type:             formData.job_type,
          experience_min:       parseInt(formData.experience_min) || 0,
          experience_max:       parseInt(formData.experience_max) || 0,
          min_ctc:              parseFloat(formData.min_ctc) || 0,
          max_ctc:              parseFloat(formData.max_ctc) || 0,
          positions:            parseInt(formData.positions) || 1,
          job_description:      formData.job_description,
          key_skills:           requiredSkills.join(', '),        // required only → match engine
          nice_to_have_skills:  niceSkills.join(', '),
          education_requirement: formData.education_requirement,
          work_mode:            formData.work_mode,
          notice_period_pref:   formData.notice_period_pref,
          priority:             formData.priority,
          target_close_date:    formData.target_close_date || null,
          assigned_team_id:     teamId,
          status:               'open',
          created_by:           user.id,
        }])
        .select()

      if (jobError) throw jobError

      const jobId   = jobData[0].id
      const jobCode = jobData[0].job_code

      const assignments = selectedMembers.map(memberId => ({
        job_id:              jobId,
        recruiter_id:        memberId,
        assigned_by:         user.id,
        is_active:           true,
        positions_allocated: parseInt(formData.positions) || 1,
      }))

      const { error: assignError } = await supabase
        .from('job_recruiter_assignments')
        .insert(assignments)

      if (assignError) throw assignError

      alert(
        `✅ Job created successfully!\n\n` +
        `Job Code: ${jobCode}\n` +
        `Positions: ${formData.positions}\n` +
        `Required Skills: ${requiredSkills.length}\n` +
        `Assigned to: ${selectedMembers.length} member(s)`
      )

      router.push(successRedirect)
    } catch (error: any) {
      console.error('Error creating job:', error)
      alert('Error: ' + (error.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const getRoleBadge = (role: string) =>
    role === 'team_leader'
      ? <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-semibold rounded">TL</span>
      : <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-semibold rounded">Recruiter</span>

  const ErrorMsg = ({ field }: { field: string }) =>
    formErrors[field]
      ? <p className="text-xs text-red-600 mt-1">{formErrors[field]}</p>
      : null

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* Validation summary */}
      {Object.keys(formErrors).length > 0 && (
        <div data-error className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800 font-semibold mb-2">⚠️ Please fix the following:</div>
          <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
            {Object.values(formErrors).map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {/* ── 1. Basic Information ──────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
        <div className="grid grid-cols-2 gap-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Client <span className="text-red-500">*</span></label>
            <select name="client_id" value={formData.client_id} onChange={handleChange}
              className={`input ${formErrors.client_id ? 'border-red-500 border-2' : ''}`} required>
              <option value="">Select Client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
            <ErrorMsg field="client_id" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Job Title <span className="text-red-500">*</span></label>
            <input type="text" name="job_title" value={formData.job_title} onChange={handleChange}
              className={`input ${formErrors.job_title ? 'border-red-500 border-2' : ''}`}
              placeholder="e.g., Senior Java Developer" required />
            <ErrorMsg field="job_title" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
            <input type="text" name="department" value={formData.department} onChange={handleChange}
              className="input" placeholder="e.g., Engineering, Sales, HR" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Location <span className="text-red-500">*</span></label>
            <input type="text" name="location" value={formData.location} onChange={handleChange}
              className={`input ${formErrors.location ? 'border-red-500 border-2' : ''}`}
              placeholder="e.g., Bangalore, Mumbai, Delhi NCR" required />
            <ErrorMsg field="location" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Job Type</label>
            <select name="job_type" value={formData.job_type} onChange={handleChange} className="input">
              <option value="Full-time">Full-time</option>
              <option value="Contract">Contract</option>
              <option value="Part-time">Part-time</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Work Mode</label>
            <select name="work_mode" value={formData.work_mode} onChange={handleChange} className="input">
              <option value="Onsite">Onsite</option>
              <option value="Remote">Remote</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Number of Positions</label>
            <input type="number" name="positions" value={formData.positions} onChange={handleChange} className="input" min="1" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
            <select name="priority" value={formData.priority} onChange={handleChange} className="input">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Target Close Date</label>
            <input type="date" name="target_close_date" value={formData.target_close_date} onChange={handleChange}
              className="input" min={new Date().toISOString().split('T')[0]} />
          </div>
        </div>
      </div>

      {/* ── 2. Requirements ───────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Requirements</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Min Experience (Years)</label>
            <input type="number" name="experience_min" value={formData.experience_min} onChange={handleChange} className="input" min="0" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Max Experience (Years)</label>
            <input type="number" name="experience_max" value={formData.experience_max} onChange={handleChange} className="input" min="0" placeholder="15" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Min CTC (Lakhs)</label>
            <input type="number" step="0.1" name="min_ctc" value={formData.min_ctc} onChange={handleChange} className="input" placeholder="e.g., 6" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Max CTC (Lakhs)</label>
            <input type="number" step="0.1" name="max_ctc" value={formData.max_ctc} onChange={handleChange} className="input" placeholder="e.g., 12" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Education Requirement <span className="text-red-500">*</span>
            </label>
            <select name="education_requirement" value={formData.education_requirement} onChange={handleChange}
              className={`input ${formErrors.education_requirement ? 'border-red-500 border-2' : ''}`}>
              <option value="">Select minimum education</option>
              <option value="Any">Any (No specific requirement)</option>
              <option value="Graduate">Any Graduate</option>
              <option value="B.Tech / B.E.">B.Tech / B.E.</option>
              <option value="BCA / B.Sc (CS)">BCA / B.Sc (CS)</option>
              <option value="BBA / B.Com">BBA / B.Com</option>
              <option value="Post-Graduate">Any Post-Graduate</option>
              <option value="MBA">MBA</option>
              <option value="M.Tech / M.E.">M.Tech / M.E.</option>
              <option value="MCA">MCA</option>
              <option value="CA / CPA">CA / CPA</option>
              <option value="PhD">PhD</option>
            </select>
            <ErrorMsg field="education_requirement" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Notice Period</label>
            <select name="notice_period_pref" value={formData.notice_period_pref} onChange={handleChange} className="input">
              <option value="Any">Any (Flexible)</option>
              <option value="Immediate">Immediate Joiner</option>
              <option value="Up to 15 days">Up to 15 days</option>
              <option value="Up to 30 days">Up to 30 days</option>
              <option value="Up to 60 days">Up to 60 days</option>
              <option value="Up to 90 days">Up to 90 days</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 3. Skills ─────────────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Skills</h3>
        <p className="text-sm text-gray-500 mb-4">
          Required skills drive the AI match score (45 pts). Nice-to-have skills are informational only.
        </p>

        {/* Required Skills */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Required Skills <span className="text-red-500">*</span>
            <span className="ml-2 text-xs font-normal text-gray-400">— used directly in AI candidate matching</span>
          </label>

          {formErrors.required_skills && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              ⚠️ {formErrors.required_skills}
            </div>
          )}

          {requiredSkills.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {requiredSkills.map(skill => (
                <span key={skill} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium flex items-center gap-2 border border-blue-200">
                  {skill}
                  <button type="button" onClick={() => removeSkill('required', skill)} className="text-blue-500 hover:text-blue-900 font-bold">×</button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={reqSkillInput}
              onChange={e => setReqSkillInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill('required') } }}
              className={`input flex-1 ${formErrors.required_skills && requiredSkills.length === 0 ? 'border-red-500 border-2' : ''}`}
              placeholder="e.g., Java, Spring Boot, SQL — press Enter to add"
            />
            <button type="button" onClick={() => addSkill('required')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              Add
            </button>
          </div>
        </div>

        {/* Nice to Have */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nice-to-Have Skills
            <span className="ml-2 text-xs font-normal text-gray-400">— optional, shown to recruiters as context</span>
          </label>

          {niceSkills.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {niceSkills.map(skill => (
                <span key={skill} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium flex items-center gap-2 border border-green-200">
                  {skill}
                  <button type="button" onClick={() => removeSkill('nice', skill)} className="text-green-500 hover:text-green-900 font-bold">×</button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={niceSkillInput}
              onChange={e => setNiceSkillInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill('nice') } }}
              className="input flex-1"
              placeholder="e.g., Docker, Kubernetes — press Enter to add"
            />
            <button type="button" onClick={() => addSkill('nice')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              Add
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. Job Description ────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Job Description</h3>
        <p className="text-sm text-gray-500 mb-4">
          A detailed JD improves the AI keyword match score significantly (20 pts). Be specific about day-to-day responsibilities.
        </p>
        <textarea
          name="job_description"
          value={formData.job_description}
          onChange={handleChange}
          rows={7}
          className="input"
          placeholder={`Describe the role in detail:\n\n• Day-to-day responsibilities\n• Team size and reporting structure\n• Key projects the candidate will work on\n• Tools and technologies used\n• What success looks like in this role\n• Growth opportunities\n\nThe more detail here, the better the AI can match resumes to this role.`}
        />
        <p className="text-xs text-gray-400 mt-1">
          💡 Tip: Include specific tools, technologies, and domain terms — these become keywords for AI resume matching.
        </p>
      </div>

      {/* ── 5. Team Assignment ────────────────────────────────────────────── */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          {assignLabel} <span className="text-red-500">*</span>
          {selectedMembers.length > 0 && (
            <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded font-normal">
              {selectedMembers.length} selected
            </span>
          )}
        </h3>

        {formErrors.members && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            ⚠️ {formErrors.members}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
          All assigned members can add CVs for this job. More recruiters = faster pipeline!
        </div>

        {teamMembers.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            No team members available.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {teamMembers.map(member => (
              <label key={member.id}
                className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition ${
                  selectedMembers.includes(member.id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input type="checkbox" checked={selectedMembers.includes(member.id)}
                  onChange={() => toggleMember(member.id)} className="w-5 h-5 text-blue-600 rounded" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-gray-900">{member.full_name}</span>
                    {getRoleBadge(member.role)}
                  </div>
                  <div className="text-sm text-gray-500">{member.email}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex gap-4 pt-2">
        <button type="submit" disabled={loading}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed px-8">
          {loading ? 'Creating...' : 'Create Job & Assign Team'}
        </button>
        <button type="button" onClick={() => router.back()}
          className="bg-white border border-gray-300 px-6 py-2 rounded-lg hover:border-gray-400">
          Cancel
        </button>
      </div>
    </form>
  )
}
