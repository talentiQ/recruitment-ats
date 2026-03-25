// app/recruiter/candidates/page.tsx
'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  PIPELINE_STAGES,
  getStageBadge,
  getStageLabel,
} from '@/lib/pipelineStages'

export default function RecruiterCandidatesPage() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [user, setUser] = useState<any>(null)
  const [jobFilter, setJobFilter] = useState('all')
  const [sourcedByFilter, setSourcedByFilter] = useState('all')   // ── NEW ──
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
  }, [user, allocatedJobs, stageFilter, searchQuery, jobFilter, sourcedByFilter])

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
      const jobs = data?.map((assignment: any) => assignment.jobs).filter(Boolean) || []
      setAllocatedJobs(jobs)
    } catch (error) {
      console.error('Error loading allocated jobs:', error)
      setAllocatedJobs([])
    }
  }

  const loadCandidates = async () => {
    setLoading(true)
    try {
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
            id,
            full_name
          )
        `)
        .order('created_at', { ascending: false })

      if (allocatedJobIds.length > 0) {
        query = query.or(`assigned_to.eq.${user.id},job_id.in.(${allocatedJobIds.join(',')})`)
      } else {
        query = query.eq('assigned_to', user.id)
      }

      if (stageFilter !== 'all') query = query.eq('current_stage', stageFilter)
      if (jobFilter !== 'all') query = query.eq('job_id', jobFilter)
      if (searchQuery) {
        query = query.or(`full_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
      }

      // ── Sourced By filter — applied client-side after fetch ──
      // (assigned_to is a join field; filtering in Supabase requires a subquery)
      const { data, error } = await query
      if (error) throw error

      // Apply sourced-by filter client-side
      const filtered = sourcedByFilter === 'all'
        ? (data || [])
        : sourcedByFilter === 'me'
          ? (data || []).filter((c: any) => c.assigned_to === user.id)
          : (data || []).filter((c: any) => c.assigned_to === sourcedByFilter)

      setCandidates(filtered)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  // ── Build unique recruiters list from loaded candidates for the dropdown ──
  // We derive this from allocatedJobs team context — fetch once
  const [teamRecruiters, setTeamRecruiters] = useState<{ id: string; full_name: string }[]>([])

  useEffect(() => {
    if (!user) return
    const fetchTeamRecruiters = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('reports_to', user.id)          // recruiters reporting to this user
        .eq('role', 'recruiter')
        .eq('is_active', true)
      setTeamRecruiters(data || [])
    }
    fetchTeamRecruiters()
  }, [user])

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

        {/* Filters */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Name, phone, email…"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Stage</label>
              <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="input">
                <option value="all">All Stages</option>
                {PIPELINE_STAGES.map(stage => (
                  <option key={stage} value={stage}>{getStageLabel(stage)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Job</label>
              <select value={jobFilter} onChange={e => setJobFilter(e.target.value)} className="input">
                <option value="all">All Jobs</option>
                {allocatedJobs.map((job: any) => (
                  <option key={job.id} value={job.id}>
                    {job.job_title} — {job.clients?.company_name}
                  </option>
                ))}
              </select>
            </div>

            {/* ── Sourced By filter ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sourced By</label>
              <select value={sourcedByFilter} onChange={e => setSourcedByFilter(e.target.value)} className="input">
                <option value="all">All Recruiters</option>
                <option value="me">Me</option>
                {teamRecruiters.map(r => (
                  <option key={r.id} value={r.id}>{r.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Active filter summary */}
          {(stageFilter !== 'all' || searchQuery || jobFilter !== 'all' || sourcedByFilter !== 'all') && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Showing <strong className="text-gray-700">{candidates.length}</strong> candidates
                {sourcedByFilter === 'me' && <span className="ml-1 text-blue-600">· sourced by you</span>}
                {sourcedByFilter !== 'all' && sourcedByFilter !== 'me' && (
                  <span className="ml-1 text-blue-600">
                    · sourced by {teamRecruiters.find(r => r.id === sourcedByFilter)?.full_name}
                  </span>
                )}
              </p>
              <button
                onClick={() => { setStageFilter('all'); setSearchQuery(''); setJobFilter('all'); setSourcedByFilter('all') }}
                className="text-xs text-blue-600 hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
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
            {(stageFilter !== 'all' || searchQuery || jobFilter !== 'all' || sourcedByFilter !== 'all') && (
              <button
                onClick={() => { setStageFilter('all'); setSearchQuery(''); setJobFilter('all'); setSourcedByFilter('all') }}
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
                {candidates.map(candidate => {
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
                            <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">Team</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="text-sm font-medium">{candidate.jobs?.job_title || 'N/A'}</div>
                        <div className="text-xs text-gray-500">{candidate.jobs?.clients?.company_name || 'N/A'}</div>
                      </td>
                      <td>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStageBadge(candidate.current_stage)}`}>
                          {getStageLabel(candidate.current_stage)}
                        </span>
                      </td>
                      <td className="text-sm font-medium">₹{candidate.expected_ctc || 0}</td>
                      <td className="text-sm">
                        {isOwnCandidate ? (
                          <span className="font-semibold text-green-600">You</span>
                        ) : (
                          <span className="text-gray-700">{candidate.users?.full_name || 'Unknown'}</span>
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