// app/tl/jobs/page.tsx - COMPLETE WITH CANDIDATE COUNTS & ACTIONS
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
  status: string
  priority: string
  created_at: string
  clients: {
    company_name: string
  }
  assigned_recruiters: string[]
  full_name: string
  recruiter_count: number
  recruiter_allocations: { id: string; name: string; positions: number }[]
}

export default function TLJobsPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [user, setUser] = useState<any>(null)

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
          clients (
            company_name
          )
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
          users:recruiter_id (
            id,
            full_name
          )
        `)
        .in('job_id', jobIds)
        .eq('is_active', true)

      const assignmentsByJob: { [key: string]: any[] } = {}

      assignments?.forEach(a => {
        if (!assignmentsByJob[a.job_id]) {
          assignmentsByJob[a.job_id] = []
        }
        const user = Array.isArray(a.users) ? a.users[0] : a.users
        assignmentsByJob[a.job_id].push({
          id: user.id,
          name: user.full_name,
          positions: a.positions_allocated
        })
      })

      const jobsWithAllocations =
        jobsData?.map(job => ({
          ...job,
          recruiter_count: assignmentsByJob[job.id]?.length || 0,
          recruiter_allocations: assignmentsByJob[job.id] || []
        })) || []

      setJobs(jobsWithAllocations)
    } catch (error) {
      console.error('Error loading jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredJobs =
    statusFilter === 'all'
      ? jobs
      : jobs.filter(j => j.status === statusFilter)

  const getStatusBadge = (status: string) => {
    const badges: { [key: string]: string } = {
      open: 'badge-success',
      in_progress: 'badge-warning',
      on_hold:
        'bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-semibold',
      closed:
        'bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold'
    }
    return badges[status] || 'badge-success'
  }

  const getPriorityBadge = (priority: string) => {
    const badges: { [key: string]: string } = {
      high: 'badge-danger',
      medium: 'badge-warning',
      low:
        'bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-semibold'
    }
    return badges[priority] || 'badge-warning'
  }

  const handleViewCandidates = (jobId: string) => {
    router.push(`/tl/jobs/${jobId}/candidates`)
  }

  const handleAddCandidate = (jobId: string) => {
    router.push(`/tl/jobs/${jobId}/add-candidate`)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Jobs Management
            </h2>
            <p className="text-gray-600">
              Manage team job assignments and track progress
            </p>
          </div>
          <button
            onClick={() => router.push('/tl/jobs/add')}
            className="btn-primary"
          >
            + Add New Job
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="kpi-card">
            <div className="kpi-title">Total Jobs</div>
            <div className="kpi-value">{jobs.length}</div>
          </div>
          <div className="kpi-card kpi-success">
            <div className="kpi-title">Open</div>
            <div className="kpi-value">
              {jobs.filter(j => j.status === 'open').length}
            </div>
          </div>
          <div className="kpi-card kpi-warning">
            <div className="kpi-title">In Progress</div>
            <div className="kpi-value">
              {jobs.filter(j => j.status === 'in_progress').length}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Total Candidates</div>
            <div className="kpi-value">
              {jobs.reduce((sum, j) => sum + (j.candidate_count || 0), 0)}
            </div>
          </div>
        </div>

        <div className="card">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Status
          </label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="input max-w-xs"
          >
            <option value="all">All Jobs</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600">No jobs found</p>
            <button
              onClick={() => router.push('/tl/jobs/add')}
              className="mt-4 btn-primary"
            >
              Create First Job
            </button>
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
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Recruiter Assigned</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map(job => (
                  <tr key={job.id}>
                    <td>
                      <span className="font-mono font-bold text-blue-600">
                        {job.job_code}
                      </span>
                    </td>
                    <td>
                      <div className="font-medium text-gray-900">
                        {job.job_title}
                      </div>
                      <div className="text-sm text-gray-500">
                        {job.department}
                      </div>
                    </td>
                    <td className="text-sm">
                      {job.clients?.company_name}
                    </td>
                    <td className="text-sm">{job.location}</td>
                    <td className="text-sm">
                      {job.experience_min}-{job.experience_max} yrs
                    </td>
                    <td className="text-sm">
                      ₹{job.min_ctc}-{job.max_ctc}L
                    </td>
                    <td>
                      <span className="font-medium">
                        {job.positions_filled}/{job.positions}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => handleViewCandidates(job.id)}
                        className={`font-bold text-lg ${
                          job.candidate_count > 0
                            ? 'text-blue-600 hover:text-blue-800 hover:underline'
                            : 'text-gray-400'
                        }`}
                      >
                        {job.candidate_count || 0}
                      </button>
                    </td>
                    <td>
                      <span className={getPriorityBadge(job.priority)}>
                        {job.priority.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={getStatusBadge(job.status)}>
                        {job.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td>
  <div className="space-y-1">
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
      👥 {job.recruiter_count || 0} recruiter{job.recruiter_count !== 1 ? 's' : ''}
    </span>
    {job.recruiter_allocations && (
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
                          onClick={() => router.push(`/tl/jobs/${job.id}`)}
                          className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleAddCandidate(job.id)}
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
    </DashboardLayout>
  )
}
