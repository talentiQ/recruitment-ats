//app/sr-tl/jobs/[id]/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const JOB_STATUS_OPTIONS = [
  { value: 'open',        label: 'Open',        color: 'bg-green-100 text-green-800 border-green-300',  dot: 'bg-green-500'  },
  { value: 'in_progress', label: 'In Progress',  color: 'bg-yellow-100 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500' },
  { value: 'on_hold',     label: 'On Hold',      color: 'bg-gray-100 text-gray-700 border-gray-300',    dot: 'bg-gray-500'   },
  { value: 'closed',      label: 'Closed',       color: 'bg-blue-100 text-blue-800 border-blue-300',    dot: 'bg-blue-500'   },
]

const PRIORITY_OPTIONS = ['high', 'medium', 'low']

export default function SrTLJobDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [job, setJob] = useState<any>(null)
  const [allocations, setAllocations] = useState<any[]>([])
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [statusSuccess, setStatusSuccess] = useState('')

  // ── Edit modal state ──
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  useEffect(() => {
    if (params.id) loadJob(params.id as string)
  }, [params.id])

  const loadJob = async (id: string) => {
    setLoading(true)

    const { data } = await supabase
      .from('jobs')
      .select(`*, clients(id, company_name)`)
      .eq('id', id)
      .single()

    setJob(data)

    const { data: assignmentData } = await supabase
      .from('job_recruiter_assignments')
      .select(`id, recruiter_id, positions_allocated, users:recruiter_id(full_name)`)
      .eq('job_id', id)
      .eq('is_active', true)

    setAllocations(assignmentData || [])

    const { data: teamData } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('is_active', true)
      .eq('role', 'recruiter')

    setTeamMembers(teamData || [])

    const { data: clientData } = await supabase
      .from('clients')
      .select('id, company_name')
      .order('company_name')

    setClients(clientData || [])
    setLoading(false)
  }

  // ── Edit handlers ──
  const openEdit = () => {
    setEditForm({
      job_title:      job.job_title,
      department:     job.department || '',
      location:       job.location,
      experience_min: job.experience_min,
      experience_max: job.experience_max,
      min_ctc:        job.min_ctc,
      max_ctc:        job.max_ctc,
      positions:      job.positions,
      priority:       job.priority,
      client_id:             job.client_id || job.clients?.id || '',
      job_description:       job.job_description       || '',
      key_skills:            job.key_skills            || '',
      nice_to_have_skills:   job.nice_to_have_skills   || '',
      education_requirement: job.education_requirement || '',
      work_mode:             job.work_mode             || 'Onsite',
      notice_period_pref:    job.notice_period_pref    || 'Any',
      job_type:              job.job_type              || '',
      target_close_date:     job.target_close_date     || '',
    })
    setEditError('')
    setEditOpen(true)
  }

  const handleEditChange = (field: string, value: any) => {
    setEditForm((prev: any) => ({ ...prev, [field]: value }))
  }

  const saveJob = async () => {
    setEditError('')

    // Basic validation
    if (!editForm.job_title?.trim())       return setEditError('Job title is required.')
    if (!editForm.location?.trim())        return setEditError('Location is required.')
    if (Number(editForm.experience_min) > Number(editForm.experience_max))
      return setEditError('Min experience cannot exceed max.')
    if (Number(editForm.min_ctc) > Number(editForm.max_ctc))
      return setEditError('Min CTC cannot exceed max CTC.')
    if (Number(editForm.positions) < 1)    return setEditError('Positions must be at least 1.')

    setSaving(true)
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          job_title:      editForm.job_title.trim(),
          department:     editForm.department.trim(),
          location:       editForm.location.trim(),
          experience_min: Number(editForm.experience_min),
          experience_max: Number(editForm.experience_max),
          min_ctc:        Number(editForm.min_ctc),
          max_ctc:        Number(editForm.max_ctc),
          positions:             Number(editForm.positions),
          priority:              editForm.priority,
          client_id:             editForm.client_id || undefined,
          job_description:       editForm.job_description       || null,
          key_skills:            editForm.key_skills            || null,
          nice_to_have_skills:   editForm.nice_to_have_skills   || null,
          education_requirement: editForm.education_requirement || null,
          work_mode:             editForm.work_mode             || null,
          notice_period_pref:    editForm.notice_period_pref    || null,
          job_type:              editForm.job_type              || null,
          target_close_date:     editForm.target_close_date     || null,
        })
        .eq('id', params.id)

      if (error) throw error

      // Reflect changes locally without full reload
      setJob((prev: any) => ({
        ...prev,
        job_title:      editForm.job_title.trim(),
        department:     editForm.department.trim(),
        location:       editForm.location.trim(),
        experience_min: Number(editForm.experience_min),
        experience_max: Number(editForm.experience_max),
        min_ctc:        Number(editForm.min_ctc),
        max_ctc:        Number(editForm.max_ctc),
        positions:      Number(editForm.positions),
        priority:       editForm.priority,
        clients:               clients.find(c => c.id === editForm.client_id) || prev.clients,
        job_description:       editForm.job_description       || null,
        key_skills:            editForm.key_skills            || null,
        nice_to_have_skills:   editForm.nice_to_have_skills   || null,
        education_requirement: editForm.education_requirement || null,
        work_mode:             editForm.work_mode             || null,
        notice_period_pref:    editForm.notice_period_pref    || null,
        job_type:              editForm.job_type              || null,
        target_close_date:     editForm.target_close_date     || null,
      }))

      setEditOpen(false)
    } catch (err) {
      console.error('Error saving job:', err)
      setEditError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Status handlers ──
  const handleStatusChange = (newStatus: string) => {
    if (newStatus === job.status) return
    if (newStatus === 'closed') {
      setConfirmClose(true)
    } else {
      applyStatusChange(newStatus)
    }
  }

  const applyStatusChange = async (newStatus: string) => {
    setConfirmClose(false)
    setUpdatingStatus(true)
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', params.id)

      if (error) throw error

      setJob((prev: any) => ({ ...prev, status: newStatus }))
      const label = JOB_STATUS_OPTIONS.find(o => o.value === newStatus)?.label || newStatus
      setStatusSuccess(`Status updated to "${label}"`)
      setTimeout(() => setStatusSuccess(''), 3000)
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const removeRecruiter = async (assignmentId: string) => {
    await supabase.from('job_recruiter_assignments').update({ is_active: false }).eq('id', assignmentId)
    loadJob(params.id as string)
  }

  const addRecruiter = async (recruiterId: string) => {
    if (!recruiterId) return
    await supabase.from('job_recruiter_assignments').insert([{
      job_id: params.id,
      recruiter_id: recruiterId,
      is_active: true,
      positions_allocated: 1,
    }])
    loadJob(params.id as string)
  }

  if (loading || !job) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    </DashboardLayout>
  )

  const currentStatusOpt = JOB_STATUS_OPTIONS.find(o => o.value === job.status)
  const progress = job.positions > 0 ? (job.positions_filled / job.positions) * 100 : 0
  const avgCTC = (job.min_ctc + job.max_ctc) / 2
  const billingPercent = 8
  const projectedRevenueLakhs = (avgCTC * job.positions * billingPercent) / 100

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Job Header */}
        <div className="card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{job.job_title}</h2>
              <p className="text-gray-600 mt-1">{job.clients?.company_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${currentStatusOpt?.color}`}>
                <span className={`w-2 h-2 rounded-full ${currentStatusOpt?.dot}`}></span>
                {currentStatusOpt?.label || job.status}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>📍 {job.location}</div>
            <div>💰 ₹{job.min_ctc}–{job.max_ctc}L</div>
            <div>📅 {job.experience_min}–{job.experience_max} yrs</div>
            <div>🎯 {job.positions_filled}/{job.positions} Positions Filled</div>
          </div>
        </div>

        {/* Status Management */}
        <div className="card border-2 border-blue-100">
          <h3 className="font-semibold text-gray-900 mb-4">⚙️ Update Job Status</h3>

          {statusSuccess && (
            <div className="mb-4 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium">
              ✅ {statusSuccess}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {JOB_STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                disabled={updatingStatus || job.status === opt.value}
                onClick={() => handleStatusChange(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 transition
                  ${job.status === opt.value
                    ? `${opt.color} border-current opacity-100 cursor-default ring-2 ring-offset-1 ring-current`
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900 disabled:opacity-50'
                  }`}
              >
                {updatingStatus && job.status !== opt.value ? (
                  <span className="flex items-center gap-1.5">
                    <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></span>
                    {opt.label}
                  </span>
                ) : (
                  <>{job.status === opt.value && '✓ '}{opt.label}</>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Closing a job will prevent recruiters from adding new candidates to it.
          </p>
        </div>

        {/* Pipeline Progress */}
        <div className="card">
          <h3 className="font-semibold mb-2">Pipeline Progress</h3>
          <div className="w-full bg-gray-200 rounded-full h-6">
            <div
              className="bg-green-600 h-6 rounded-full text-white text-center text-sm flex items-center justify-center transition-all"
              style={{ width: `${Math.max(progress, progress > 0 ? 8 : 0)}%` }}
            >
              {progress > 5 ? `${Math.round(progress)}%` : ''}
            </div>
          </div>
          {progress <= 5 && <p className="text-sm text-gray-500 mt-1">{Math.round(progress)}% filled</p>}
        </div>

        {/* Revenue Projection */}
        <div className="card bg-yellow-50 border border-yellow-300">
          <h3 className="font-semibold mb-2">Projected Revenue</h3>
          <div className="text-2xl font-bold text-yellow-800">
            ₹{projectedRevenueLakhs.toLocaleString('en-IN')}
          </div>
          <div className="text-sm text-gray-600">Based on avg CTC & {billingPercent}% billing</div>
        </div>

        {/* Recruiter Allocation */}
        <div className="card">
          <h3 className="font-semibold mb-4">Recruiter Allocation</h3>

          {allocations.length === 0 && (
            <p className="text-sm text-gray-500 mb-3">No recruiters assigned yet.</p>
          )}

          {allocations.map(a => (
            <div key={a.id} className="flex justify-between items-center border-b py-2">
              <div className="text-sm">
                <span className="font-medium">{a.users?.full_name}</span>
                <span className="text-gray-500 ml-2">({a.positions_allocated} position{a.positions_allocated !== 1 ? 's' : ''})</span>
              </div>
              <button onClick={() => removeRecruiter(a.id)} className="text-red-600 text-sm hover:text-red-800 font-medium">
                Remove
              </button>
            </div>
          ))}

          <div className="mt-4">
            <select
              onChange={e => { addRecruiter(e.target.value); (e.target as HTMLSelectElement).value = '' }}
              className="input"
              defaultValue=""
            >
              <option value="" disabled>+ Add Recruiter</option>
              {teamMembers
                .filter(m => !allocations.find(a => a.recruiter_id === m.id))
                .map(m => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))
              }
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 flex-wrap">
          <button
            onClick={() => router.push(`/sr-tl/candidates?jobId=${job.id}`)}
            className="btn-primary"
          >
            View Candidates
          </button>
          <button
            onClick={() => router.push(`/sr-tl/jobs/${job.id}/add-candidate`)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium transition"
          >
            + Add Candidate
          </button>
          {/* ── Edit Job button ── */}
          <button
            onClick={openEdit}
            className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 font-medium transition"
          >
            ✏️ Edit Job
          </button>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium transition"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* ── Edit Job Modal ── */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 my-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">✏️ Edit Job</h3>
              <button onClick={() => setEditOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            {editError && (
              <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {editError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Job Title */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
                <input
                  type="text"
                  value={editForm.job_title}
                  onChange={e => handleEditChange('job_title', e.target.value)}
                  className="input w-full"
                  placeholder="e.g. Senior Software Engineer"
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <input
                  type="text"
                  value={editForm.department}
                  onChange={e => handleEditChange('department', e.target.value)}
                  className="input w-full"
                  placeholder="e.g. Engineering"
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                <input
                  type="text"
                  value={editForm.location}
                  onChange={e => handleEditChange('location', e.target.value)}
                  className="input w-full"
                  placeholder="e.g. Bangalore"
                />
              </div>

              {/* Experience */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Experience Min (yrs) *</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.experience_min}
                  onChange={e => handleEditChange('experience_min', e.target.value)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Experience Max (yrs) *</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.experience_max}
                  onChange={e => handleEditChange('experience_max', e.target.value)}
                  className="input w-full"
                />
              </div>

              {/* CTC */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min CTC (L) *</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.min_ctc}
                  onChange={e => handleEditChange('min_ctc', e.target.value)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max CTC (L) *</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.max_ctc}
                  onChange={e => handleEditChange('max_ctc', e.target.value)}
                  className="input w-full"
                />
              </div>

              {/* Positions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Positions *</label>
                <input
                  type="number"
                  min={1}
                  value={editForm.positions}
                  onChange={e => handleEditChange('positions', e.target.value)}
                  className="input w-full"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority *</label>
                <select
                  value={editForm.priority}
                  onChange={e => handleEditChange('priority', e.target.value)}
                  className="input w-full"
                >
                  {PRIORITY_OPTIONS.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Client */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                <select
                  value={editForm.client_id}
                  onChange={e => handleEditChange('client_id', e.target.value)}
                  className="input w-full"
                >
                  <option value="">— Select Client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
              </div>

              {/* Job Type & Target Close Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
                <select
                  value={editForm.job_type}
                  onChange={e => handleEditChange('job_type', e.target.value)}
                  className="input w-full"
                >
                  <option value="">— Select —</option>
                  {['Full-Time', 'Part-Time', 'Contract', 'Freelance', 'Internship'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Close Date</label>
                <input
                  type="date"
                  value={editForm.target_close_date}
                  onChange={e => handleEditChange('target_close_date', e.target.value)}
                  className="input w-full"
                />
              </div>

              {/* Work Mode & Notice Period */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Mode</label>
                <select
                  value={editForm.work_mode}
                  onChange={e => handleEditChange('work_mode', e.target.value)}
                  className="input w-full"
                >
                  {['Onsite', 'Remote', 'Hybrid'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notice Period Preference</label>
                <select
                  value={editForm.notice_period_pref}
                  onChange={e => handleEditChange('notice_period_pref', e.target.value)}
                  className="input w-full"
                >
                  {['Any', 'Immediate', '15 Days', '30 Days', '60 Days', '90 Days'].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Key Skills */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Key Skills</label>
                <textarea
                  value={editForm.key_skills}
                  onChange={e => handleEditChange('key_skills', e.target.value)}
                  className="input w-full"
                  rows={3}
                  placeholder="e.g. React, Node.js, PostgreSQL (comma or newline separated)"
                />
              </div>

              {/* Nice to Have Skills */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nice to Have Skills</label>
                <textarea
                  value={editForm.nice_to_have_skills}
                  onChange={e => handleEditChange('nice_to_have_skills', e.target.value)}
                  className="input w-full"
                  rows={2}
                  placeholder="e.g. AWS, Docker, GraphQL"
                />
              </div>

              {/* Education Requirement */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Education Requirement</label>
                <input
                  type="text"
                  value={editForm.education_requirement}
                  onChange={e => handleEditChange('education_requirement', e.target.value)}
                  className="input w-full"
                  placeholder="e.g. B.Tech / B.E. in Computer Science"
                />
              </div>

              {/* Job Description */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
                <textarea
                  value={editForm.job_description}
                  onChange={e => handleEditChange('job_description', e.target.value)}
                  className="input w-full"
                  rows={5}
                  placeholder="Roles, responsibilities, and any additional details…"
                />
              </div>

            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={saveJob}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Close Modal ── */}
      {confirmClose && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-center mb-4">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-lg font-bold text-gray-900">Close this job?</h3>
              <p className="text-sm text-gray-600 mt-2">
                <span className="font-semibold">{job.job_title}</span> will be marked as{' '}
                <span className="font-semibold text-blue-700">Closed</span>.
                Recruiters will no longer be able to add candidates to it.
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmClose(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={() => applyStatusChange('closed')}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition"
              >
                Yes, Close Job
              </button>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  )
}