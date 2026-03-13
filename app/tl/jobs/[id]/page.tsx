// app/tl/jobs/[id]/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const JOB_STATUS_OPTIONS = [
  { value: 'open',        label: 'Open',        color: 'bg-green-100 text-green-800 border-green-300',   dot: 'bg-green-500'  },
  { value: 'in_progress', label: 'In Progress',  color: 'bg-yellow-100 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500' },
  { value: 'on_hold',     label: 'On Hold',      color: 'bg-gray-100 text-gray-700 border-gray-300',     dot: 'bg-gray-500'   },
  { value: 'closed',      label: 'Closed',       color: 'bg-blue-100 text-blue-800 border-blue-300',     dot: 'bg-blue-500'   },
]

export default function JobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [assignedRecruiters, setAssignedRecruiters] = useState<string[]>([])
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [statusSuccess, setStatusSuccess] = useState('')

  useEffect(() => {
    if (params.id) {
      loadJob(params.id as string)
      loadTeamMembers()
    }
  }, [params.id])

  const loadJob = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          clients (
            id,
            company_name,
            contact_person,
            contact_email,
            fee_percentage
          )
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setJob(data)

      const { data: candidates } = await supabase
        .from('candidates')
        .select('assigned_to')
        .eq('job_id', id)

      if (candidates) {
        const uniqueRecruiters = [...new Set(candidates.map(c => c.assigned_to))]
        setAssignedRecruiters(uniqueRecruiters as string[])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTeamMembers = async () => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}')
    const { data } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('team_id', userData.team_id)
      .eq('role', 'recruiter')

    if (data) setTeamMembers(data)
  }

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
      const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', params.id)
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

  const handleUpdate = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          job_title: job.job_title,
          department: job.department,
          location: job.location,
          experience_min: job.experience_min,
          experience_max: job.experience_max,
          min_ctc: job.min_ctc,
          max_ctc: job.max_ctc,
          positions: job.positions,
          status: job.status,
          priority: job.priority,
          job_description: job.job_description,
          key_skills: job.key_skills,
        })
        .eq('id', job.id)

      if (error) throw error
      alert('✅ Job updated successfully!')
      setEditing(false)
      loadJob(job.id)
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  if (!job) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">Job not found</p>
        </div>
      </DashboardLayout>
    )
  }

  const currentStatusOpt = JOB_STATUS_OPTIONS.find(o => o.value === job.status)

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <button
              onClick={() => router.push('/tl/jobs')}
              className="text-sm text-gray-600 hover:text-gray-900 mb-2"
            >
              ← Back to Jobs
            </button>
            <h2 className="text-2xl font-bold text-gray-900">{job.job_title}</h2>
            <p className="text-gray-600">{job.clients?.company_name}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Current status badge */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${currentStatusOpt?.color}`}>
              <span className={`w-2 h-2 rounded-full ${currentStatusOpt?.dot}`}></span>
              {currentStatusOpt?.label || job.status}
            </span>
            {!editing ? (
              <button onClick={() => setEditing(true)} className="btn-primary">
                Edit Job
              </button>
            ) : (
              <>
                <button onClick={handleUpdate} disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditing(false)} className="bg-gray-200 px-4 py-2 rounded-lg font-medium">
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Status Management ── */}
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

        {/* Job Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="kpi-card">
            <div className="kpi-title">Positions</div>
            <div className="kpi-value">{job.positions_filled}/{job.positions}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Recruiters Active</div>
            <div className="kpi-value">{assignedRecruiters.length}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Priority</div>
            <div className="kpi-value text-xl">{job.priority?.toUpperCase()}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Status</div>
            <div className="kpi-value text-xl">{currentStatusOpt?.label || job.status}</div>
          </div>
        </div>

        {/* Job Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="card-title">Job Information</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Department</dt>
                <dd className="mt-1">
                  {editing ? (
                    <input
                      type="text"
                      value={job.department || ''}
                      onChange={e => setJob({ ...job, department: e.target.value })}
                      className="input"
                    />
                  ) : (
                    <span className="text-sm text-gray-900">{job.department || 'N/A'}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Location</dt>
                <dd className="mt-1">
                  {editing ? (
                    <input
                      type="text"
                      value={job.location}
                      onChange={e => setJob({ ...job, location: e.target.value })}
                      className="input"
                    />
                  ) : (
                    <span className="text-sm text-gray-900">{job.location}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Experience Range</dt>
                <dd className="mt-1 text-sm text-gray-900">{job.experience_min}-{job.experience_max} years</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">CTC Range</dt>
                <dd className="mt-1 text-sm text-gray-900">₹{job.min_ctc}-{job.max_ctc} Lakhs</dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <h3 className="card-title">Client Information</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Company</dt>
                <dd className="mt-1 text-sm text-gray-900">{job.clients?.company_name}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Contact Person</dt>
                <dd className="mt-1 text-sm text-gray-900">{job.clients?.contact_person || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Contact Email</dt>
                <dd className="mt-1 text-sm text-gray-900">{job.clients?.contact_email || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Fee Structure</dt>
                <dd className="mt-1 text-sm text-gray-900">{job.clients?.fee_percentage}%</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Job Description */}
        <div className="card">
          <h3 className="card-title">Job Description</h3>
          {editing ? (
            <textarea
              value={job.job_description || ''}
              onChange={e => setJob({ ...job, job_description: e.target.value })}
              rows={6}
              className="input"
            />
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {job.job_description || 'No description provided'}
            </p>
          )}
        </div>

        {/* Key Skills */}
        <div className="card">
          <h3 className="card-title">Key Skills Required</h3>
          {editing ? (
            <textarea
              value={job.key_skills || ''}
              onChange={e => setJob({ ...job, key_skills: e.target.value })}
              rows={3}
              className="input"
              placeholder="e.g., Java, Spring Boot, Microservices, AWS"
            />
          ) : (
            <p className="text-sm text-gray-700">{job.key_skills || 'No skills specified'}</p>
          )}
        </div>

        {/* Assigned Recruiters */}
        <div className="card">
          <h3 className="card-title">Team Members Working on This Job</h3>
          <div className="space-y-2">
            {assignedRecruiters.length > 0 ? (
              teamMembers
                .filter(m => assignedRecruiters.includes(m.id))
                .map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">{member.full_name}</span>
                    <span className="text-sm text-gray-600">Active</span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-gray-600">No recruiters assigned yet</p>
            )}
          </div>
        </div>
      </div>

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