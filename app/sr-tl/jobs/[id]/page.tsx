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

export default function SrTLJobDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [job, setJob] = useState<any>(null)
  const [allocations, setAllocations] = useState<any[]>([])
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [statusSuccess, setStatusSuccess] = useState('')

  useEffect(() => {
    if (params.id) loadJob(params.id as string)
  }, [params.id])

  const loadJob = async (id: string) => {
    setLoading(true)

    const { data } = await supabase
      .from('jobs')
      .select(`*, clients(company_name)`)
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
    setLoading(false)
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
            {/* Current status badge */}
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${currentStatusOpt?.color}`}>
                <span className={`w-2 h-2 rounded-full ${currentStatusOpt?.dot}`}></span>
                {currentStatusOpt?.label || job.status}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>📍 {job.location}</div>
            <div>💰 ₹{job.min_ctc}–{job.max_ctc}</div>
            <div>📅 {job.experience_min}–{job.experience_max} yrs</div>
            <div>🎯 {job.positions_filled}/{job.positions} Positions Filled</div>
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
                  <>
                    {job.status === opt.value && '✓ '}
                    {opt.label}
                  </>
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
            ₹{(projectedRevenueLakhs).toLocaleString('en-IN')}
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
        <div className="flex gap-4">
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
          <button
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium transition"
          >
            ← Back
          </button>
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
                <span className="font-semibold">{job.job_title}</span> will be marked as <span className="font-semibold text-blue-700">Closed</span>.
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