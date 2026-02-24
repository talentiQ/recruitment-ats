// app/management/dashboard/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

interface DashboardStats {
  totalRevenueEarned: number
  expectedRevenue: number
  totalJoinings: number
  avgTimeToHire: number
  topClient: { name: string; joinings: number; revenue: number } | null
  topRecruiter: { name: string; joinings: number; revenue: number } | null
  fastestRecruiter: { name: string; days: number; joinings: number } | null
}

interface TeamPerformance {
  teamName: string
  joinings: number
  revenueEarned: number
  expectedRevenue: number
  pipeline: number
  successRate: number
  avgTime: number
}

interface ClientPerformance {
  clientName: string
  joinings: number
  revenue: number
  avgCTC: number
  successRate: number
  activeJobs: number
}

interface PipelineStage {
  stage: string
  count: number
  percentage: number
}

export default function ManagementDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState('month') // month, quarter, year
  const [selectedTeam, setSelectedTeam] = useState('all')
  
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenueEarned: 0,
    expectedRevenue: 0,
    totalJoinings: 0,
    avgTimeToHire: 0,
    topClient: null,
    topRecruiter: null,
    fastestRecruiter: null,
  })
  
  const [teamPerformance, setTeamPerformance] = useState<TeamPerformance[]>([])
  const [clientPerformance, setClientPerformance] = useState<ClientPerformance[]>([])
  const [pipelineData, setPipelineData] = useState<PipelineStage[]>([])
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      
      // Check if user is management role
      if (!['ceo', 'ops_head', 'finance_head', 'system_admin'].includes(parsedUser.role)) {
        alert('Access denied. Management only.')
        router.push('/')
        return
      }
      
      loadDashboardData(parsedUser)
    }
  }, [selectedPeriod, selectedTeam])

  const loadDashboardData = async (user: any) => {
    setLoading(true)
    try {
      await Promise.all([
        loadMainStats(),
        loadTeamPerformance(),
        loadClientPerformance(),
        loadPipelineData(),
        loadMonthlyTrend(),
      ])
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const getDateRange = () => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    if (selectedPeriod === 'month') {
      // Current month
      return {
        start: new Date(currentYear, currentMonth, 1).toISOString(),
        end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString(),
        label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      }
    } else if (selectedPeriod === 'quarter') {
      // Current business quarter
      let quarterStart, quarterEnd
      if (currentMonth >= 3 && currentMonth <= 5) {
        // Q1: Apr-Jun
        quarterStart = new Date(currentYear, 3, 1)
        quarterEnd = new Date(currentYear, 5, 30, 23, 59, 59)
      } else if (currentMonth >= 6 && currentMonth <= 8) {
        // Q2: Jul-Sep
        quarterStart = new Date(currentYear, 6, 1)
        quarterEnd = new Date(currentYear, 8, 30, 23, 59, 59)
      } else if (currentMonth >= 9 && currentMonth <= 11) {
        // Q3: Oct-Dec
        quarterStart = new Date(currentYear, 9, 1)
        quarterEnd = new Date(currentYear, 11, 31, 23, 59, 59)
      } else {
        // Q4: Jan-Mar
        quarterStart = new Date(currentYear, 0, 1)
        quarterEnd = new Date(currentYear, 2, 31, 23, 59, 59)
      }
      return {
        start: quarterStart.toISOString(),
        end: quarterEnd.toISOString(),
        label: `Quarter ${Math.floor(currentMonth / 3) + 1}`
      }
    } else {
      // Business year (Apr-Mar)
      const fiscalStartYear = currentMonth >= 3 ? currentYear : currentYear - 1
      return {
        start: new Date(fiscalStartYear, 3, 1).toISOString(),
        end: new Date(fiscalStartYear + 1, 2, 31, 23, 59, 59).toISOString(),
        label: `FY ${fiscalStartYear}-${fiscalStartYear + 1}`
      }
    }
  }

  const loadMainStats = async () => {
    const { start, end } = getDateRange()

    // Total Revenue Earned (candidates who joined)
    let revenueQuery = supabase
      .from('candidates')
      .select('revenue_earned, date_joined, job_id')
      .eq('current_stage', 'joined')
      .gte('date_joined', start)
      .lte('date_joined', end)

    if (selectedTeam !== 'all') {
      revenueQuery = revenueQuery.eq('team_id', selectedTeam)
    }

    const { data: revenueData, error: revenueError } = await revenueQuery

    if (revenueError) {
      console.error('Revenue query error:', revenueError)
    }

    const totalRevenue = revenueData?.reduce((sum, c) => {
      // revenue_earned is stored in lakhs, convert to actual INR
      return sum + ((parseFloat(c.revenue_earned) || 0) * 100000)
    }, 0) || 0
    const totalJoinings = revenueData?.length || 0

    // Expected Revenue (offers accepted but not yet joined)
    let expectedQuery = supabase
      .from('offers')
      .select(`
        billable_ctc,
        revenue_percentage,
        candidate_id,
        candidates!inner(current_stage, team_id)
      `)
      .eq('status', 'accepted')
      .eq('candidates.current_stage', 'offer_accepted')

    if (selectedTeam !== 'all') {
      expectedQuery = expectedQuery.eq('candidates.team_id', selectedTeam)
    }

    const { data: expectedData } = await expectedQuery

    const expectedRevenue = expectedData?.reduce((sum, o) => {
      const revenue = (parseFloat(o.billable_ctc) * parseFloat(o.revenue_percentage)) / 100
      return sum + revenue // Keep in actual INR
    }, 0) || 0

    // Average Time to Hire (date_sourced to date_joined)
    const avgTimeQuery = supabase
      .from('candidates')
      .select('date_sourced, date_joined')
      .eq('current_stage', 'joined')
      .gte('date_joined', start)
      .lte('date_joined', end)
      .not('date_sourced', 'is', null)
      .not('date_joined', 'is', null)

    const { data: timeData } = await avgTimeQuery

    let avgDays = 0
    if (timeData && timeData.length > 0) {
      const totalDays = timeData.reduce((sum, c) => {
        const sourced = new Date(c.date_sourced)
        const joined = new Date(c.date_joined)
        const days = Math.floor((joined.getTime() - sourced.getTime()) / (1000 * 60 * 60 * 24))
        return sum + days
      }, 0)
      avgDays = Math.round(totalDays / timeData.length)
    }

    // Top Client (by revenue)
    const { data: topClientData } = await supabase
      .from('candidates')
      .select(`
        revenue_earned,
        job_id,
        jobs!inner(client_id, clients!inner(company_name))
      `)
      .eq('current_stage', 'joined')
      .gte('date_joined', start)
      .lte('date_joined', end)

    const clientRevenue: Record<string, { name: string; revenue: number; count: number }> = {}
    topClientData?.forEach((c: any) => {
      const clientName = c.jobs.clients.company_name
      if (!clientRevenue[clientName]) {
        clientRevenue[clientName] = { name: clientName, revenue: 0, count: 0 }
      }
      // revenue_earned is in lakhs, convert to actual INR
      clientRevenue[clientName].revenue += (parseFloat(c.revenue_earned) || 0) * 100000
      clientRevenue[clientName].count += 1
    })

    const topClient = Object.values(clientRevenue).sort((a, b) => b.revenue - a.revenue)[0] || null

    // Top Recruiter (by revenue)
    const { data: topRecruiterData } = await supabase
      .from('candidates')
      .select(`
        revenue_earned,
        assigned_to,
        users!inner(full_name)
      `)
      .eq('current_stage', 'joined')
      .gte('date_joined', start)
      .lte('date_joined', end)

    const recruiterRevenue: Record<string, { name: string; revenue: number; count: number }> = {}
    topRecruiterData?.forEach((c: any) => {
      const recruiterName = c.users.full_name
      const recruiterId = c.assigned_to
      if (!recruiterRevenue[recruiterId]) {
        recruiterRevenue[recruiterId] = { name: recruiterName, revenue: 0, count: 0 }
      }
      // revenue_earned is in lakhs, convert to actual INR
      recruiterRevenue[recruiterId].revenue += (parseFloat(c.revenue_earned) || 0) * 100000
      recruiterRevenue[recruiterId].count += 1
    })

    const topRecruiter = Object.values(recruiterRevenue).sort((a, b) => b.revenue - a.revenue)[0] || null

    // Fastest Recruiter (lowest avg time)
    const { data: recruiterTimeData } = await supabase
      .from('candidates')
      .select(`
        date_sourced,
        date_joined,
        assigned_to,
        users!inner(full_name)
      `)
      .eq('current_stage', 'joined')
      .gte('date_joined', start)
      .lte('date_joined', end)
      .not('date_sourced', 'is', null)
      .not('date_joined', 'is', null)

    const recruiterTimes: Record<string, { name: string; totalDays: number; count: number }> = {}
    recruiterTimeData?.forEach((c: any) => {
      const recruiterId = c.assigned_to
      const recruiterName = c.users.full_name
      const sourced = new Date(c.date_sourced)
      const joined = new Date(c.date_joined)
      const days = Math.floor((joined.getTime() - sourced.getTime()) / (1000 * 60 * 60 * 24))

      if (!recruiterTimes[recruiterId]) {
        recruiterTimes[recruiterId] = { name: recruiterName, totalDays: 0, count: 0 }
      }
      recruiterTimes[recruiterId].totalDays += days
      recruiterTimes[recruiterId].count += 1
    })

    const fastestRecruiter = Object.values(recruiterTimes)
      .map(r => ({ name: r.name, days: Math.round(r.totalDays / r.count), joinings: r.count }))
      .sort((a, b) => a.days - b.days)[0] || null

    setStats({
      totalRevenueEarned: totalRevenue,
      expectedRevenue,
      totalJoinings,
      avgTimeToHire: avgDays,
      topClient: topClient ? { name: topClient.name, joinings: topClient.count, revenue: topClient.revenue } : null,
      topRecruiter: topRecruiter ? { name: topRecruiter.name, joinings: topRecruiter.count, revenue: topRecruiter.revenue } : null,
      fastestRecruiter,
    })
  }

  const loadTeamPerformance = async () => {
    const { start, end } = getDateRange()

    // Get all teams with their performance
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name')
      .eq('is_active', true)

    if (!teams) return

    const teamPerf: TeamPerformance[] = await Promise.all(
      teams.map(async (team) => {
        // Joinings and revenue
        const { data: joinedCandidates } = await supabase
          .from('candidates')
          .select('revenue_earned, date_sourced, date_joined')
          .eq('team_id', team.id)
          .eq('current_stage', 'joined')
          .gte('date_joined', start)
          .lte('date_joined', end)

        const joinings = joinedCandidates?.length || 0
        // revenue_earned is in lakhs, convert to actual INR
        const revenue = joinedCandidates?.reduce((sum, c) => sum + ((parseFloat(c.revenue_earned) || 0) * 100000), 0) || 0

        // Expected revenue
        const { data: expectedOffers } = await supabase
          .from('offers')
          .select(`
            billable_ctc,
            revenue_percentage,
            candidate_id,
            candidates!inner(team_id)
          `)
          .eq('status', 'accepted')
          .eq('candidates.team_id', team.id)

        const expectedRev = expectedOffers?.reduce((sum, o) => {
          // Keep in actual INR (no lakhs conversion)
          return sum + ((parseFloat(o.billable_ctc) * parseFloat(o.revenue_percentage)) / 100)
        }, 0) || 0

        // Pipeline count
        const { count: pipelineCount } = await supabase
          .from('candidates')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', team.id)
          .in('current_stage', ['screening', 'interview_scheduled', 'interview_completed', 'offer_extended', 'offer_accepted'])

        // Success rate (joined / total sourced)
        const { count: totalSourced } = await supabase
          .from('candidates')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', team.id)
          .gte('date_sourced', start)
          .lte('date_sourced', end)

        const successRate = totalSourced ? Math.round((joinings / totalSourced) * 100) : 0

        // Avg time to hire
        let avgTime = 0
        if (joinedCandidates && joinedCandidates.length > 0) {
          const totalDays = joinedCandidates.reduce((sum, c) => {
            if (c.date_sourced && c.date_joined) {
              const sourced = new Date(c.date_sourced)
              const joined = new Date(c.date_joined)
              return sum + Math.floor((joined.getTime() - sourced.getTime()) / (1000 * 60 * 60 * 24))
            }
            return sum
          }, 0)
          avgTime = Math.round(totalDays / joinedCandidates.length)
        }

        return {
          teamName: team.name,
          joinings,
          revenueEarned: revenue,
          expectedRevenue: expectedRev,
          pipeline: pipelineCount || 0,
          successRate,
          avgTime,
        }
      })
    )

    setTeamPerformance(teamPerf.sort((a, b) => b.revenueEarned - a.revenueEarned))
  }

  const loadClientPerformance = async () => {
    const { start, end } = getDateRange()

    const { data: clientData } = await supabase
      .from('candidates')
      .select(`
        revenue_earned,
        offered_fixed,
        job_id,
        jobs!inner(client_id, clients!inner(company_name, id))
      `)
      .eq('current_stage', 'joined')
      .gte('date_joined', start)
      .lte('date_joined', end)

    const clientMetrics: Record<string, {
      name: string
      revenue: number
      joinings: number
      totalCTC: number
      clientId: string
    }> = {}

    clientData?.forEach((c: any) => {
      const clientId = c.jobs.clients.id
      const clientName = c.jobs.clients.company_name
      if (!clientMetrics[clientId]) {
        clientMetrics[clientId] = {
          name: clientName,
          revenue: 0,
          joinings: 0,
          totalCTC: 0,
          clientId,
        }
      }
      // revenue_earned is in lakhs, convert to actual INR
      clientMetrics[clientId].revenue += (parseFloat(c.revenue_earned) || 0) * 100000
      clientMetrics[clientId].joinings += 1
      clientMetrics[clientId].totalCTC += parseFloat(c.offered_fixed) || 0
    })

    // Get active jobs per client
    const clientPerf: ClientPerformance[] = await Promise.all(
      Object.values(clientMetrics).map(async (client) => {
        const { count: activeJobs } = await supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', client.clientId)
          .eq('status', 'open')

        const { count: totalCandidates } = await supabase
          .from('candidates')
          .select('*', { count: 'exact', head: true })
          .eq('jobs.client_id', client.clientId)

        const successRate = totalCandidates ? Math.round((client.joinings / totalCandidates) * 100) : 0

        return {
          clientName: client.name,
          joinings: client.joinings,
          revenue: client.revenue,
          avgCTC: client.joinings > 0 ? client.totalCTC / client.joinings : 0, // Actual INR
          successRate,
          activeJobs: activeJobs || 0,
        }
      })
    )

    setClientPerformance(clientPerf.sort((a, b) => b.revenue - a.revenue).slice(0, 10))
  }

  const loadPipelineData = async () => {
    const stages = [
      { key: 'sourced', label: 'Sourced' },
      { key: 'screening', label: 'Screening' },
      { key: 'interview_scheduled', label: 'Interview Scheduled' },
      { key: 'interview_completed', label: 'Interview Completed' },
      { key: 'offer_extended', label: 'Offer Extended' },
      { key: 'offer_accepted', label: 'Offer Accepted' },
      { key: 'joined', label: 'Joined' },
    ]

    const pipelinePromises = stages.map(async (stage) => {
      const { count } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('current_stage', stage.key)

      return {
        stage: stage.label,
        count: count || 0,
        percentage: 0, // Will calculate after getting totals
      }
    })

    const results = await Promise.all(pipelinePromises)
    const total = results.reduce((sum, r) => sum + r.count, 0)

    const pipelineWithPercentage = results.map(r => ({
      ...r,
      percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
    }))

    setPipelineData(pipelineWithPercentage)
  }

  const loadMonthlyTrend = async () => {
    // Get last 3 months revenue trend
    const months = []
    const now = new Date()

    for (let i = 2; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).toISOString()
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59).toISOString()

      const { data } = await supabase
        .from('candidates')
        .select('revenue_earned')
        .eq('current_stage', 'joined')
        .gte('date_joined', monthStart)
        .lte('date_joined', monthEnd)

      // revenue_earned is in lakhs, convert to actual INR
      const revenue = data?.reduce((sum, c) => sum + ((parseFloat(c.revenue_earned) || 0) * 100000), 0) || 0

      months.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        revenue: revenue,
      })
    }

    setMonthlyTrend(months)
  }

  const formatCurrency = (amount: number) => {
    // Format as Indian numbering system with commas
    return `Rs. ${amount.toLocaleString('en-IN', { 
      maximumFractionDigits: 0,
      minimumFractionDigits: 0 
    })}`
  }

  const formatPercentage = (value: number) => {
    const color = value >= 100 ? 'text-green-600' : value >= 75 ? 'text-blue-600' : value >= 60 ? 'text-yellow-600' : 'text-red-600'
    return <span className={`font-bold ${color}`}>{value}%</span>
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
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Management Dashboard</h1>
          <p className="text-blue-100">Data-driven insights for strategic decision making</p>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-lg p-4 shadow flex justify-between items-center">
          <div className="flex gap-4">
            <button
              onClick={() => setSelectedPeriod('month')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedPeriod === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setSelectedPeriod('quarter')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedPeriod === 'quarter'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              This Quarter
            </button>
            <button
              onClick={() => setSelectedPeriod('year')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedPeriod === 'year'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              This Year
            </button>
          </div>
          <button className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium">
            Export Report
          </button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg p-6 shadow">
            <div className="text-sm text-gray-600 mb-2 font-semibold uppercase">Revenue Earned</div>
            <div className="text-3xl font-bold text-gray-900">{formatCurrency(stats.totalRevenueEarned)}</div>
            <div className="text-sm text-green-600 mt-2">From {stats.totalJoinings} joinings</div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow">
            <div className="text-sm text-gray-600 mb-2 font-semibold uppercase">Expected Revenue</div>
            <div className="text-3xl font-bold text-gray-900">{formatCurrency(stats.expectedRevenue)}</div>
            <div className="text-sm text-blue-600 mt-2">Offers pending</div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow">
            <div className="text-sm text-gray-600 mb-2 font-semibold uppercase">Total Joinings</div>
            <div className="text-3xl font-bold text-gray-900">{stats.totalJoinings}</div>
            <div className="text-sm text-gray-500 mt-2">Candidates placed</div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow">
            <div className="text-sm text-gray-600 mb-2 font-semibold uppercase">Avg Time-to-Hire</div>
            <div className="text-3xl font-bold text-gray-900">{stats.avgTimeToHire} Days</div>
            <div className="text-sm text-gray-500 mt-2">Industry avg: 45 days</div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Trend */}
          <div className="bg-white rounded-lg p-6 shadow">
            <h3 className="text-lg font-bold mb-4">Monthly Revenue Trend</h3>
            <div className="flex items-end justify-around h-48">
              {monthlyTrend.map((month, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2">
                  <div
                    className="w-16 bg-gradient-to-t from-blue-600 to-purple-600 rounded-t-lg"
                    style={{ height: `${(month.revenue / Math.max(...monthlyTrend.map(m => m.revenue), 1)) * 100}%` }}
                  ></div>
                  <span className="text-xs font-medium text-gray-600">{month.month}</span>
                  <span className="text-xs font-bold">{formatCurrency(month.revenue)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Performers */}
          <div className="bg-white rounded-lg p-6 shadow">
            <h3 className="text-lg font-bold mb-4">Top Performers</h3>
            <div className="space-y-4">
              {stats.topClient && (
                <div className="border-l-4 border-blue-500 pl-4">
                  <div className="text-sm text-gray-600">Top Client</div>
                  <div className="font-bold text-lg">{stats.topClient.name}</div>
                  <div className="text-sm text-gray-500">
                    {stats.topClient.joinings} joinings • {formatCurrency(stats.topClient.revenue)}
                  </div>
                </div>
              )}

              {stats.topRecruiter && (
                <div className="border-l-4 border-green-500 pl-4">
                  <div className="text-sm text-gray-600">Top Recruiter</div>
                  <div className="font-bold text-lg">{stats.topRecruiter.name}</div>
                  <div className="text-sm text-gray-500">
                    {stats.topRecruiter.joinings} joinings • {formatCurrency(stats.topRecruiter.revenue)}
                  </div>
                </div>
              )}

              {stats.fastestRecruiter && (
                <div className="border-l-4 border-orange-500 pl-4">
                  <div className="text-sm text-gray-600">Fastest Closure</div>
                  <div className="font-bold text-lg">{stats.fastestRecruiter.name}</div>
                  <div className="text-sm text-gray-500">
                    {stats.fastestRecruiter.days} days avg • {stats.fastestRecruiter.joinings} joinings
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Team Performance Table */}
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-lg font-bold mb-4">Team Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Team</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Joinings</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Revenue</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Expected</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Pipeline</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Success Rate</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Avg Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {teamPerformance.map((team, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{team.teamName}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                        {team.joinings}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{formatCurrency(team.revenueEarned)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(team.expectedRevenue)}</td>
                    <td className="px-4 py-3 text-center">{team.pipeline}</td>
                    <td className="px-4 py-3 text-center">{formatPercentage(team.successRate)}</td>
                    <td className="px-4 py-3 text-center">{team.avgTime} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Client Performance */}
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-lg font-bold mb-4">Top Clients by Revenue</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Joinings</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Revenue</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Avg CTC</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Success Rate</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Active Jobs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {clientPerformance.slice(0, 10).map((client, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{client.clientName}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                        {client.joinings}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{formatCurrency(client.revenue)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(client.avgCTC)}</td>
                    <td className="px-4 py-3 text-center">{formatPercentage(client.successRate)}</td>
                    <td className="px-4 py-3 text-center">{client.activeJobs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pipeline Funnel */}
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-lg font-bold mb-4">Candidate Pipeline</h3>
          <div className="space-y-3">
            {pipelineData.map((stage, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="w-32 text-sm font-medium text-gray-700">{stage.stage}</div>
                <div className="flex-1">
                  <div className="relative h-10 bg-gray-100 rounded-lg overflow-hidden">
                    <div
                      className="absolute h-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center px-4 text-white font-semibold text-sm"
                      style={{ width: `${Math.max(stage.percentage, 10)}%` }}
                    >
                      {stage.count} ({stage.percentage}%)
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
