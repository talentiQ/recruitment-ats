'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const JOB_STATUS_OPTIONS = [
  { value: 'open',        label: 'Open',        color: 'bg-green-100 text-green-800 border-green-300'    },
  { value: 'in_progress', label: 'In Progress',  color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'on_hold',     label: 'On Hold',      color: 'bg-gray-100 text-gray-700 border-gray-300'      },
  { value: 'closed',      label: 'Closed',       color: 'bg-blue-100 text-blue-800 border-blue-300'      },
]

export default function RecruiterJobsPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ jobId: string; jobTitle: string; newStatus: string } | null>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadMyJobs(parsedUser.id, parsedUser.team_id)
    }
  }, [])

  const loadMyJobs = async (userId: string, teamId: string) => {
    setLoading(true)
    try {
      const { data: assignments, error: assignError } = await supabase
        .from('job_recruiter_assignments')
        .select('job_id')
        .eq('recruiter_id', userId)
        .eq('is_active', true)

      if (assignError) {
        console.error('Assignment query error:', assignError)
      }

      if (!assignments || assignments.length === 0) {
        setDebugInfo({ userId, teamId, assignmentsFound: 0, message: 'No job assignments found in database' })
        setJobs([])
        setLoading(false)
        return
      }

      const jobIds = assignments.map(a => a.job_id)

      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select(`
          *,
          clients (company_name),
          candidates (id)
        `)
        .in('id', jobIds)
        .order('created_at', { ascending: false })

      if (jobsError) {
        console.error('Jobs query error:', jobsError)
        throw jobsError
      }

      const jobsWithCount = jobsData?.map(job => ({
        ...job,
        candidate_count: job.candidates?.length || 0
      })) || []

      setJobs(jobsWithCount)
      setDebugInfo({ userId, teamId, assignmentsFound: assignments.length, jobsLoaded: jobsData?.length || 0 })

    } catch (error) {
      console.error('Error loading jobs:', error)
      setDebugInfo({ userId, teamId, error })
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
      const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId)
      if (error) throw error
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
    } catch (error) {
      console.error('Error updating job status:', error)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdatingStatus(null)
    }
  }

  const getStatusBadgeColor = (status: string) =>
    JOB_STATUS_OPTIONS.find(o => o.value === status)?.color || 'bg-gray-100 text-gray-700 border-gray-300'

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">My Assigned Jobs</h2>
          <p className="text-gray-600">Jobs you are working on</p>
        </div>

        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your jobs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-xl font-medium text-gray-900 mb-2">No jobs assigned to you yet</p>
            <p className="text-sm text-gray-500">
              Your team leader will assign jobs to you when creating new job openings
            </p>
          </div>
        ) : (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-sm text-green-800">
                You have <strong>{jobs.length}</strong> job{jobs.length !== 1 ? 's' : ''} assigned to you
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map(job => (
                <div key={job.id} className="card hover:shadow-lg transition">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="font-mono text-sm font-bold text-blue-600">{job.job_code}</span>
                      <h3 className="text-lg font-bold text-gray-900 mt-1">{job.job_title}</h3>
                    </div>

                    {/* ── Inline status dropdown ── */}
                    {updatingStatus === job.id ? (
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                        Saving…
                      </div>
                    ) : (
                      <select
                        value={job.status}
                        onChange={e => handleStatusChange(job.id, job.job_title, e.target.value)}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${getStatusBadgeColor(job.status)}`}
                      >
                        {JOB_STATUS_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <div>{job.clients?.company_name}</div>
                    <div>{job.location}</div>
                    <div>₹{job.min_ctc}-{job.max_ctc}L</div>
                    <div>{job.experience_min}-{job.experience_max} years</div>
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => router.push(`/recruiter/jobs/${job.id}/add-candidate`)}
                      className="flex-1 btn-primary text-sm py-2"
                    >
                      + Add Candidate
                    </button>
                    <button
                      onClick={() => router.push(`/recruiter/jobs/${job.id}`)}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      View Details
                    </button>
                  </div>

                  <div className="mt-3 text-center">
                    <span className="text-2xl font-bold text-blue-600">{job.candidate_count}</span>
                    <span className="text-sm text-gray-500 ml-1">candidates added</span>
                  </div>
                </div>
              ))}
            </div>
          </>
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
                <span className="font-semibold">{confirmModal.jobTitle}</span> will be marked as{' '}
                <span className="font-semibold text-blue-700">Closed</span>.
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