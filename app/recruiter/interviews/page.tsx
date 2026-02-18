// app/recruiter/interviews/page.tsx - INTERVIEW SCHEDULING MODULE
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type ViewMode = 'list' | 'calendar'
type FilterMode = 'all' | 'today' | 'tomorrow' | 'upcoming'

export default function InterviewsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [interviews, setInterviews] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [user, setUser] = useState<any>(null)
  const [todayCount, setTodayCount] = useState(0)
  const [tomorrowCount, setTomorrowCount] = useState(0)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadInterviews(parsedUser.id, parsedUser.team_id, parsedUser.role)
    }
  }, [])

  const loadInterviews = async (userId: string, teamId: string, userRole: string) => {
    setLoading(true)
    try {
      let query = supabase
        .from('interviews')
        .select(`
          *,
          candidates (
            id,
            full_name,
            phone,
            email,
            current_stage,
            jobs (
              job_title,
              job_code,
              clients (company_name)
            )
          ),
          recruiters:recruiter_id (
            full_name,
            email
          )
        `)
        .order('interview_date', { ascending: true })
        .order('interview_time', { ascending: true })

      // Filter based on role
      if (userRole === 'recruiter') {
        query = query.eq('recruiter_id', userId)
      } else if (userRole === 'team_leader') {
        // Get all interviews for team's candidates
        const { data: teamCandidates } = await supabase
          .from('candidates')
          .select('id')
          .eq('team_id', teamId)
        
        const candidateIds = teamCandidates?.map(c => c.id) || []
        query = query.in('candidate_id', candidateIds)
      }
      // Management sees all interviews

      const { data, error } = await query

      if (error) throw error

      setInterviews(data || [])

      // Count today and tomorrow
      const today = new Date().toISOString().split('T')[0]
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      setTodayCount(data?.filter(i => i.interview_date === today).length || 0)
      setTomorrowCount(data?.filter(i => i.interview_date === tomorrow).length || 0)
    } catch (error) {
      console.error('Error loading interviews:', error)
    } finally {
      setLoading(false)
    }
  }

  const getFilteredInterviews = () => {
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    switch (filterMode) {
      case 'today':
        return interviews.filter(i => i.interview_date === today)
      case 'tomorrow':
        return interviews.filter(i => i.interview_date === tomorrow)
      case 'upcoming':
        return interviews.filter(i => i.interview_date >= today && i.status === 'scheduled')
      default:
        return interviews
    }
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

  const getInterviewTypeIcon = (type: string) => {
    const icons: { [key: string]: string } = {
      video: '🎥',
      phone: '📞',
      in_person: '🏢',
    }
    return icons[type] || '📅'
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    if (dateStr === today) return '🔵 Today'
    if (dateStr === tomorrow) return '🟢 Tomorrow'
    
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    })
  }

  const filteredInterviews = getFilteredInterviews()

  // Group by date for calendar view
  const groupedByDate = filteredInterviews.reduce((acc: any, interview) => {
    const date = interview.interview_date
    if (!acc[date]) acc[date] = []
    acc[date].push(interview)
    return acc
  }, {})

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Interview Scheduler</h2>
          <p className="text-gray-600">Manage and track all interviews</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card text-center bg-blue-50 border-2 border-blue-200">
            <div className="text-sm text-blue-600 font-medium mb-1">Today</div>
            <div className="text-3xl font-bold text-blue-900">{todayCount}</div>
          </div>
          <div className="card text-center bg-green-50 border-2 border-green-200">
            <div className="text-sm text-green-600 font-medium mb-1">Tomorrow</div>
            <div className="text-3xl font-bold text-green-900">{tomorrowCount}</div>
          </div>
          <div className="card text-center">
            <div className="text-sm text-gray-600 font-medium mb-1">Upcoming</div>
            <div className="text-3xl font-bold text-gray-900">
              {interviews.filter(i => i.status === 'scheduled').length}
            </div>
          </div>
          <div className="card text-center">
            <div className="text-sm text-gray-600 font-medium mb-1">Total</div>
            <div className="text-3xl font-bold text-gray-900">{interviews.length}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="card">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* View Mode Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📋 List View
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  viewMode === 'calendar'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📅 Calendar View
              </button>
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  filterMode === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({interviews.length})
              </button>
              <button
                onClick={() => setFilterMode('today')}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  filterMode === 'today'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                Today ({todayCount})
              </button>
              <button
                onClick={() => setFilterMode('tomorrow')}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  filterMode === 'tomorrow'
                    ? 'bg-green-600 text-white'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                Tomorrow ({tomorrowCount})
              </button>
              <button
                onClick={() => setFilterMode('upcoming')}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  filterMode === 'upcoming'
                    ? 'bg-purple-600 text-white'
                    : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                }`}
              >
                Upcoming
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600 mb-2">No interviews found</p>
            <p className="text-sm text-gray-500">
              {filterMode === 'today' && 'No interviews scheduled for today'}
              {filterMode === 'tomorrow' && 'No interviews scheduled for tomorrow'}
              {filterMode === 'upcoming' && 'No upcoming interviews'}
              {filterMode === 'all' && 'Schedule interviews from candidate profiles'}
            </p>
          </div>
        ) : (
          <>
            {/* LIST VIEW */}
            {viewMode === 'list' && (
              <div className="space-y-3">
                {filteredInterviews.map(interview => (
                  <div
                    key={interview.id}
                    className="card hover:shadow-lg transition cursor-pointer"
                    onClick={() => router.push(`/recruiter/candidates/${interview.candidate_id}`)}
                  >
                    <div className="flex items-start gap-4">
                      {/* Time */}
                      <div className="text-center min-w-[80px]">
                        <div className="text-sm text-gray-600">{formatDate(interview.interview_date)}</div>
                        <div className="text-lg font-bold text-gray-900">{interview.interview_time}</div>
                        <div className="text-xs text-gray-500">Round {interview.interview_round}</div>
                      </div>

                      {/* Divider */}
                      <div className="w-px bg-gray-200"></div>

                      {/* Details */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xl">{getInterviewTypeIcon(interview.interview_type)}</span>
                              <h3 className="font-bold text-gray-900">
                                {interview.candidates?.full_name}
                              </h3>
                            </div>
                            <div className="text-sm text-gray-600">
                              {interview.candidates?.jobs?.job_title} • {interview.candidates?.jobs?.clients?.company_name}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {interview.candidates?.jobs?.job_code}
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(interview.status)}`}>
                            {interview.status.toUpperCase()}
                          </span>
                        </div>

                        {interview.interviewer_name && (
                          <div className="flex items-center gap-4 text-sm text-gray-600 mt-2">
                            <span>👤 {interview.interviewer_name}</span>
                            {interview.interviewer_email && (
                              <span>📧 {interview.interviewer_email}</span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                          <span>📞 {interview.candidates?.phone}</span>
                          {interview.candidates?.email && (
                            <span>• {interview.candidates?.email}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CALENDAR VIEW */}
            {viewMode === 'calendar' && (
              <div className="space-y-6">
                {Object.keys(groupedByDate).sort().map(date => (
                  <div key={date} className="card">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      {formatDate(date)} - {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {groupedByDate[date].map((interview: any) => (
                        <div
                          key={interview.id}
                          className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition cursor-pointer border-l-4 border-blue-500"
                          onClick={() => router.push(`/recruiter/candidates/${interview.candidate_id}`)}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{getInterviewTypeIcon(interview.interview_type)}</span>
                              <span className="font-bold text-gray-900">{interview.interview_time}</span>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(interview.status)}`}>
                              {interview.status}
                            </span>
                          </div>
                          <div className="font-medium text-gray-900 mb-1">
                            {interview.candidates?.full_name}
                          </div>
                          <div className="text-sm text-gray-600">
                            {interview.candidates?.jobs?.job_title}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Round {interview.interview_round} • {interview.interviewer_name || 'TBD'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}