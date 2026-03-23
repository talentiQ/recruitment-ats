// app/sr-tl/jobs/page.tsx
'use client'
import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Job {
  id: string
  job_code: string
  job_title: string
  department: string
  location: string
  experience_min: number
  experience_max: number
  min_ctc: number
  max_ctc: number
  positions: number
  positions_filled: number
  candidate_count: number
  in_progress_count: number
  status: string
  priority: string
  created_at: string
  clients: {
    company_name: string
  }
  recruiter_count: number
  recruiter_allocations: { id: string; name: string; positions: number }[]
}

const IN_PROGRESS_STAGES = [
  'sourced', 'screening', 'interview_scheduled', 'interview_completed',
  'documentation', 'offer_extended', 'offer_accepted', 'on_hold',
]

const JOB_STATUS_OPTIONS = [
  { value: 'open',        label: 'Open',        color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'in_progress', label: 'In Progress',  color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'on_hold',     label: 'On Hold',      color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'closed',      label: 'Closed',       color: 'bg-blue-100 text-blue-800 border-blue-300' },
]

export default function SrTLJobsPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [user, setUser] = useState<any>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ jobId: string; jobTitle: string; newStatus: string } | null>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadJobs(parsedUser.team_id)
    }
  }, [])

  const loadJobs = async (teamId: string) => {
    setLoading(true)
    try {
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select(`
          *,
          clients (company_name),
          candidates (id, current_stage)
        `)
        .eq('assigned_team_id', teamId)
        .order('created_at', { ascending: false })

      if (jobsError) throw jobsError

      const jobIds = jobsData?.map(j => j.id) || []

      const { data: assignments } = await supabase
        .from('job_recruiter_assignments')
        .select(`
          job_id,
          positions_allocated,
          users:recruiter_id (id, full_name)
        `)
        .in('job_id', jobIds)
        .eq('is_active', true)

      const assignmentsByJob: { [key: string]: any[] } = {}
      assignments?.forEach(a => {
        if (!assignmentsByJob[a.job_id]) assignmentsByJob[a.job_id] = []
        const u = Array.isArray(a.users) ? a.users[0] : a.users
        assignmentsByJob[a.job_id].push({ id: u.id, name: u.full_name, positions: a.positions_allocated })
      })

      const jobsWithAllocations = jobsData?.map(job => {
        const candidates = job.candidates || []
        const inProgressCount = candidates.filter((c: any) =>
          IN_PROGRESS_STAGES.includes(c.current_stage)
        ).length

        return {
          ...job,
          candidate_count: candidates.length,
          in_progress_count: inProgressCount,
          recruiter_count: assignmentsByJob[job.id]?.length || 0,
          recruiter_allocations: assignmentsByJob[job.id] || []
        }
      }) || []

      setJobs(jobsWithAllocations)
    } catch (error) {
      console.error('Error loading jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = (jobId: string, jobTitle: string, newStatus: string) => {
    if (newStatus === 'closed') {
      setConfirmModal({ jobId, jobTitle, newStatus })
    } else {
      applyStatusChange(jobId, newStatus)
    }
  }

  const applyStatusChange = async (jobId: string, newStatus: string) => {
    setConfirmModal(null)
    setUpdatingStatus(jobId)
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', jobId)

      if (error) throw error

      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
    } catch (error) {
      console.error('Error updating job status:', error)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdatingStatus(null)
    }
  }

  // ── Search + status filter applied together ──
  const filteredJobs = jobs.filter(j => {
    const matchesStatus = statusFilter === 'all' || j.status === statusFilter
    const q = searchQuery.toLowerCase().trim()
    const matchesSearch = !q || (
      j.job_title?.toLowerCase().includes(q) ||
      j.location?.toLowerCase().includes(q) ||
      j.clients?.company_name?.toLowerCase().includes(q) ||
      j.job_code?.toLowerCase().includes(q)
    )
    return matchesStatus && matchesSearch
  })

  const getStatusBadge = (status: string) => {
    const opt = JOB_STATUS_OPTIONS.find(o => o.value === status)
    return opt?.color || 'bg-gray-100 text-gray-700 border-gray-300'
  }

  const getPriorityBadge = (priority: string) => {
    const badges: { [key: string]: string } = {
      high:   'badge-danger',
      medium: 'badge-warning',
      low:    'bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-semibold'
    }
    return badges[priority] || 'badge-warning'
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">

        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">All Team Jobs</h2>
            <p className="text-gray-600">Manage job assignments and track progress</p>
          </div>
          <button onClick={() => router.push('/sr-tl/jobs/add')} className="btn-primary">
            + Add New Job
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="kpi-card">
            <div className="kpi-title">Total Jobs</div>
            <div className="kpi-value">{jobs.length}</div>
          </div>
          <div className="kpi-card kpi-success">
            <div className="kpi-title">Open</div>
            <div className="kpi-value">{jobs.filter(j => j.status === 'open').length}</div>
          </div>
          <div className="kpi-card kpi-warning">
            <div className="kpi-title">In Progress Candidates</div>
            <div className="kpi-value">{jobs.reduce((sum, j) => sum + (j.in_progress_count || 0), 0)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Total Candidates</div>
            <div className="kpi-value">{jobs.reduce((sum, j) => sum + (j.candidate_count || 0), 0)}</div>
          </div>
        </div>

        {/* ── Search + Filter ── */}
        <div className="card">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by job title, location, client or job code…"
                className="input w-full pl-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Status filter */}
            <div className="sm:w-48">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="input w-full"
              >
                <option value="all">All Statuses</option>
                {JOB_STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Result count hint */}
          {(searchQuery || statusFilter !== 'all') && (
            <p className="text-xs text-gray-500 mt-2">
              Showing <span className="font-semibold text-gray-700">{filteredJobs.length}</span> of {jobs.length} jobs
              {searchQuery && <> matching "<span className="font-semibold">{searchQuery}</span>"</>}
            </p>
          )}
        </div>

        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 text-lg mb-1">No jobs found</p>
            {(searchQuery || statusFilter !== 'all') && (
              <p className="text-sm text-gray-400 mb-4">Try clearing your search or filter</p>
            )}
            {!searchQuery && statusFilter === 'all' && (
              <button onClick={() => router.push('/sr-tl/jobs/add')} className="mt-4 btn-primary">
                Create First Job
              </button>
            )}
            {(searchQuery || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter('all') }}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Job Code</th>
                  <th>Job Title</th>
                  <th>Client</th>
                  <th>Location</th>
                  <th>Experience</th>
                  <th>CTC Range</th>
                  <th>Positions</th>
                  <th>Candidates</th>
                  <th>In Progress</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Recruiters</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map(job => (
                  <tr key={job.id}>
                    <td>
                      <span className="font-mono font-bold text-blue-600">{job.job_code}</span>
                    </td>
                    <td>
                      <div className="font-medium text-gray-900">{job.job_title}</div>
                      <div className="text-sm text-gray-500">{job.department}</div>
                    </td>
                    <td className="text-sm">{job.clients?.company_name}</td>
                    <td className="text-sm">{job.location}</td>
                    <td className="text-sm">{job.experience_min}-{job.experience_max} yrs</td>
                    <td className="text-sm">₹{job.min_ctc}-{job.max_ctc}L</td>
                    <td><span className="font-medium">{job.positions_filled}/{job.positions}</span></td>
                    <td>
                      <button
                        onClick={() => router.push(`/sr-tl/jobs/${job.id}/candidates`)}
                        className={`font-bold text-lg ${job.candidate_count > 0 ? 'text-blue-600 hover:text-blue-800 hover:underline' : 'text-gray-400'}`}
                      >
                        {job.candidate_count || 0}
                      </button>
                    </td>
                    <td>
                      <span className={`font-medium ${job.in_progress_count > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                        {job.in_progress_count || 0}
                      </span>
                    </td>
                    <td>
                      <span className={getPriorityBadge(job.priority)}>
                        {job.priority?.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {updatingStatus === job.id ? (
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                          Saving…
                        </div>
                      ) : (
                        <select
                          value={job.status}
                          onChange={e => handleStatusChange(job.id, job.job_title, e.target.value)}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${getStatusBadge(job.status)}`}
                        >
                          {JOB_STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                          👥 {job.recruiter_count || 0} recruiter{job.recruiter_count !== 1 ? 's' : ''}
                        </span>
                        {job.recruiter_allocations?.length > 0 && (
                          <div className="text-xs text-gray-500">
                            {job.recruiter_allocations.map((alloc: any) => (
                              <div key={alloc.id}>{alloc.name}: {alloc.positions}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/sr-tl/jobs/${job.id}`)}
                          className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                        >
                          View
                        </button>
                        <button
                          onClick={() => router.push(`/sr-tl/jobs/${job.id}/add-candidate`)}
                          className="text-green-600 hover:text-green-900 font-medium text-sm"
                        >
                          + Add
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Confirm Close Modal ── */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-center mb-4">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-lg font-bold text-gray-900">Close this job?</h3>
              <p className="text-sm text-gray-600 mt-2">
                <span className="font-semibold">{confirmModal.jobTitle}</span> will be marked as <span className="font-semibold text-blue-700">Closed</span>.
                Recruiters will no longer be able to add candidates to it.
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={() => applyStatusChange(confirmModal.jobId, confirmModal.newStatus)}
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