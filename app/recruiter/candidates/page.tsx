// app/recruiter/candidates/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

export default function CandidatesListPage() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  // Filter states
  const [searchTerm, setSearchTerm] = useState('')
  const [stageFilter, setStageFilter] = useState('all')

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadCandidates(parsedUser.team_id)
    }
  }, [])

  useEffect(() => {
    filterCandidates()
  }, [searchTerm, stageFilter, candidates])

  const loadCandidates = async (teamId: string) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
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

      if (error) throw error

      setCandidates(data || [])
      setFilteredCandidates(data || [])
    } catch (error) {
      console.error('Error loading candidates:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterCandidates = () => {
    let filtered = [...candidates]

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (c) =>
          c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.phone.includes(searchTerm) ||
          c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.current_company?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Stage filter
    if (stageFilter !== 'all') {
      filtered = filtered.filter((c) => c.current_stage === stageFilter)
    }

    setFilteredCandidates(filtered)
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
    return stage.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  const formatDate = (date: string) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  const getDaysInPipeline = (dateSourced: string) => {
    if (!dateSourced) return 0
    const days = Math.floor(
      (new Date().getTime() - new Date(dateSourced).getTime()) / (1000 * 60 * 60 * 24)
    )
    return days
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Team Candidates</h2>
            <p className="text-gray-600">View and manage your team&apos;s pipeline</p>
          </div>
          <button
            onClick={() => router.push('/recruiter/candidates/add')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            + Add Candidate
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                placeholder="Name, phone, email, company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Stage Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Stage
              </label>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Stages</option>
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
          </div>

          {/* Results count */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Showing <span className="font-semibold">{filteredCandidates.length}</span> of{' '}
              <span className="font-semibold">{candidates.length}</span> candidates
            </p>
          </div>
        </div>

        {/* Candidates List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading candidates...</p>
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-600 text-lg">No candidates found</p>
            <p className="text-gray-500 text-sm mt-2">
              {searchTerm || stageFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Add your first candidate to get started'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Candidate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job / Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expected CTC
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sourced By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Days in Pipeline
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCandidates.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
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
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {candidate.jobs?.job_title || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {candidate.jobs?.clients?.company_name || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStageColor(
                          candidate.current_stage
                        )}`}
                      >
                        {formatStage(candidate.current_stage)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {candidate.expected_ctc ? `₹${candidate.expected_ctc}L` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {candidate.users?.full_name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-medium ${
                          getDaysInPipeline(candidate.date_sourced) > 30
                            ? 'text-red-600'
                            : getDaysInPipeline(candidate.date_sourced) > 15
                            ? 'text-yellow-600'
                            : 'text-gray-900'
                        }`}
                      >
                        {getDaysInPipeline(candidate.date_sourced)} days
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() =>
                          router.push(`/recruiter/candidates/${candidate.id}`)
                        }
                        className="text-blue-600 hover:text-blue-900 font-medium"
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
    </DashboardLayout>
  )
}