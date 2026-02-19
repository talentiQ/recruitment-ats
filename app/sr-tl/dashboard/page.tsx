//app/sr-tl/dashboard/page.tsx
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
      // Get team members count
      const { data: teamMembers, error: membersError } = await supabase
        .from('users')
        .select('id, role')
        .eq('team_id', user.team_id)

      if (membersError) {
        console.error('Team members error:', membersError)
      }

      const totalTLs = teamMembers?.filter(m => m.role === 'team_leader').length || 0
      const totalRecruiters = teamMembers?.filter(m => m.role === 'recruiter').length || 0
      const totalTeamMembers = teamMembers?.length || 0

      // Get total candidates
      const { count: candidatesCount } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', user.team_id)

      // Get this month joinings
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const { count: monthJoinings } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', user.team_id)
        .eq('current_stage', 'joined')
        .gte('date_joined', firstDayOfMonth)

      // Get jobs count
      const { count: totalJobs } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_team_id', user.team_id)

      const { count: activeJobs } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_team_id', user.team_id)
        .eq('status', 'open')

      setTeamStats({
        total_tls: totalTLs,
        total_recruiters: totalRecruiters,
        total_team_members: totalTeamMembers,
        total_candidates: candidatesCount || 0,
        month_joinings: monthJoinings || 0,
        total_jobs: totalJobs || 0,
        active_jobs: activeJobs || 0,
      })

      // Get member performance
      if (teamMembers && teamMembers.length > 0) {
        const performanceData = await Promise.all(
          teamMembers.map(async (member) => {
            const { count: candidatesCount } = await supabase
              .from('candidates')
              .select('*', { count: 'exact', head: true })
              .eq('assigned_to', member.id)

            const { count: monthJoinings } = await supabase
              .from('candidates')
              .select('*', { count: 'exact', head: true })
              .eq('assigned_to', member.id)
              .eq('current_stage', 'joined')
              .gte('date_joined', firstDayOfMonth)

            const { count: pipelineCount } = await supabase
              .from('candidates')
              .select('*', { count: 'exact', head: true })
              .eq('assigned_to', member.id)
              .in('current_stage', ['screening', 'interview_scheduled', 'interview_completed', 'offer_extended', 'offer_accepted'])

            // Get user details
            const { data: userData } = await supabase
              .from('users')
              .select('full_name, role')
              .eq('id', member.id)
              .single()

            return {
              user_id: member.id,
              user_name: userData?.full_name || 'Unknown',
              role: userData?.role || member.role,
              candidates_count: candidatesCount || 0,
              this_month_joinings: monthJoinings || 0,
              pipeline_count: pipelineCount || 0,
            }
          })
        )

        setMemberPerformance(performanceData.filter(p => p.candidates_count > 0))
      }

    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const getPerformanceBadge = (joinings: number) => {
    if (joinings >= 5) return { text: 'Top Performer', color: 'bg-green-100 text-green-800', icon: '★' }
    if (joinings >= 2) return { text: 'Good', color: 'bg-blue-100 text-blue-800', icon: '✓' }
    if (joinings >= 1) return { text: 'Active', color: 'bg-yellow-100 text-yellow-800', icon: '•' }
    return { text: 'Starting', color: 'bg-gray-100 text-gray-800', icon: '○' }
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
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
          <h1 className="text-3xl font-bold mb-2">
            Welcome, {user?.full_name}
          </h1>
          <p className="text-blue-100">Sr. Team Leader Dashboard - Manage Your Team</p>
        </div>

        {/* Team Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="card bg-white hover:shadow-lg transition">
            <div className="text-sm text-gray-600 mb-1">Team Leaders</div>
            <div className="text-3xl font-bold text-gray-900">{teamStats.total_tls || 0}</div>
          </div>

          <div className="card bg-white hover:shadow-lg transition">
            <div className="text-sm text-gray-600 mb-1">Recruiters</div>
            <div className="text-3xl font-bold text-gray-900">{teamStats.total_recruiters || 0}</div>
          </div>

          <div className="card bg-white hover:shadow-lg transition">
            <div className="text-sm text-gray-600 mb-1">Total Candidates</div>
            <div className="text-3xl font-bold text-blue-600">{teamStats.total_candidates || 0}</div>
          </div>

          <div className="card bg-green-50 hover:shadow-lg transition border-2 border-green-200">
            <div className="text-sm text-green-700 mb-1 font-semibold">This Month Joinings</div>
            <div className="text-3xl font-bold text-green-600">{teamStats.month_joinings || 0}</div>
          </div>

          <div className="card bg-white hover:shadow-lg transition">
            <div className="text-sm text-gray-600 mb-1">Active Jobs</div>
            <div className="text-3xl font-bold text-orange-600">{teamStats.active_jobs || 0}</div>
            <div className="text-xs text-gray-500 mt-1">of {teamStats.total_jobs || 0} total</div>
          </div>

          <div className="card bg-white hover:shadow-lg transition">
            <div className="text-sm text-gray-600 mb-1">Team Size</div>
            <div className="text-3xl font-bold text-purple-600">{teamStats.total_team_members || 0}</div>
          </div>
        </div>

        {/* Team Performance */}
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Team Member Performance</h3>
              <p className="text-sm text-gray-600">Track individual contributions and results</p>
            </div>
            <button
              onClick={() => router.push('/sr-tl/team-leaders')}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              View All Team Leaders →
            </button>
          </div>
          
          {memberPerformance.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-lg">
              <p className="text-gray-900 text-xl font-semibold mb-2">No performance data available yet</p>
              <p className="text-sm text-gray-600 mb-8 max-w-md mx-auto">
                Performance metrics will appear once team members start adding candidates to jobs
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
                  className="bg-white border-2 border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50 font-medium transition"
                >
                  View Jobs
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th className="text-center">Total Candidates</th>
                      <th className="text-center">Month Joinings</th>
                      <th className="text-center">Active Pipeline</th>
                      <th>Performance</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberPerformance.map(member => {
                      const badge = getPerformanceBadge(member.this_month_joinings)
                      return (
                        <tr key={member.user_id} className="hover:bg-gray-50">
                          <td className="font-medium text-gray-900">{member.user_name}</td>
                          <td>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              member.role === 'team_leader' 
                                ? 'bg-blue-100 text-blue-800' 
                                : member.role === 'sr_team_leader'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {member.role === 'team_leader' ? 'Team Leader' : 
                               member.role === 'sr_team_leader' ? 'Sr. Team Leader' : 
                               'Recruiter'}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className="inline-flex items-center justify-center w-12 h-12 bg-blue-50 rounded-full">
                              <span className="font-bold text-lg text-blue-600">{member.candidates_count}</span>
                            </span>
                          </td>
                          <td className="text-center">
                            <span className="inline-flex items-center justify-center w-12 h-12 bg-green-50 rounded-full">
                              <span className="font-bold text-lg text-green-600">{member.this_month_joinings}</span>
                            </span>
                            {member.this_month_joinings >= 3 && (
                              <div className="text-xs text-green-600 mt-1 font-semibold">High</div>
                            )}
                          </td>
                          <td className="text-center">
                            <span className="inline-flex items-center justify-center w-12 h-12 bg-orange-50 rounded-full">
                              <span className="font-bold text-lg text-orange-600">{member.pipeline_count}</span>
                            </span>
                          </td>
                          <td>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
                              {badge.icon} {badge.text}
                            </span>
                          </td>
                          <td>
                            <button
                              onClick={() => router.push(`/sr-tl/candidates?recruiter=${member.user_id}`)}
                              className="text-blue-600 hover:text-blue-900 text-sm font-medium"
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

              {/* Performance Summary */}
              <div className="mt-6 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border-2 border-blue-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Team Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-1">Team Members</div>
                    <div className="text-3xl font-bold text-gray-900">{memberPerformance.length}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-1">Total Candidates</div>
                    <div className="text-3xl font-bold text-blue-600">
                      {memberPerformance.reduce((sum, m) => sum + m.candidates_count, 0)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-1">Total Joinings</div>
                    <div className="text-3xl font-bold text-green-600">
                      {memberPerformance.reduce((sum, m) => sum + m.this_month_joinings, 0)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-1">Active Pipeline</div>
                    <div className="text-3xl font-bold text-orange-600">
                      {memberPerformance.reduce((sum, m) => sum + m.pipeline_count, 0)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => router.push('/sr-tl/candidates')}
              className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 rounded-lg text-center transition border-2 border-blue-200"
            >
              <div className="font-semibold text-blue-900 mb-1">All Candidates</div>
              <div className="text-sm text-blue-700">
                {teamStats.total_candidates || 0} total
              </div>
            </button>
            
            <button
              onClick={() => router.push('/sr-tl/jobs')}
              className="p-6 bg-gradient-to-br from-green-50 to-green-100 hover:from-green-100 hover:to-green-200 rounded-lg text-center transition border-2 border-green-200"
            >
              <div className="font-semibold text-green-900 mb-1">Manage Jobs</div>
              <div className="text-sm text-green-700">
                {teamStats.active_jobs || 0} active
              </div>
            </button>
            
            <button
              onClick={() => router.push('/sr-tl/team-leaders')}
              className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 rounded-lg text-center transition border-2 border-purple-200"
            >
              <div className="font-semibold text-purple-900 mb-1">Team Leaders</div>
              <div className="text-sm text-purple-700">
                {teamStats.total_tls || 0} leaders
              </div>
            </button>
            
            <button
              onClick={() => router.push('/sr-tl/offers')}
              className="p-6 bg-gradient-to-br from-orange-50 to-orange-100 hover:from-orange-100 hover:to-orange-200 rounded-lg text-center transition border-2 border-orange-200"
            >
              <div className="font-semibold text-orange-900 mb-1">Offers</div>
              <div className="text-sm text-orange-700">View & track</div>
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}