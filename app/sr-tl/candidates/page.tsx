//app/sr-tl/candidates/page.tsx - CORRECT WITH reports_to
'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function CandidatesTable() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [recruiterFilter, setRecruiterFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [user, setUser] = useState<any>(null)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [allTeams, setAllTeams] = useState<any[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadTeamMembersUsingReportsTo(parsedUser)
    }
  }, [])

  useEffect(() => {
    if (teamMembers.length > 0) {
      loadCandidates()
    }
  }, [teamMembers, stageFilter, searchQuery, recruiterFilter, teamFilter])

  const loadTeamMembersUsingReportsTo = async (currentUser: any) => {
    try {
      console.log('🔵 Loading team for Sr.TL:', currentUser.full_name, currentUser.id)

      // STEP 1: Get direct reports (TLs and Recruiters who report directly to this Sr.TL)
      const { data: directReports, error: directError } = await supabase
        .from('users')
        .select('id, full_name, role, team_id')
        .eq('reports_to', currentUser.id)  // ✅ Only THIS Sr.TL's direct reports
        .eq('is_active', true)

      if (directError) {
        console.error('❌ Error loading direct reports:', directError)
        throw directError
      }

      console.log('✅ Direct reports:', directReports?.length || 0)
      console.table(directReports)

      // STEP 2: Get TL IDs from direct reports
      const tlIds = directReports?.filter(m => m.role === 'team_leader').map(m => m.id) || []
      console.log('🟢 TL IDs under this Sr.TL:', tlIds)

      // STEP 3: Get recruiters who report to those TLs
      let indirectRecruiters: any[] = []
      if (tlIds.length > 0) {
        const { data: recruiterReports, error: recError } = await supabase
          .from('users')
          .select('id, full_name, role, team_id')
          .in('reports_to', tlIds)  // Recruiters reporting to the TLs
          .eq('role', 'recruiter')
          .eq('is_active', true)

        if (recError) {
          console.error('❌ Error loading indirect recruiters:', recError)
        } else {
          indirectRecruiters = recruiterReports || []
          console.log('✅ Indirect recruiters (via TLs):', indirectRecruiters.length)
          console.table(indirectRecruiters)
        }
      }

      // STEP 4: Combine direct reports + indirect recruiters
      const allTeamMembers = [...(directReports || []), ...indirectRecruiters]
      console.log('📊 TOTAL team members:', allTeamMembers.length)

      setTeamMembers(allTeamMembers)

      // Get unique teams
      const uniqueTeams = [...new Set(allTeamMembers.map(u => u.team_id).filter(Boolean))]
      console.log('🏢 Unique teams:', uniqueTeams)
      setAllTeams(uniqueTeams)

    } catch (error) {
      console.error('❌ Fatal error loading team members:', error)
      setTeamMembers([])
    }
  }

  const loadCandidates = async () => {
    setLoading(true)
    try {
      let teamMemberIds = teamMembers.map(m => m.id)

      // Filter by specific team if selected
      if (teamFilter !== 'all') {
        teamMemberIds = teamMembers
          .filter(m => m.team_id === teamFilter)
          .map(m => m.id)
      }

      if (teamMemberIds.length === 0) {
        setCandidates([])
        setLoading(false)
        return
      }

      console.log('📥 Loading candidates for', teamMemberIds.length, 'team members')

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
            team_id,
            role
          )
        `)
        .in('assigned_to', teamMemberIds)
        .order('created_at', { ascending: false })

      if (stageFilter !== 'all') {
        query = query.eq('current_stage', stageFilter)
      }

      if (recruiterFilter !== 'all') {
        query = query.eq('assigned_to', recruiterFilter)
      }

      if (searchQuery) {
        query = query.or(`full_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
      }

      const { data, error } = await query
      if (error) throw error
      
      console.log('✅ Loaded candidates:', data?.length || 0)
      setCandidates(data || [])
    } catch (error) {
      console.error('❌ Error loading candidates:', error)
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Count candidates per team for dropdown
  const candidatesByTeam = allTeams.map(teamId => ({
    teamId,
    count: candidates.filter(c => c.users?.team_id === teamId).length
  }))

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">All Team Candidates</h2>
          <p className="text-gray-600">
            Managing {allTeams.length} teams with {teamMembers.length} members
          </p>
        </div>
        <button onClick={() => router.push('/sr-tl/candidates/add')} className="btn-primary">
          + Add Candidate
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="kpi-card text-center">
          <div className="kpi-title">Total Teams</div>
          <div className="kpi-value text-blue-600">{allTeams.length}</div>
        </div>
        <div className="kpi-card text-center">
          <div className="kpi-title">Team Members</div>
          <div className="kpi-value text-purple-600">{teamMembers.length}</div>
        </div>
        <div className="kpi-card text-center">
          <div className="kpi-title">Total Candidates</div>
          <div className="kpi-value text-green-600">{candidates.length}</div>
        </div>
        <div className="kpi-card kpi-success text-center">
          <div className="kpi-title">Active Pipelines</div>
          <div className="kpi-value">
            {candidates.filter(c => !['rejected', 'dropped', 'joined'].includes(c.current_stage)).length}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Team</label>
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="input">
              <option value="all">All Teams ({allTeams.length})</option>
              {allTeams.map(teamId => {
                const teamCount = candidatesByTeam.find(t => t.teamId === teamId)?.count || 0
                const teamName = teamId.slice(0, 20)
                return (
                  <option key={teamId} value={teamId}>
                    Team {teamName}... ({teamCount})
                  </option>
                )
              })}
            </select>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Member</label>
            <select value={recruiterFilter} onChange={(e) => setRecruiterFilter(e.target.value)} className="input">
              <option value="all">All Members</option>
              {teamMembers.map(member => (
                <option key={member.id} value={member.id}>
                  {member.full_name} ({member.role})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          Showing <strong>{candidates.length}</strong> candidates
        </div>
        {(stageFilter !== 'all' || searchQuery || recruiterFilter !== 'all' || teamFilter !== 'all') && (
          <button
            onClick={() => {
              setStageFilter('all')
              setSearchQuery('')
              setRecruiterFilter('all')
              setTeamFilter('all')
            }}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Clear all filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="card text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : candidates.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-600">No candidates found</p>
          <div className="text-sm text-gray-500 mt-2">
            Team members: {teamMembers.length} • Check console (F12) for debugging
          </div>
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
                <th>Assigned To</th>
                <th>Days in Pipeline</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.id}>
                  <td>
                    <div className="font-medium text-gray-900">{candidate.full_name}</div>
                    <div className="text-sm text-gray-500">{candidate.phone}</div>
                    {candidate.email && (
                      <div className="text-xs text-gray-400">{candidate.email}</div>
                    )}
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
                  <td>
                    <div className="text-sm font-medium">{candidate.users?.full_name || 'Unknown'}</div>
                    <div className="text-xs text-gray-500">{candidate.users?.role}</div>
                  </td>
                  <td className="text-sm">
                    {Math.floor((new Date().getTime() - new Date(candidate.created_at).getTime()) / (1000 * 60 * 60 * 24))} days
                  </td>
                  <td>
                    <button
                      onClick={() => router.push(`/sr-tl/candidates/${candidate.id}`)}
                      className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                    >
                      View Details →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function SrTLCandidatesPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div>Loading...</div>}>
        <CandidatesTable />
      </Suspense>
    </DashboardLayout>
  )
}
