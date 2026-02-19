// app/recruiter/jobs/page.tsx - FIXED: Robust query for old and new jobs
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RecruiterJobsPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)

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
      // STRATEGY: Get jobs from job_recruiter_assignments table
      // This is the source of truth for job assignments
      
      const { data: assignments, error: assignError } = await supabase
        .from('job_recruiter_assignments')
        .select('job_id')
        .eq('recruiter_id', userId)
        .eq('is_active', true)
      if (assignError) {
        console.error('Assignment query error:', assignError)
      }

      if (!assignments || assignments.length === 0) {
        // No assignments found - show debug info
        setDebugInfo({
          userId,
          teamId,
          assignmentsFound: 0,
          message: 'No job assignments found in database'
        })
        setJobs([])
        setLoading(false)
        return
      }

      const jobIds = assignments.map(a => a.job_id)
      // Get full job details
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select(`
          *,
          clients (
            company_name
          )
        `)
        .in('id', jobIds)
        .order('created_at', { ascending: false })

      if (jobsError) {
        console.error('Jobs query error:', jobsError)
        throw jobsError
      }
      setJobs(jobsData || [])
      setDebugInfo({
        userId,
        teamId,
        assignmentsFound: assignments.length,
        jobsLoaded: jobsData?.length || 0
      })
    } catch (error) {
      console.error('Error loading jobs:', error)
      setDebugInfo({
        userId,
        teamId,
        error: error
      })
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: { [key: string]: string } = {
      open: 'badge-success',
      in_progress: 'badge-warning',
      on_hold: 'bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-semibold',
      closed: 'bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold',
    }
    return badges[status] || 'badge-success'
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">My Assigned Jobs</h2>
          <p className="text-gray-600">Jobs you&apos;re working on</p>
        </div>

        {/* Debug Info (only show when no jobs) */}
        {!loading && jobs.length === 0 && debugInfo && (
          <div className="card bg-yellow-50 border-2 border-yellow-200">
            <h3 className="font-bold text-yellow-900 mb-2">Debug Information</h3>
            <div className="text-sm text-yellow-800 space-y-1">
              <p><strong>Your User ID:</strong> {debugInfo.userId}</p>
              <p><strong>Your Team ID:</strong> {debugInfo.teamId}</p>
              <p><strong>Assignments Found:</strong> {debugInfo.assignmentsFound}</p>
              {debugInfo.jobsLoaded !== undefined && (
                <p><strong>Jobs Loaded:</strong> {debugInfo.jobsLoaded}</p>
              )}
              {debugInfo.error && (
                <p className="text-red-700"><strong>Error:</strong> {JSON.stringify(debugInfo.error)}</p>
              )}
            </div>
            <div className="mt-3 p-3 bg-white rounded border border-yellow-300">
              <p className="text-sm font-medium text-gray-900 mb-2">
              Possible reasons:
              </p>
              <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                <li>Your team leader hasn&apos;t assigned any jobs to you yet</li>
                <li>Jobs need to be assigned through the &quot;Add Job&quot; form</li>
                <li>Database migration may need to run (contact admin)</li>
              </ul>
            </div>
          </div>
        )}

        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your jobs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-6xl mb-4"></div>
            <p className="text-xl font-medium text-gray-900 mb-2">No jobs assigned to you yet</p>
            <p className="text-sm text-gray-500 mb-4">
              Your team leader will assign jobs to you when creating new job openings
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto text-left">
              <p className="text-sm font-medium text-blue-900 mb-2">What to do:</p>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Ask your team leader to assign jobs to you</li>
                <li>Check with your team leader about open positions</li>
                <li>If you see jobs in team meetings, request assignment</li>
              </ol>
            </div>
          </div>
        ) : (
          <>
            {/* Success message */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-sm text-green-800">
                âœ… You have <strong>{jobs.length}</strong> job{jobs.length !== 1 ? 's' : ''} assigned to you
              </p>
            </div>

            {/* Jobs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map(job => (
                <div key={job.id} className="card hover:shadow-lg transition">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="font-mono text-sm font-bold text-blue-600">
                        {job.job_code}
                      </span>
                      <h3 className="text-lg font-bold text-gray-900 mt-1">
                        {job.job_title}
                      </h3>
                    </div>
                    <span className={getStatusBadge(job.status)}>
                      {job.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <div className="flex items-center gap-2">
                      <span>ðŸ¢</span>
                      <span>{job.clients?.company_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>ðŸ“</span>
                      <span>{job.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>ðŸ’°</span>
                      <span>â‚¹{job.min_ctc}-{job.max_ctc}L</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>ðŸ“…</span>
                      <span>{job.experience_min}-{job.experience_max} years</span>
                    </div>
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
                    <span className="text-2xl font-bold text-blue-600">
                      {job.candidate_count || 0}
                    </span>
                    <span className="text-sm text-gray-500 ml-1">candidates added</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
