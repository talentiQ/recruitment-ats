'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SrTLCandidatesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [candidates, setCandidates] = useState<any[]>([])
  const [stageFilter, setStageFilter] = useState('all')
  const [recruiterFilter, setRecruiterFilter] = useState(searchParams.get('tl') || 'all')
  const [recruiters, setRecruiters] = useState<any[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      
      if (parsedUser.role !== 'sr_team_leader') {
        alert('Access denied')
        router.push('/')
        return
      }
      
      loadData(parsedUser)
    }
  }, [stageFilter, recruiterFilter])

  const loadData = async (user: any) => {
    setLoading(true)
    try {
      // Load all team members (for filter dropdown)
      const { data: teamMembers } = await supabase
        .from('users')
        .select('id, full_name, role')
        .eq('team_id', user.team_id)
        .in('role', ['team_leader', 'recruiter'])
        .eq('is_active', true)
        .order('full_name')

      if (teamMembers) setRecruiters(teamMembers)

      // Build candidates query
      let query = supabase
        .from('candidates')
        .select(`
          *,
          jobs (
            job_title,
            job_code,
            clients (company_name)
          ),
          users:assigned_to (
            full_name,
            role
          )
        `)
        .eq('team_id', user.team_id)
        .order('created_at', { ascending: false })

      // Apply stage filter
      if (stageFilter !== 'all') {
        query = query.eq('current_stage', stageFilter)
      }

      // Apply recruiter filter
      if (recruiterFilter !== 'all') {
        query = query.eq('assigned_to', recruiterFilter)
      }

      const { data, error } = await query

      if (error) throw error
      if (data) setCandidates(data)

    } catch (error) {
      console.error('Error loading candidates:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStageColor = (stage: string) => {
    const colors: { [key: string]: string } = {
      sourced: 'bg-gray-100 text-gray-800',
      screening: 'bg-blue-100 text-blue-800',
      interview_scheduled: 'bg-purple-100 text-purple-800',
      interview_completed: 'bg-indigo-100 text-indigo-800',
      offer_extended: 'bg-yellow-100 text-yellow-800',
      offer_accepted: 'bg-green-100 text-green-800',
      documentation: 'bg-teal-100 text-teal-800',
      joined: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      on_hold: 'bg-orange-100 text-orange-800',
    }
    return colors[stage] || 'bg-gray-100 text-gray-800'
  }

  const stageCounts = {
    all: candidates.length,
    sourced: candidates.filter(c => c.current_stage === 'sourced').length,
    screening: candidates.filter(c => c.current_stage === 'screening').length,
    interview_scheduled: candidates.filter(c => c.current_stage === 'interview_scheduled').length,
    joined: candidates.filter(c => c.current_stage === 'joined').length,
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 text-center">All Team Candidates</h2>
          <p className="text-gray-600 text-center">View and manage all candidates from your team</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <button
            onClick={() => setStageFilter('all')}
            className={`kpi-card text-center cursor-pointer transition ${
              stageFilter === 'all' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">Total</div>
            <div className="kpi-value">{stageCounts.all}</div>
          </button>

          <button
            onClick={() => setStageFilter('sourced')}
            className={`kpi-card text-center cursor-pointer transition ${
              stageFilter === 'sourced' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">Sourced</div>
            <div className="kpi-value">{stageCounts.sourced}</div>
          </button>

          <button
            onClick={() => setStageFilter('screening')}
            className={`kpi-card text-center cursor-pointer transition ${
              stageFilter === 'screening' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">Screening</div>
            <div className="kpi-value">{stageCounts.screening}</div>
          </button>

          <button
            onClick={() => setStageFilter('interview_scheduled')}
            className={`kpi-card text-center cursor-pointer transition ${
              stageFilter === 'interview_scheduled' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">Interviews</div>
            <div className="kpi-value">{stageCounts.interview_scheduled}</div>
          </button>

          <button
            onClick={() => setStageFilter('joined')}
            className={`kpi-card kpi-success text-center cursor-pointer transition ${
              stageFilter === 'joined' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">Joined</div>
            <div className="kpi-value">{stageCounts.joined}</div>
          </button>
        </div>

        {/* Filters */}
        <div className="card">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Team Member
              </label>
              <select
                value={recruiterFilter}
                onChange={(e) => setRecruiterFilter(e.target.value)}
                className="input"
              >
                <option value="all">All Team Members</option>
                {recruiters.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.full_name} ({r.role === 'team_leader' ? 'TL' : 'Recruiter'})
                  </option>
                ))}
              </select>
            </div>

            {(stageFilter !== 'all' || recruiterFilter !== 'all') && (
              <button
                onClick={() => {
                  setStageFilter('all')
                  setRecruiterFilter('all')
                }}
                className="mt-6 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
{/* Header */}
<div className="flex justify-between items-center">
  <div>
    <h2 className="text-2xl font-bold text-gray-900">All Team Candidates</h2>
    <p className="text-gray-600">View and manage all candidates from your team</p>
  </div>
  <button
    onClick={() => router.push('/sr-tl/candidates/add')}
    className="btn-primary"
  >
    + Add Candidate
  </button>
</div>
        {/* Candidates List */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600">No candidates found</p>
            {(stageFilter !== 'all' || recruiterFilter !== 'all') && (
              <button
                onClick={() => {
                  setStageFilter('all')
                  setRecruiterFilter('all')
                }}
                className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Clear filters to see all candidates
              </button>
            )}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <div className="mb-4 text-sm text-gray-600">
              Showing <strong>{candidates.length}</strong> candidate{candidates.length !== 1 ? 's' : ''}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Candidate Name</th>
                  <th>Job Role</th>
                  <th>Client</th>
                  <th>Added By</th>
                  <th>Stage</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(candidate => (
                  <tr key={candidate.id}>
                    <td>
                      <div className="font-medium text-gray-900">{candidate.full_name}</div>
                      <div className="text-sm text-gray-600">{candidate.phone}</div>
                    </td>
                    <td className="text-sm text-gray-600">
                      {candidate.jobs?.job_code} - {candidate.jobs?.job_title}
                    </td>
                    <td className="text-sm text-gray-600">
                      {candidate.jobs?.clients?.[0]?.company_name || 'N/A'}
                    </td>
                    <td>
                      <div className="text-sm text-gray-900">{candidate.users?.full_name}</div>
                      <div className="text-xs text-gray-500">
                        {candidate.users?.role === 'team_leader' ? 'Team Leader' : 'Recruiter'}
                      </div>
                    </td>
                    <td>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStageColor(candidate.current_stage)}`}>
                        {candidate.current_stage.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => router.push(`/sr-tl/candidates/${candidate.id}`)}
                        className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                      >
                        View Details
                      </button>
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