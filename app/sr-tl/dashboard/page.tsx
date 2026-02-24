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
      // CORRECT: Get direct reports only (who report to this Sr.TL)
      // This includes TLs who report directly + Recruiters who report directly
      const { data: directReports, error: reportsError } = await supabase
        .from('users')
        .select('id, role, team_id, full_name, monthly_target, quarterly_target, annual_target')
        .eq('reports_to', user.id)  // ✅ ONLY direct reports
        .eq('is_active', true)

      if (reportsError) {
        console.error('Direct reports error:', reportsError)
      }

      console.log('Direct reports to Sr.TL:', directReports)

      // Also get recruiters who report to TLs under this Sr.TL
      const tlIds = directReports?.filter((m: any) => m.role === 'team_leader').map((m: any) => m.id) || []
      
      let indirectRecruiters: any[] = []
      if (tlIds.length > 0) {
        const { data: recruiterReports, error: recError } = await supabase
          .from('users')
          .select('id, role, team_id, full_name, monthly_target, quarterly_target, annual_target')
          .in('reports_to', tlIds)  // Recruiters reporting to TLs
          .eq('role', 'recruiter')
          .eq('is_active', true)
        
        if (recError) {
          console.error('Indirect recruiters error:', recError)
        } else {
          indirectRecruiters = recruiterReports || []
        }
      }

      // Combine direct reports + indirect recruiters
      const allTeamMembers = [...(directReports || []), ...indirectRecruiters]

      console.log('Total team members under Sr.TL:', allTeamMembers.length)

      const totalTLs = allTeamMembers.filter((m: any) => m.role === 'team_leader').length
      const totalRecruiters = allTeamMembers.filter((m: any) => m.role === 'recruiter').length

      // Get candidates for this Sr.TL's team
      const memberIds = allTeamMembers.map((m: any) => m.id)
      
      const { count: candidatesCount } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .in('assigned_to', memberIds)

      // Get this month joinings for this team
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const { count: monthJoinings } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .in('assigned_to', memberIds)
        .eq('current_stage', 'joined')
        .gte('date_joined', firstDayOfMonth)

      // Get jobs for this team
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
        total_team_members: allTeamMembers.length,
        total_candidates: candidatesCount || 0,
        month_joinings: monthJoinings || 0,
        total_jobs: totalJobs || 0,
        active_jobs: activeJobs || 0,
      })

      // Get member performance for team members only
      if (allTeamMembers.length > 0) {
        // Calculate date ranges for revenue
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() + 1
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

        // Business quarter
        let businessQuarter: number
        if (currentMonth >= 4 && currentMonth <= 6) businessQuarter = 1
        else if (currentMonth >= 7 && currentMonth <= 9) businessQuarter = 2
        else if (currentMonth >= 10 && currentMonth <= 12) businessQuarter = 3
        else businessQuarter = 4

        let quarterStartMonth: number, quarterEndMonth: number
        let quarterStartYear: number, quarterEndYear: number

        if (businessQuarter === 1) {
          quarterStartMonth = 4; quarterEndMonth = 7
          quarterStartYear = currentYear; quarterEndYear = currentYear
        } else if (businessQuarter === 2) {
          quarterStartMonth = 7; quarterEndMonth = 10
          quarterStartYear = currentYear; quarterEndYear = currentYear
        } else if (businessQuarter === 3) {
          quarterStartMonth = 10; quarterEndMonth = 1
          quarterStartYear = currentYear; quarterEndYear = currentYear + 1
        } else {
          quarterStartMonth = 1; quarterEndMonth = 4
          quarterStartYear = currentYear; quarterEndYear = currentYear
        }

        const quarterStart = `${quarterStartYear}-${String(quarterStartMonth).padStart(2, '0')}-01`
        const quarterEnd = `${quarterEndYear}-${String(quarterEndMonth).padStart(2, '0')}-01`

        // Fiscal year
        const fiscalYearStart = currentMonth >= 4 ? currentYear : currentYear - 1
        const annualStart = `${fiscalYearStart}-04-01`
        const annualEnd = `${fiscalYearStart + 1}-04-01`

        const performanceData = await Promise.all(
          allTeamMembers.map(async (member: any) => {
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

            // Get revenue data
            const { data: monthlyRevData } = await supabase
              .from('candidates')
              .select('revenue_earned')
              .eq('assigned_to', member.id)
              .eq('current_stage', 'joined')
              .gte('date_joined', monthStart)

            const { data: quarterlyRevData } = await supabase
              .from('candidates')
              .select('revenue_earned')
              .eq('assigned_to', member.id)
              .eq('current_stage', 'joined')
              .gte('date_joined', quarterStart)
              .lt('date_joined', quarterEnd)

            const { data: annualRevData } = await supabase
              .from('candidates')
              .select('revenue_earned')
              .eq('assigned_to', member.id)
              .eq('current_stage', 'joined')
              .gte('date_joined', annualStart)
              .lt('date_joined', annualEnd)

            const monthlyRevenue = monthlyRevData?.reduce((sum, c) => sum + (c.revenue_earned || 0), 0) || 0
            const quarterlyRevenue = quarterlyRevData?.reduce((sum, c) => sum + (c.revenue_earned || 0), 0) || 0
            const annualRevenue = annualRevData?.reduce((sum, c) => sum + (c.revenue_earned || 0), 0) || 0

            // Get targets from users table
            const monthlyTarget = member.monthly_target ? Number(member.monthly_target) / 100000 : 
                                (member.role === 'team_leader' ? 5 : 2)
            const quarterlyTarget = member.quarterly_target ? Number(member.quarterly_target) / 100000 : 
                                   (monthlyTarget * 3)
            const annualTarget = member.annual_target ? Number(member.annual_target) / 100000 : 
                                (monthlyTarget * 12)

            return {
              user_id: member.id,
              user_name: member.full_name,
              role: member.role,
              candidates_count: candidatesCount || 0,
              this_month_joinings: monthJoinings || 0,
              pipeline_count: pipelineCount || 0,
              monthly_revenue: monthlyRevenue,
              quarterly_revenue: quarterlyRevenue,
              annual_revenue: annualRevenue,
              monthly_target: monthlyTarget,
              quarterly_target: quarterlyTarget,
              annual_target: annualTarget,
              monthly_achievement: monthlyTarget > 0 ? Math.round((monthlyRevenue / monthlyTarget) * 100) : 0,
              quarterly_achievement: quarterlyTarget > 0 ? Math.round((quarterlyRevenue / quarterlyTarget) * 100) : 0,
              annual_achievement: annualTarget > 0 ? Math.round((annualRevenue / annualTarget) * 100) : 0,
            }
          })
        )

        setMemberPerformance(performanceData)
      }

    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatRevenue = (amount: number) => {
    return `₹${(amount * 100000).toLocaleString('en-IN')}`
  }

  const getPerformanceBadge = (joinings: number) => {
    if (joinings >= 5) return { text: 'Top Performer', color: 'bg-green-100 text-green-800', icon: 'S' }
    if (joinings >= 2) return { text: 'Good', color: 'bg-blue-100 text-blue-800', icon: 'G' }
    if (joinings >= 1) return { text: 'Active', color: 'bg-yellow-100 text-yellow-800', icon: 'A' }
    return { text: 'Starting', color: 'bg-gray-100 text-gray-800', icon: '-' }
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

  // Calculate team totals
  const teamMonthlyTarget = memberPerformance.reduce((sum, m) => sum + m.monthly_target, 0)
  const teamMonthlyRevenue = memberPerformance.reduce((sum, m) => sum + m.monthly_revenue, 0)
  const teamQuarterlyTarget = memberPerformance.reduce((sum, m) => sum + m.quarterly_target, 0)
  const teamQuarterlyRevenue = memberPerformance.reduce((sum, m) => sum + m.quarterly_revenue, 0)
  const teamAnnualTarget = memberPerformance.reduce((sum, m) => sum + m.annual_target, 0)
  const teamAnnualRevenue = memberPerformance.reduce((sum, m) => sum + m.annual_revenue, 0)

  const teamMonthlyAchievement = teamMonthlyTarget > 0 ? Math.round((teamMonthlyRevenue / teamMonthlyTarget) * 100) : 0
  const teamQuarterlyAchievement = teamQuarterlyTarget > 0 ? Math.round((teamQuarterlyRevenue / teamQuarterlyTarget) * 100) : 0
  const teamAnnualAchievement = teamAnnualTarget > 0 ? Math.round((teamAnnualRevenue / teamAnnualTarget) * 100) : 0

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Welcome Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
          <h1 className="text-3xl font-bold mb-2">
            Welcome, {user?.full_name}
          </h1>
          <p className="text-blue-100">Senior Leader Dashboard - Your Team Performance</p>
        </div>

        {/* Team Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="card bg-white hover:shadow-lg transition">
            <div className="text-sm text-gray-600 mb-1">TEAM LEADERS</div>
            <div className="text-3xl font-bold text-gray-900">{teamStats.total_tls || 0}</div>
          </div>

          <div className="card bg-white hover:shadow-lg transition">
            <div className="text-sm text-gray-600 mb-1">RECRUITERS</div>
            <div className="text-3xl font-bold text-gray-900">{teamStats.total_recruiters || 0}</div>
          </div>

          <div className="card bg-white hover:shadow-lg transition">
            <div className="text-sm text-gray-600 mb-1">Total Candidates</div>
            <div className="text-3xl font-bold text-blue-600">{teamStats.total_candidates || 0}</div>
          </div>

          <div className="card bg-green-50 hover:shadow-lg transition border-2 border-green-200">
            <div className="text-sm text-green-700 mb-1 font-semibold">THIS MONTH JOININGS</div>
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

        {/* Team Members Target vs Achievement */}
        {memberPerformance.length > 0 && (
          <div className="card">
            <h3 className="text-xl font-bold text-gray-900 mb-6">📊 Team Members Target vs Achievement</h3>
            
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th className="text-center">Role</th>
                    <th className="text-center">Monthly Target</th>
                    <th className="text-center">Monthly Revenue</th>
                    <th className="text-center">Achievement</th>
                    <th className="text-center">Quarterly Target</th>
                    <th className="text-center">Quarterly Revenue</th>
                    <th className="text-center">Achievement</th>
                    <th className="text-center">Annual Target</th>
                    <th className="text-center">Annual Revenue</th>
                    <th className="text-center">Achievement</th>
                  </tr>
                </thead>
                <tbody>
                  {memberPerformance.map(member => (
                    <tr key={member.user_id}>
                      <td className="font-medium">{member.user_name}</td>
                      <td className="text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          member.role === 'team_leader' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {member.role === 'team_leader' ? 'TL' : 'Recruiter'}
                        </span>
                      </td>
                      <td className="text-center font-semibold">{formatRevenue(member.monthly_target)}</td>
                      <td className="text-center text-blue-600 font-semibold">{formatRevenue(member.monthly_revenue)}</td>
                      <td className="text-center">
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                          member.monthly_achievement >= 100 ? 'bg-green-100 text-green-800' :
                          member.monthly_achievement >= 75 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {member.monthly_achievement}%
                        </span>
                      </td>
                      <td className="text-center font-semibold">{formatRevenue(member.quarterly_target)}</td>
                      <td className="text-center text-blue-600 font-semibold">{formatRevenue(member.quarterly_revenue)}</td>
                      <td className="text-center">
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                          member.quarterly_achievement >= 100 ? 'bg-green-100 text-green-800' :
                          member.quarterly_achievement >= 75 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {member.quarterly_achievement}%
                        </span>
                      </td>
                      <td className="text-center font-semibold">{formatRevenue(member.annual_target)}</td>
                      <td className="text-center text-blue-600 font-semibold">{formatRevenue(member.annual_revenue)}</td>
                      <td className="text-center">
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                          member.annual_achievement >= 100 ? 'bg-green-100 text-green-800' :
                          member.annual_achievement >= 75 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {member.annual_achievement}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Team Total Row */}
                  <tr className="bg-gradient-to-br from-blue-50 to-indigo-50 font-bold border-t-2 border-blue-300">
                    <td>TEAM TOTAL</td>
                    <td className="text-center">-</td>
                    <td className="text-center text-blue-900">{formatRevenue(teamMonthlyTarget)}</td>
                    <td className="text-center text-blue-900">{formatRevenue(teamMonthlyRevenue)}</td>
                    <td className="text-center">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        teamMonthlyAchievement >= 100 ? 'bg-green-600 text-white' :
                        teamMonthlyAchievement >= 75 ? 'bg-yellow-600 text-white' :
                        'bg-red-600 text-white'
                      }`}>
                        {teamMonthlyAchievement}%
                      </span>
                    </td>
                    <td className="text-center text-blue-900">{formatRevenue(teamQuarterlyTarget)}</td>
                    <td className="text-center text-blue-900">{formatRevenue(teamQuarterlyRevenue)}</td>
                    <td className="text-center">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        teamQuarterlyAchievement >= 100 ? 'bg-green-600 text-white' :
                        teamQuarterlyAchievement >= 75 ? 'bg-yellow-600 text-white' :
                        'bg-red-600 text-white'
                      }`}>
                        {teamQuarterlyAchievement}%
                      </span>
                    </td>
                    <td className="text-center text-blue-900">{formatRevenue(teamAnnualTarget)}</td>
                    <td className="text-center text-blue-900">{formatRevenue(teamAnnualRevenue)}</td>
                    <td className="text-center">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        teamAnnualAchievement >= 100 ? 'bg-green-600 text-white' :
                        teamAnnualAchievement >= 75 ? 'bg-yellow-600 text-white' :
                        'bg-red-600 text-white'
                      }`}>
                        {teamAnnualAchievement}%
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Team Performance */}
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Team Member Performance</h3>
              <p className="text-sm text-gray-600">Your direct team contributions and results</p>
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
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {member.role === 'team_leader' ? 'Team Leader' : 'Recruiter'}
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
