'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SrTeamLeaderDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [teamStats, setTeamStats] = useState<any>({})
  const [memberPerformance, setMemberPerformance] = useState<any[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      
      if (parsedUser.role !== 'sr_team_leader') {
        alert('Access denied. Sr. Team Leader only.')
        router.push('/')
        return
      }
      
      loadDashboard(parsedUser)
    }
  }, [])

  const loadDashboard = async (user: any) => {
    setLoading(true)
    try {
      console.log('📊 Loading Sr. TL dashboard for:', user.full_name)

      // Get team statistics
      const { data: stats, error: statsError } = await supabase.rpc('get_sr_tl_team_stats', {
        sr_tl_id: user.id
      })

      if (statsError) {
        console.error('Stats error:', statsError)
      } else if (stats && stats.length > 0) {
        console.log('✅ Stats loaded:', stats[0])
        setTeamStats(stats[0])
      }

      // Get individual performance
      const { data: performance, error: perfError } = await supabase.rpc('get_team_member_performance', {
        team_id_param: user.team_id
      })

      if (perfError) {
        console.error('Performance error:', perfError)
      } else if (performance) {
        console.log('✅ Performance loaded:', performance)
        setMemberPerformance(performance)
      }

    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const getPerformanceBadge = (joinings: number) => {
    if (joinings >= 5) return { text: '🔥 Top Performer', color: 'bg-green-100 text-green-800' }
    if (joinings >= 2) return { text: '✨ Good', color: 'bg-blue-100 text-blue-800' }
    if (joinings >= 1) return { text: '👍 Active', color: 'bg-yellow-100 text-yellow-800' }
    return { text: '⏳ Starting', color: 'bg-gray-100 text-gray-800' }
  }

  if (loading) {
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
        {/* Welcome Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome, {user?.full_name} 👋
          </h1>
          <p className="text-gray-600">Sr. Team Leader Dashboard - Manage Your Team</p>
        </div>

        {/* Team Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="kpi-card text-center">
            <div className="kpi-title">Team Leaders</div>
            <div className="kpi-value">{teamStats.total_tls || 0}</div>
          </div>

          <div className="kpi-card text-center">
            <div className="kpi-title">Recruiters</div>
            <div className="kpi-value">{teamStats.total_recruiters || 0}</div>
          </div>

          <div className="kpi-card text-center">
            <div className="kpi-title">Total Candidates</div>
            <div className="kpi-value">{teamStats.total_candidates || 0}</div>
          </div>

          <div className="kpi-card kpi-success text-center">
            <div className="kpi-title">This Month Joinings</div>
            <div className="kpi-value">{teamStats.month_joinings || 0}</div>
          </div>

          <div className="kpi-card text-center">
            <div className="kpi-title">Active Jobs</div>
            <div className="kpi-value">{teamStats.active_jobs || 0}</div>
            <div className="text-xs text-gray-500">of {teamStats.total_jobs || 0} total</div>
          </div>

          <div className="kpi-card text-center">
            <div className="kpi-title">Team Size</div>
            <div className="kpi-value">{teamStats.total_team_members || 0}</div>
          </div>
        </div>

        {/* Team Performance */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              📈 Team Member Performance
            </h3>
            <button
              onClick={() => router.push('/sr-tl/team-leaders')}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              View All Team Leaders →
            </button>
          </div>
          
          {memberPerformance.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📊</div>
              <p className="text-gray-600 text-lg mb-2">No performance data available yet</p>
              <p className="text-sm text-gray-500 mb-6">
                Performance data will appear once team members add candidates to jobs
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => router.push('/sr-tl/candidates/add')}
                  className="btn-primary"
                >
                  + Add First Candidate
                </button>
                <button
                  onClick={() => router.push('/sr-tl/jobs')}
                  className="bg-white border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 font-medium"
                >
                  View Jobs
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Total Candidates</th>
                    <th>This Month Joinings</th>
                    <th>Active Pipeline</th>
                    <th>Performance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {memberPerformance.map(member => {
                    const badge = getPerformanceBadge(member.this_month_joinings)
                    return (
                      <tr key={member.user_id}>
                        <td className="font-medium text-gray-900">{member.user_name}</td>
                        <td>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            member.role === 'team_leader' 
                              ? 'bg-blue-100 text-blue-800' 
                              : member.role === 'sr_team_leader'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {member.role === 'team_leader' ? 'TEAM LEADER' : 
                             member.role === 'sr_team_leader' ? 'SR. TEAM LEADER' : 
                             'RECRUITER'}
                          </span>
                        </td>
                        <td className="text-center">
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 rounded-full">
                            <span className="font-bold text-blue-600">{member.candidates_count}</span>
                          </span>
                        </td>
                        <td className="text-center">
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 rounded-full">
                            <span className="font-bold text-green-600">{member.this_month_joinings}</span>
                            {member.this_month_joinings >= 3 && <span>🔥</span>}
                          </span>
                        </td>
                        <td className="text-center">
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-50 rounded-full">
                            <span className="font-bold text-orange-600">{member.pipeline_count}</span>
                          </span>
                        </td>
                        <td>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
                            {badge.text}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => router.push(`/sr-tl/candidates?recruiter=${member.user_id}`)}
                            className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                          >
                            View Candidates →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Performance Summary */}
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-sm text-gray-600">Total Team Members</div>
                    <div className="text-2xl font-bold text-gray-900">{memberPerformance.length}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Total Candidates</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {memberPerformance.reduce((sum, m) => sum + m.candidates_count, 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Total Joinings</div>
                    <div className="text-2xl font-bold text-green-600">
                      {memberPerformance.reduce((sum, m) => sum + m.this_month_joinings, 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Active Pipeline</div>
                    <div className="text-2xl font-bold text-orange-600">
                      {memberPerformance.reduce((sum, m) => sum + m.pipeline_count, 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => router.push('/sr-tl/candidates')}
              className="p-4 bg-blue-50 hover:bg-blue-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">📋</div>
              <div className="font-medium text-blue-900">All Candidates</div>
              <div className="text-xs text-blue-600 mt-1">
                {teamStats.total_candidates || 0} total
              </div>
            </button>
            
            <button
              onClick={() => router.push('/sr-tl/jobs')}
              className="p-4 bg-green-50 hover:bg-green-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">💼</div>
              <div className="font-medium text-green-900">Manage Jobs</div>
              <div className="text-xs text-green-600 mt-1">
                {teamStats.active_jobs || 0} active jobs
              </div>
            </button>
            
            <button
              onClick={() => router.push('/sr-tl/team-leaders')}
              className="p-4 bg-purple-50 hover:bg-purple-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">👥</div>
              <div className="font-medium text-purple-900">Team Leaders</div>
              <div className="text-xs text-purple-600 mt-1">
                {teamStats.total_tls || 0} team leaders
              </div>
            </button>
            
            <button
              onClick={() => router.push('/sr-tl/interviews')}
              className="p-4 bg-orange-50 hover:bg-orange-100 rounded-lg text-center transition"
            >
              <div className="text-3xl mb-2">🗓️</div>
              <div className="font-medium text-orange-900">Interviews</div>
              <div className="text-xs text-orange-600 mt-1">View schedule</div>
            </button>
          </div>
        </div>

        {/* Recent Activity (Optional - you can remove if not needed) */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            💡 Quick Tips for Sr. Team Leaders
          </h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
              <span className="text-2xl">👥</span>
              <div>
                <div className="font-medium text-blue-900">Monitor Team Performance</div>
                <div className="text-sm text-blue-700">
                  Check the performance table above to identify top performers and those who need support
                </div>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
              <span className="text-2xl">🎯</span>
              <div>
                <div className="font-medium text-green-900">Set Clear Goals</div>
                <div className="text-sm text-green-700">
                  Review monthly targets and help your team leaders achieve their objectives
                </div>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
              <span className="text-2xl">📊</span>
              <div>
                <div className="font-medium text-purple-900">Review Weekly</div>
                <div className="text-sm text-purple-700">
                  Schedule weekly reviews with each team leader to discuss progress and challenges
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}