// app/sr-tl/interviews/page.tsx - FIXED VERSION
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SrTLInterviewsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [interviews, setInterviews] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [filterType, setFilterType] = useState('all')
  const [teamMembers, setTeamMembers] = useState<any[]>([])

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
      
      loadTeamMembers(parsedUser)
    }
  }, [])

  useEffect(() => {
    if (teamMembers.length > 0) {
      loadInterviews()
    }
  }, [teamMembers, filterType])

  const loadTeamMembers = async (currentUser: any) => {
    try {
      console.log('🔵 Loading team for Sr.TL:', currentUser.full_name)

      // STEP 1: Get direct reports (TLs and any direct recruiters)
      const { data: directReports, error: directError } = await supabase
        .from('users')
        .select('id, full_name, role, team_id')
        .eq('reports_to', currentUser.id)
        .eq('is_active', true)

      if (directError) {
        console.error('❌ Error loading direct reports:', directError)
        throw directError
      }

      console.log('✅ Direct reports:', directReports?.length || 0)

      // STEP 2: Get TL IDs
      const tlIds = directReports?.filter(m => m.role === 'team_leader').map(m => m.id) || []
      console.log('🟢 TL IDs:', tlIds)

      // STEP 3: Get recruiters who report to those TLs
      let indirectRecruiters: any[] = []
      if (tlIds.length > 0) {
        const { data: recruiterReports, error: recError } = await supabase
          .from('users')
          .select('id, full_name, role, team_id')
          .in('reports_to', tlIds)
          .eq('role', 'recruiter')
          .eq('is_active', true)

        if (recError) {
          console.error('❌ Error loading indirect recruiters:', recError)
        } else {
          indirectRecruiters = recruiterReports || []
          console.log('✅ Indirect recruiters:', indirectRecruiters.length)
        }
      }

      // STEP 4: Combine all team members
      const allMembers = [...(directReports || []), ...indirectRecruiters]
      console.log('📊 Total team members:', allMembers.length)

      setTeamMembers(allMembers)

    } catch (error) {
      console.error('❌ Fatal error loading team:', error)
      setTeamMembers([])
    }
  }

  const loadInterviews = async () => {
    setLoading(true)
    try {
      const teamMemberIds = teamMembers.map(m => m.id)

      if (teamMemberIds.length === 0) {
        setInterviews([])
        setLoading(false)
        return
      }

      console.log('📥 Loading candidates for', teamMemberIds.length, 'team members')

      // Get candidates for team members
      const { data: teamCandidates, error: candidatesError } = await supabase
        .from('candidates')
        .select('id')
        .in('assigned_to', teamMemberIds)

      if (candidatesError) {
        console.error('❌ Error loading candidates:', candidatesError)
        throw candidatesError
      }

      if (!teamCandidates || teamCandidates.length === 0) {
        console.log('⚠️ No candidates found for team')
        setInterviews([])
        setLoading(false)
        return
      }

      const candidateIds = teamCandidates.map(c => c.id)
      console.log('✅ Found candidates:', candidateIds.length)

      // Get interviews for team candidates
      let query = supabase
        .from('interviews')
        .select(`
          *,
          candidates (
            full_name,
            phone,
            jobs (
              job_title,
              job_code
            )
          ),
          recruiter:recruiter_id (
            full_name
          )
        `)
        .in('candidate_id', candidateIds)
        .order('interview_date', { ascending: true })

      // Apply filters
      if (filterType === 'today') {
        const today = new Date().toISOString().split('T')[0]
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
        query = query.gte('interview_date', today).lt('interview_date', tomorrow)
      } else if (filterType === 'tomorrow') {
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
        const dayAfter = new Date(Date.now() + 172800000).toISOString().split('T')[0]
        query = query.gte('interview_date', tomorrow).lt('interview_date', dayAfter)
      } else if (filterType === 'upcoming') {
        query = query.eq('status', 'scheduled').gte('interview_date', new Date().toISOString())
      }

      const { data, error } = await query

      if (error) throw error
      
      console.log('✅ Loaded interviews:', data?.length || 0)
      setInterviews(data || [])

    } catch (error) {
      console.error('❌ Error loading interviews:', error)
      setInterviews([])
    } finally {
      setLoading(false)
    }
  }

  const getInterviewTypeIcon = (type: string) => {
    const icons: { [key: string]: string } = {
      phone: '📞',
      video: '🎥',
      in_person: '🏢',
    }
    return icons[type] || '📋'
  }

  const getStatusBadge = (status: string) => {
    const badges: { [key: string]: string } = {
      scheduled: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      rescheduled: 'bg-yellow-100 text-yellow-800',
      no_show: 'bg-gray-100 text-gray-800',
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) {
      return '🔵 Today'
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return '🟢 Tomorrow'
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }

  const interviewCounts = {
    all: interviews.length,
    today: interviews.filter(i => {
      const date = new Date(i.interview_date)
      return date.toDateString() === new Date().toDateString()
    }).length,
    tomorrow: interviews.filter(i => {
      const date = new Date(i.interview_date)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      return date.toDateString() === tomorrow.toDateString()
    }).length,
    upcoming: interviews.filter(i => i.status === 'scheduled').length,
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 text-center">Team Interviews</h2>
          <p className="text-gray-600 text-center">
            View and manage all team interviews ({teamMembers.length} team members)
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => setFilterType('all')}
            className={`kpi-card text-center cursor-pointer transition ${
              filterType === 'all' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">All Interviews</div>
            <div className="kpi-value">{interviewCounts.all}</div>
          </button>

          <button
            onClick={() => setFilterType('today')}
            className={`kpi-card text-center cursor-pointer transition ${
              filterType === 'today' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">🔵 Today</div>
            <div className="kpi-value">{interviewCounts.today}</div>
          </button>

          <button
            onClick={() => setFilterType('tomorrow')}
            className={`kpi-card kpi-success text-center cursor-pointer transition ${
              filterType === 'tomorrow' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">🟢 Tomorrow</div>
            <div className="kpi-value">{interviewCounts.tomorrow}</div>
          </button>

          <button
            onClick={() => setFilterType('upcoming')}
            className={`kpi-card text-center cursor-pointer transition ${
              filterType === 'upcoming' ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="kpi-title">Upcoming</div>
            <div className="kpi-value">{interviewCounts.upcoming}</div>
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="card">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-lg font-medium ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📋 List View
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2 rounded-lg font-medium ${
                viewMode === 'calendar'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📅 Calendar View
            </button>
          </div>
        </div>

        {/* Interviews List */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading team interviews...</p>
          </div>
        ) : interviews.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600 mb-2">No interviews found</p>
            <p className="text-sm text-gray-500">
              Team members: {teamMembers.length}
            </p>
            {filterType !== 'all' && (
              <button
                onClick={() => setFilterType('all')}
                className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Show all interviews
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {interviews.map(interview => (
              <div
                key={interview.id}
                className="card hover:shadow-lg transition cursor-pointer"
                onClick={() => router.push(`/sr-tl/candidates/${interview.candidate_id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{getInterviewTypeIcon(interview.interview_type)}</span>
                      <div>
                        <h3 className="font-bold text-gray-900">
                          {interview.candidates?.full_name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {interview.candidates?.jobs?.job_code} - {interview.candidates?.jobs?.job_title}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                      <div>
                        <div className="text-xs text-gray-500">Date</div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatDate(interview.interview_date)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Time</div>
                        <div className="text-sm font-medium text-gray-900">
                          {interview.interview_time}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Round</div>
                        <div className="text-sm font-medium text-gray-900">
                          Round {interview.interview_round}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Recruiter</div>
                        <div className="text-sm font-medium text-gray-900">
                          {interview.recruiter?.full_name}
                        </div>
                      </div>
                    </div>

                    {interview.interviewer_name && (
                      <div className="mt-2 text-sm text-gray-600">
                        Interviewer: <span className="font-medium">{interview.interviewer_name}</span>
                      </div>
                    )}
                  </div>

                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(interview.status)}`}>
                    {interview.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
