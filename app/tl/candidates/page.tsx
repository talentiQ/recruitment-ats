// app/tl/candidates/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Candidate {
  id: string
  full_name: string
  phone: string
  email: string
  current_company: string
  current_stage: string
  expected_ctc: number
  date_sourced: string
  assigned_to: string
  jobs: {
    job_title: string
    clients: {
      company_name: string
    }
  }
  users: {
    full_name: string
  }
}

interface TeamMember {
  id: string
  full_name: string
}

export default function TLCandidatesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [stageFilter, setStageFilter] = useState(searchParams.get('filter') === 'stale' ? 'stale' : 'all')
  const [recruiterFilter, setRecruiterFilter] = useState('all')

  // Reassignment
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [reassignToId, setReassignToId] = useState('')
  const [reassigning, setReassigning] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadData(parsedUser.team_id)
    }
  }, [])

  useEffect(() => {
    filterCandidates()
  }, [searchTerm, stageFilter, recruiterFilter, candidates])

  const loadData = async (teamId: string) => {
    setLoading(true)
    try {
      // Load candidates
      const { data: candidatesData, error: candidatesError } = await supabase
        .from('candidates')
        .select(`
          *,
          jobs (
            job_title,
            clients (
              company_name
            )
          ),
          users:assigned_to (
            full_name
          )
        `)
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })

      if (candidatesError) throw candidatesError

      // Load team members
      const { data: membersData, error: membersError } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('team_id', teamId)
        .eq('role', 'recruiter')
        .order('full_name')

      if (membersError) throw membersError

      setCandidates(candidatesData || [])
      setTeamMembers(membersData || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterCandidates = () => {
    let filtered = [...candidates]

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(c =>
        c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.current_company?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Stage filter
    if (stageFilter === 'stale') {
      filtered = filtered.filter(c => {
        if (['joined', 'rejected', 'dropped'].includes(c.current_stage)) return false
        const days = Math.floor(
          (new Date().getTime() - new Date(c.date_sourced).getTime()) / (1000 * 60 * 60 * 24)
        )
        return days > 30
      })
    } else if (stageFilter !== 'all') {
      filtered = filtered.filter(c => c.current_stage === stageFilter)
    }

    // Recruiter filter
    if (recruiterFilter !== 'all') {
      filtered = filtered.filter(c => c.assigned_to === recruiterFilter)
    }

    setFilteredCandidates(filtered)
  }

  const toggleCandidateSelection = (id: string) => {
    const newSelected = new Set(selectedCandidates)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedCandidates(newSelected)
  }

  const handleReassign = async () => {
    if (!reassignToId || selectedCandidates.size === 0) {
      alert('Please select candidates and a team member to reassign to')
      return
    }

    if (!confirm(`Reassign ${selectedCandidates.size} candidate(s) to selected recruiter?`)) {
      return
    }

    setReassigning(true)
    try {
      const updates = Array.from(selectedCandidates).map(candidateId =>
        supabase
          .from('candidates')
          .update({ assigned_to: reassignToId })
          .eq('id', candidateId)
      )

      await Promise.all(updates)

      // Log activity
      const logs = Array.from(selectedCandidates).map(candidateId =>
        supabase.from('activity_log').insert([{
          user_id: user.id,
          action: 'reassigned_candidate',
          entity_type: 'candidate',
          entity_id: candidateId,
          new_value: { assigned_to: reassignToId }
        }])
      )

      await Promise.all(logs)

      alert('✅ Candidates reassigned successfully!')
      setSelectedCandidates(new Set())
      setReassignToId('')
      loadData(user.team_id)
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setReassigning(false)
    }
  }

  const getDaysInPipeline = (dateSourced: string) => {
    if (!dateSourced) return 0
    return Math.floor(
      (new Date().getTime() - new Date(dateSourced).getTime()) / (1000 * 60 * 60 * 24)
    )
  }

  const getStageColor = (stage: string) => {
    const colors: { [key: string]: string } = {
      sourced: 'bg-gray-100 text-gray-800',
      screening: 'bg-yellow-100 text-yellow-800',
      interview_scheduled: 'bg-blue-100 text-blue-800',
      interview_completed: 'bg-purple-100 text-purple-800',
      offer_made: 'bg-indigo-100 text-indigo-800',
      offer_accepted: 'bg-green-100 text-green-800',
      joined: 'bg-green-500 text-white',
      rejected: 'bg-red-100 text-red-800',
      dropped: 'bg-gray-300 text-gray-700',
    }
    return colors[stage] || 'bg-gray-100 text-gray-800'
  }

  const formatStage = (stage: string) => {
    return stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Team Pipeline</h2>
            <p className="text-gray-600">Manage all team candidates and reassign as needed</p>
          </div>
          <button
            onClick={() => router.push('/tl/candidates/add')}
            className="btn-primary"
          >
            + Add Candidate
          </button>
        </div>

        {/* Reassignment Bar */}
        {selectedCandidates.size > 0 && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-medium text-blue-900">
                  {selectedCandidates.size} candidate(s) selected
                </span>
                <select
                  value={reassignToId}
                  onChange={e => setReassignToId(e.target.value)}
                  className="input"
                >
                  <option value="">Select Recruiter to Reassign</option>
                  {teamMembers.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.full_name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleReassign}
                  disabled={reassigning || !reassignToId}
                  className="btn-primary"
                >
                  {reassigning ? 'Reassigning...' : 'Reassign Now'}
                </button>
              </div>
              <button
                onClick={() => setSelectedCandidates(new Set())}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                placeholder="Name, phone, email, company..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stage
              </label>
              <select
                value={stageFilter}
                onChange={e => setStageFilter(e.target.value)}
                className="input"
              >
                <option value="all">All Stages</option>
                <option value="stale">⚠️ Stale (>30 days)</option>
                <option value="sourced">Sourced</option>
                <option value="screening">Screening</option>
                <option value="interview_scheduled">Interview Scheduled</option>
                <option value="interview_completed">Interview Completed</option>
                <option value="offer_made">Offer Made</option>
                <option value="offer_accepted">Offer Accepted</option>
                <option value="joined">Joined</option>
                <option value="rejected">Rejected</option>
                <option value="dropped">Dropped</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recruiter
              </label>
              <select
                value={recruiterFilter}
                onChange={e => setRecruiterFilter(e.target.value)}
                className="input"
              >
                <option value="all">All Recruiters</option>
                {teamMembers.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Showing <strong>{filteredCandidates.length}</strong> of{' '}
              <strong>{candidates.length}</strong> candidates
            </p>
          </div>
        </div>

        {/* Candidates Table */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading candidates...</p>
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600 text-lg">No candidates found</p>
            <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-12">
                    <input
                      type="checkbox"
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedCandidates(new Set(filteredCandidates.map(c => c.id)))
                        } else {
                          setSelectedCandidates(new Set())
                        }
                      }}
                      checked={
                        filteredCandidates.length > 0 &&
                        selectedCandidates.size === filteredCandidates.length
                      }
                    />
                  </th>
                  <th>Candidate</th>
                  <th>Job / Client</th>
                  <th>Stage</th>
                  <th>Expected CTC</th>
                  <th>Assigned To</th>
                  <th>Days</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map(candidate => (
                  <tr key={candidate.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedCandidates.has(candidate.id)}
                        onChange={() => toggleCandidateSelection(candidate.id)}
                      />
                    </td>
                    <td>
                      <div>
                        <div className="font-medium text-gray-900">
                          {candidate.full_name}
                        </div>
                        <div className="text-sm text-gray-500">{candidate.phone}</div>
                        {candidate.current_company && (
                          <div className="text-xs text-gray-400">
                            @ {candidate.current_company}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-gray-900">
                        {candidate.jobs?.job_title || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {candidate.jobs?.clients?.company_name || 'N/A'}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStageColor(
                          candidate.current_stage
                        )}`}
                      >
                        {formatStage(candidate.current_stage)}
                      </span>
                    </td>
                    <td className="text-sm">
                      {candidate.expected_ctc ? `₹${candidate.expected_ctc}L` : 'N/A'}
                    </td>
                    <td className="text-sm text-gray-500">
                      {candidate.users?.full_name || 'Unknown'}
                    </td>
                    <td>
                      <span
                        className={`text-sm font-medium ${
                          getDaysInPipeline(candidate.date_sourced) > 30
                            ? 'text-red-600'
                            : getDaysInPipeline(candidate.date_sourced) > 15
                            ? 'text-yellow-600'
                            : 'text-gray-900'
                        }`}
                      >
                        {getDaysInPipeline(candidate.date_sourced)}d
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => router.push(`/tl/candidates/${candidate.id}`)}
                        className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                      >
                        View →
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