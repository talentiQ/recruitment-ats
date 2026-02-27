// app/recruiter/candidates/page.tsx
'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RecruiterCandidatesPage() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [user, setUser] = useState<any>(null)
  const [jobFilter, setJobFilter] = useState('all')
  const [allocatedJobs, setAllocatedJobs] = useState<any[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadAllocatedJobs(parsedUser.id)
    }
  }, [])

  useEffect(() => {
    if (user && allocatedJobs.length >= 0) {
      loadCandidates()
    }
  }, [user, allocatedJobs, stageFilter, searchQuery, jobFilter])

  const loadAllocatedJobs = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('job_recruiter_assignments')
        .select(`
          job_id,
          jobs (
            id,
            job_title,
            job_code,
            clients (company_name)
          )
        `)
        .eq('recruiter_id', userId)
        .eq('is_active', true)

      if (error) throw error
      
      // Flatten the nested structure
      const jobs = data?.map(assignment => assignment.jobs).filter(Boolean) || []
      setAllocatedJobs(jobs)
    } catch (error) {
      console.error('Error loading allocated jobs:', error)
      setAllocatedJobs([])
    }
  }

  const loadCandidates = async () => {
    setLoading(true)
    try {
      // Get job IDs from allocations
      const allocatedJobIds = allocatedJobs.map((job: any) => job.id)

      let query = supabase
        .from('candidates')
        .select(`
          *,
          jobs (
            id,
            job_title,
            job_code,
            clients (company_name)
          ),
          users:assigned_to (
            full_name
          )
        `)
        .order('created_at', { ascending: false })

      // Filter: Own candidates OR candidates on allocated jobs
      if (allocatedJobIds.length > 0) {
        query = query.or(`assigned_to.eq.${user.id},job_id.in.(${allocatedJobIds.join(',')})`)
      } else {
        // If no job allocations, show only own candidates
        query = query.eq('assigned_to', user.id)
      }

      if (stageFilter !== 'all') {
        query = query.eq('current_stage', stageFilter)
      }

      if (jobFilter !== 'all') {
        query = query.eq('job_id', jobFilter)
      }

      if (searchQuery) {
        query = query.or(`full_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
      }

      const { data, error } = await query
      if (error) throw error
      
      setCandidates(data || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (stage: string) => {
    const badges: { [key: string]: string } = {
      sourced: 'bg-gray-100 text-gray-800',
      screening: 'bg-yellow-100 text-yellow-800',
      interview_scheduled: 'bg-blue-100 text-blue-800',
      interview_completed: 'bg-purple-100 text-purple-800',
      offer_extended: 'bg-orange-100 text-orange-800',
      offer_accepted: 'bg-green-100 text-green-800',
      joined: 'bg-green-600 text-white',
      rejected: 'bg-red-100 text-red-800',
      dropped: 'bg-gray-100 text-gray-800',
    }
    return badges[stage] || 'bg-gray-100 text-gray-800'
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">My Candidates</h2>
            <p className="text-gray-600">Your candidates + candidates on your allocated jobs</p>
          </div>
          <button onClick={() => router.push('/recruiter/candidates/add')} className="btn-primary">
            + Add Candidate
          </button>
        </div>

        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, phone, email..."
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Stage</label>
              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="input">
                <option value="all">All Stages</option>
                <option value="sourced">Sourced</option>
                <option value="screening">Screening</option>
                <option value="interview_scheduled">Interview Scheduled</option>
                <option value="interview_completed">Interview Completed</option>
                <option value="offer_extended">Offer Extended</option>
                <option value="offer_accepted">Offer Accepted</option>
                <option value="joined">Joined</option>
                <option value="rejected">Rejected</option>
                <option value="dropped">Dropped</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Job</label>
              <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className="input">
                <option value="all">All Jobs</option>
                {allocatedJobs.map((job: any) => (
                  <option key={job.id} value={job.id}>
                    {job.job_title} - {job.clients?.company_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          Showing <strong>{candidates.length}</strong> candidates
        </div>

        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600">No candidates found</p>
            {(stageFilter !== 'all' || searchQuery || jobFilter !== 'all') && (
              <button
                onClick={() => {
                  setStageFilter('all')
                  setSearchQuery('')
                  setJobFilter('all')
                }}
                className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Job / Client</th>
                  <th>Stage</th>
                  <th>Expected CTC</th>
                  <th>Sourced By</th>
                  <th>Days in Pipeline</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => {
                  const isOwnCandidate = candidate.assigned_to === user.id
                  return (
                    <tr key={candidate.id} className={!isOwnCandidate ? 'bg-blue-50' : ''}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium text-gray-900">{candidate.full_name}</div>
                            <div className="text-sm text-gray-500">{candidate.phone}</div>
                            {candidate.email && (
                              <div className="text-xs text-gray-400">{candidate.email}</div>
                            )}
                          </div>
                          {!isOwnCandidate && (
                            <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                              Team
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="text-sm font-medium">{candidate.jobs?.job_title || 'N/A'}</div>
                        <div className="text-xs text-gray-500">{candidate.jobs?.clients?.company_name || 'N/A'}</div>
                      </td>
                      <td>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(candidate.current_stage)}`}>
                          {candidate.current_stage?.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="text-sm font-medium">₹{candidate.expected_ctc || 0}L</td>
                      <td className="text-sm">
                        {isOwnCandidate ? (
                          <span className="font-semibold text-green-600">You</span>
                        ) : (
                          candidate.users?.full_name || 'Unknown'
                        )}
                      </td>
                      <td className="text-sm">
                        {Math.floor((new Date().getTime() - new Date(candidate.created_at).getTime()) / (1000 * 60 * 60 * 24))} days
                      </td>
                      <td>
                        <button
                          onClick={() => router.push(`/recruiter/candidates/${candidate.id}`)}
                          className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
