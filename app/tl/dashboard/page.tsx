// app/tl/dashboard/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface DashboardStats {
  totalCandidates: number
  activeCandidates: number
  thisMonthJoinings: number
  thisWeekJoinings: number
  todayJoinings: number
  teamRevenue: number
  teamTarget: number
  achievementPercent: number
  
  // Pipeline stages
  sourced: number
  screening: number
  interview: number
  offered: number
  joined: number
  dropped: number
  
  // By recruiter
  recruiterStats: Array<{
    id: string
    name: string
    candidates: number
    joinings: number
    revenue: number
  }>
  
  // By client
  clientStats: Array<{
    clientName: string
    candidates: number
    joinings: number
  }>
  
  // Critical alerts
  staleCount: number
  pendingInterviews: number
  pendingOffers: number
}

export default function TLDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month'>('month')
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadDashboardStats(parsedUser.team_id)
    }
  }, [timeFilter])

  const loadDashboardStats = async (teamId: string) => {
    setLoading(true)
    try {
      // Get all team candidates
      const { data: candidates, error: candidatesError } = await supabase
        .from('candidates')
        .select(`
          *,
          jobs (
            clients (
              company_name
            )
          ),
          users:assigned_to (
            id,
            full_name
          )
        `)
        .eq('team_id', teamId)

      if (candidatesError) throw candidatesError

      // Get team members
      const { data: teamMembers } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('team_id', teamId)
        .eq('role', 'recruiter')

      // Get team target
      const currentMonth = new Date().toISOString().slice(0, 7)
      const { data: targetData } = await supabase
        .from('targets')
        .select('revenue_target')
        .eq('team_id', teamId)
        .eq('target_type', 'team')
        .gte('month', currentMonth + '-01')
        .lte('month', currentMonth + '-31')
        .single()

      // Calculate stats
      const now = new Date()
      const today = now.toISOString().slice(0, 10)
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

      const totalCandidates = candidates?.length || 0
      const activeCandidates = candidates?.filter(c => 
        !['joined', 'rejected', 'dropped'].includes(c.current_stage)
      ).length || 0

      // Joinings by time period
      const todayJoinings = candidates?.filter(c => 
        c.date_joined?.startsWith(today)
      ).length || 0

      const thisWeekJoinings = candidates?.filter(c => 
        c.date_joined && c.date_joined >= weekAgo
      ).length || 0

      const thisMonthJoinings = candidates?.filter(c => 
        c.date_joined && c.date_joined >= monthStart
      ).length || 0

      // Revenue calculation
      const teamRevenue = candidates?.reduce((sum, c) => 
        sum + (c.revenue_generated || 0), 0
      ) || 0

      const teamTarget = targetData?.revenue_target || 0
      const achievementPercent = teamTarget > 0 
        ? Math.round((teamRevenue / teamTarget) * 100) 
        : 0

      // Pipeline stages
      const sourced = candidates?.filter(c => c.current_stage === 'sourced').length || 0
      const screening = candidates?.filter(c => c.current_stage === 'screening').length || 0
      const interview = candidates?.filter(c => 
        ['interview_scheduled', 'interview_completed'].includes(c.current_stage)
      ).length || 0
      const offered = candidates?.filter(c => 
        ['offer_made', 'offer_accepted'].includes(c.current_stage)
      ).length || 0
      const joined = candidates?.filter(c => c.current_stage === 'joined').length || 0
      const dropped = candidates?.filter(c => 
        ['rejected', 'dropped'].includes(c.current_stage)
      ).length || 0

      // Recruiter stats
      const recruiterStats = teamMembers?.map(member => {
        const memberCandidates = candidates?.filter(c => c.assigned_to === member.id) || []
        const memberJoinings = memberCandidates.filter(c => c.current_stage === 'joined').length
        const memberRevenue = memberCandidates.reduce((sum, c) => sum + (c.revenue_generated || 0), 0)
        
        return {
          id: member.id,
          name: member.full_name,
          candidates: memberCandidates.length,
          joinings: memberJoinings,
          revenue: Number(memberRevenue.toFixed(2))
        }
      }).sort((a, b) => b.revenue - a.revenue) || []

      // Client stats
      const clientMap = new Map()
      candidates?.forEach(c => {
        const clientName = c.jobs?.clients?.company_name || 'Unknown'
        if (!clientMap.has(clientName)) {
          clientMap.set(clientName, { clientName, candidates: 0, joinings: 0 })
        }
        const stats = clientMap.get(clientName)
        stats.candidates++
        if (c.current_stage === 'joined') stats.joinings++
      })
      const clientStats = Array.from(clientMap.values())
        .sort((a, b) => b.joinings - a.joinings)

      // Critical alerts
      const staleCount = candidates?.filter(c => {
        if (['joined', 'rejected', 'dropped'].includes(c.current_stage)) return false
        const daysSinceSourced = Math.floor(
          (now.getTime() - new Date(c.date_sourced).getTime()) / (1000 * 60 * 60 * 24)
        )
        return daysSinceSourced > 30
      }).length || 0

      const pendingInterviews = candidates?.filter(c => 
        c.current_stage === 'interview_scheduled'
      ).length || 0

      const pendingOffers = candidates?.filter(c => 
        c.current_stage === 'offer_made'
      ).length || 0

      setStats({
        totalCandidates,
        activeCandidates,
        thisMonthJoinings,
        thisWeekJoinings,
        todayJoinings,
        teamRevenue,
        teamTarget,
        achievementPercent,
        sourced,
        screening,
        interview,
        offered,
        joined,
        dropped,
        recruiterStats,
        clientStats,
        staleCount,
        pendingInterviews,
        pendingOffers
      })
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !stats) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  const getJoinings = () => {
    if (timeFilter === 'day') return stats.todayJoinings
    if (timeFilter === 'week') return stats.thisWeekJoinings
    return stats.thisMonthJoinings
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header with Time Filter */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Team Dashboard</h2>
            <p className="text-gray-600">Comprehensive team performance overview</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTimeFilter('day')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                timeFilter === 'day'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-500'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeFilter('week')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                timeFilter === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-500'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setTimeFilter('month')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                timeFilter === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-500'
              }`}
            >
              This Month
            </button>
          </div>
        </div>

        {/* Critical Alerts */}
        {(stats.staleCount > 0 || stats.pendingInterviews > 0 || stats.pendingOffers > 0) && (
          <div className="alert">
            <strong>⚠️ Action Required:</strong>
            {stats.staleCount > 0 && ` ${stats.staleCount} stale candidates (>30 days)`}
            {stats.pendingInterviews > 0 && ` • ${stats.pendingInterviews} pending interviews`}
            {stats.pendingOffers > 0 && ` • ${stats.pendingOffers} pending offers`}
          </div>
        )}

        {/* Overall Performance - Target vs Achievement */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            📊 Overall Performance - Target vs Achievement
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className={`kpi-card ${stats.achievementPercent >= 100 ? 'kpi-success' : stats.achievementPercent >= 70 ? 'kpi-warning' : 'kpi-danger'}`}>
              <div className="kpi-title">Achievement</div>
              <div className="kpi-value">{stats.achievementPercent}%</div>
              <div className="kpi-sub">
                ₹{stats.teamRevenue.toFixed(2)}L / ₹{stats.teamTarget}L
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-title">Total Pipeline</div>
              <div className="kpi-value">{stats.totalCandidates}</div>
              <div className="kpi-sub">{stats.activeCandidates} active</div>
            </div>

            <div className="kpi-card kpi-success">
              <div className="kpi-title">Joinings ({timeFilter})</div>
              <div className="kpi-value">{getJoinings()}</div>
              <div className="kpi-sub">{stats.joined} total joined</div>
            </div>

            <div className="kpi-card kpi-warning">
              <div className="kpi-title">Drop-offs</div>
              <div className="kpi-value">{stats.dropped}</div>
              <div className="kpi-sub">
                {stats.totalCandidates > 0 
                  ? Math.round((stats.dropped / stats.totalCandidates) * 100) 
                  : 0}% drop rate
              </div>
            </div>
          </div>
        </div>

        {/* Current Pipeline - Stage Wise */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            🔄 Current Pipeline - Stage Wise
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="card">
              <div className="text-sm text-gray-600 mb-1">Sourced</div>
              <div className="text-2xl font-bold text-gray-900">{stats.sourced}</div>
            </div>
            <div className="card">
              <div className="text-sm text-gray-600 mb-1">Screening</div>
              <div className="text-2xl font-bold text-yellow-600">{stats.screening}</div>
            </div>
            <div className="card">
              <div className="text-sm text-gray-600 mb-1">Interview</div>
              <div className="text-2xl font-bold text-blue-600">{stats.interview}</div>
            </div>
            <div className="card">
              <div className="text-sm text-gray-600 mb-1">Offered</div>
              <div className="text-2xl font-bold text-purple-600">{stats.offered}</div>
            </div>
            <div className="card">
              <div className="text-sm text-gray-600 mb-1">Joined</div>
              <div className="text-2xl font-bold text-green-600">{stats.joined}</div>
            </div>
            <div className="card">
              <div className="text-sm text-gray-600 mb-1">Dropped</div>
              <div className="text-2xl font-bold text-red-600">{stats.dropped}</div>
            </div>
          </div>
        </div>

        {/* Team Members Performance */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            👥 Team Members Performance
          </h3>
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Recruiter</th>
                  <th>Candidates</th>
                  <th>Joinings</th>
                  <th>Revenue</th>
                  <th>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {stats.recruiterStats.map((recruiter) => (
                  <tr key={recruiter.id}>
                    <td className="font-medium">{recruiter.name}</td>
                    <td>{recruiter.candidates}</td>
                    <td>
                      <span className="badge-success">{recruiter.joinings}</span>
                    </td>
                    <td className="font-semibold text-blue-600">
                      ₹{recruiter.revenue}L
                    </td>
                    <td>
                      {recruiter.candidates > 0
                        ? Math.round((recruiter.joinings / recruiter.candidates) * 100)
                        : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Client Wise Performance */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            🏢 Client Wise Performance
          </h3>
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Candidates</th>
                  <th>Joinings</th>
                  <th>Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {stats.clientStats.slice(0, 10).map((client, idx) => (
                  <tr key={idx}>
                    <td className="font-medium">{client.clientName}</td>
                    <td>{client.candidates}</td>
                    <td>
                      <span className="badge-success">{client.joinings}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{
                              width: `${
                                client.candidates > 0
                                  ? (client.joinings / client.candidates) * 100
                                  : 0
                              }%`
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium">
                          {client.candidates > 0
                            ? Math.round((client.joinings / client.candidates) * 100)
                            : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            ⚡ Quick Actions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <button
              onClick={() => router.push('/tl/candidates')}
              className="btn-primary text-center"
            >
              View Team Pipeline
            </button>
            <button
              onClick={() => router.push('/tl/candidates/add')}
              className="btn-primary text-center"
            >
              + Add Candidate
            </button>
            <button
              onClick={() => router.push('/tl/candidates?filter=stale')}
              className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700"
            >
              Review Stale Candidates
            </button>
            <button
              onClick={() => router.push('/tl/jobs')}
              className="bg-white border-2 border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:border-blue-500"
            >
              Manage Jobs
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}