// app/management/teams/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MemberPerformance {
  user_id: string
  user_name: string
  role: 'sr_team_leader' | 'team_leader' | 'recruiter'
  reports_to_id: string
  reports_to_name: string
  team_name: string           // Sr-TL name as team identifier
  candidates_count: number
  pipeline_count: number
  this_month_joinings: number
  monthly_revenue: number
  quarterly_revenue: number
  annual_revenue: number
  monthly_target: number
  quarterly_target: number
  annual_target: number
  monthly_achievement: number
  quarterly_achievement: number
  annual_achievement: number
}

interface SrTLTeam {
  sr_tl_id: string
  sr_tl_name: string
  team_id: string
  tl_count: number
  recruiter_count: number
  total_candidates: number
  month_joinings: number
  active_jobs: number
  total_jobs: number
  members: MemberPerformance[]
  // Team-level revenue rollup
  monthly_revenue: number
  quarterly_revenue: number
  annual_revenue: number
  monthly_target: number
  quarterly_target: number
  annual_target: number
  monthly_achievement: number
  quarterly_achievement: number
  annual_achievement: number
}

export default function ManagementTeams() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [activeView, setActiveView] = useState<'teams' | 'all_members'>('teams')

  const [teams, setTeams] = useState<SrTLTeam[]>([])
  const [allMembers, setAllMembers] = useState<MemberPerformance[]>([])

  // ── Overall org stats ──────────────────────────────────────────────────────
  const [orgStats, setOrgStats] = useState({
    total_sr_tls: 0,
    total_tls: 0,
    total_recruiters: 0,
    total_candidates: 0,
    month_joinings: 0,
    active_jobs: 0,
    total_jobs: 0,
    org_monthly_revenue: 0,
    org_quarterly_revenue: 0,
    org_annual_revenue: 0,
    org_monthly_target: 0,
    org_quarterly_target: 0,
    org_annual_target: 0,
    org_monthly_achievement: 0,
    org_quarterly_achievement: 0,
    org_annual_achievement: 0,
  })

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/'); return }
    const parsedUser = JSON.parse(userData)
    if (!['ceo', 'ops_head', 'finance_head', 'system_admin'].includes(parsedUser.role)) {
      alert('Access denied. Management only.')
      router.push('/')
      return
    }
    setUser(parsedUser)
    loadAllTeams()
  }, [])

  // ── Date range helpers (fiscal year, business quarter) ─────────────────────
  // Mirrors the exact same logic from Sr-TL dashboard
  const getDateRanges = () => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    // Month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

    // Business quarter (Apr-Jun = Q1, Jul-Sep = Q2, Oct-Dec = Q3, Jan-Mar = Q4)
    let businessQuarter: number
    if (currentMonth >= 4 && currentMonth <= 6)   businessQuarter = 1
    else if (currentMonth >= 7 && currentMonth <= 9)  businessQuarter = 2
    else if (currentMonth >= 10 && currentMonth <= 12) businessQuarter = 3
    else businessQuarter = 4

    let quarterStartMonth: number, quarterEndMonth: number
    let quarterStartYear: number, quarterEndYear: number

    if (businessQuarter === 1) {
      quarterStartMonth = 4;  quarterEndMonth = 7
      quarterStartYear = currentYear; quarterEndYear = currentYear
    } else if (businessQuarter === 2) {
      quarterStartMonth = 7;  quarterEndMonth = 10
      quarterStartYear = currentYear; quarterEndYear = currentYear
    } else if (businessQuarter === 3) {
      quarterStartMonth = 10; quarterEndMonth = 1
      quarterStartYear = currentYear; quarterEndYear = currentYear + 1
    } else {
      quarterStartMonth = 1;  quarterEndMonth = 4
      quarterStartYear = currentYear; quarterEndYear = currentYear
    }

    const quarterStart = `${quarterStartYear}-${String(quarterStartMonth).padStart(2, '0')}-01`
    const quarterEnd   = `${quarterEndYear}-${String(quarterEndMonth).padStart(2, '0')}-01`

    // Fiscal year (Apr 1 to Mar 31)
    const fiscalYearStart = currentMonth >= 4 ? currentYear : currentYear - 1
    const annualStart = `${fiscalYearStart}-04-01`
    const annualEnd   = `${fiscalYearStart + 1}-04-01`

    return { monthStart, quarterStart, quarterEnd, annualStart, annualEnd }
  }

  // ── Per-member revenue calculator (identical logic to Sr-TL dashboard) ──────
  const getMemberRevenue = async (memberId: string, memberData: any) => {
    const { monthStart, quarterStart, quarterEnd, annualStart, annualEnd } = getDateRanges()

    const [monthlyRevData, quarterlyRevData, annualRevData, candidatesCount, monthJoinings, pipelineCount] =
      await Promise.all([
        supabaseAdmin.from('candidates').select('revenue_earned')
          .eq('assigned_to', memberId).eq('current_stage', 'joined')
          .gte('date_joined', monthStart),

        supabaseAdmin.from('candidates').select('revenue_earned')
          .eq('assigned_to', memberId).eq('current_stage', 'joined')
          .gte('date_joined', quarterStart).lt('date_joined', quarterEnd),

        supabaseAdmin.from('candidates').select('revenue_earned')
          .eq('assigned_to', memberId).eq('current_stage', 'joined')
          .gte('date_joined', annualStart).lt('date_joined', annualEnd),

        supabaseAdmin.from('candidates')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', memberId),

        supabaseAdmin.from('candidates')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', memberId).eq('current_stage', 'joined')
          .gte('date_joined', monthStart),

        supabaseAdmin.from('candidates')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', memberId)
          .in('current_stage', ['screening', 'interview_scheduled', 'interview_completed', 'offer_extended', 'offer_accepted']),
      ])

    const monthly_revenue   = monthlyRevData.data?.reduce((s, c) => s + (c.revenue_earned || 0), 0) || 0
    const quarterly_revenue = quarterlyRevData.data?.reduce((s, c) => s + (c.revenue_earned || 0), 0) || 0
    const annual_revenue    = annualRevData.data?.reduce((s, c) => s + (c.revenue_earned || 0), 0) || 0

    const monthly_target   = memberData.monthly_target   ? Number(memberData.monthly_target)   : (memberData.role === 'team_leader' ? 5 : 2)
    const quarterly_target = memberData.quarterly_target ? Number(memberData.quarterly_target) : monthly_target * 3
    const annual_target    = memberData.annual_target    ? Number(memberData.annual_target)    : monthly_target * 12

    return {
      candidates_count:    candidatesCount.count || 0,
      this_month_joinings: monthJoinings.count || 0,
      pipeline_count:      pipelineCount.count || 0,
      monthly_revenue, quarterly_revenue, annual_revenue,
      monthly_target, quarterly_target, annual_target,
      monthly_achievement:   monthly_target   > 0 ? Math.round((monthly_revenue   / monthly_target)   * 100) : 0,
      quarterly_achievement: quarterly_target > 0 ? Math.round((quarterly_revenue / quarterly_target) * 100) : 0,
      annual_achievement:    annual_target    > 0 ? Math.round((annual_revenue    / annual_target)    * 100) : 0,
    }
  }

  // ── Main data loader ────────────────────────────────────────────────────────
  // HIERARCHY LOGIC (management sees everything):
  //   Step 1: Get all Sr-TLs
  //   Step 2: For each Sr-TL → get their direct reports (TLs + direct recruiters)
  //   Step 3: For each TL → get their recruiters
  //   Step 4: Per member → compute revenue, targets, pipeline
  const loadAllTeams = async () => {
    setLoading(true)
    try {
      const { monthStart } = getDateRanges()

      // Step 1: All active Sr-TLs
      const { data: srTLs } = await supabaseAdmin
        .from('users')
        .select('id, full_name, team_id, monthly_target, quarterly_target, annual_target')
        .eq('role', 'sr_team_leader')
        .eq('is_active', true)
        .order('full_name')

      if (!srTLs || srTLs.length === 0) {
        setLoading(false)
        return
      }

      // Build all teams in parallel
      const teamsData = await Promise.all(
        srTLs.map(async (srTL: any) => {

          // Step 2: Direct reports to this Sr-TL (TLs + any direct recruiters)
          const { data: directReports } = await supabaseAdmin
            .from('users')
            .select('id, full_name, role, reports_to, team_id, monthly_target, quarterly_target, annual_target')
            .eq('reports_to', srTL.id)
            .eq('is_active', true)

          const tlIds = (directReports || [])
            .filter((m: any) => m.role === 'team_leader')
            .map((m: any) => m.id)

          // Step 3: Recruiters under those TLs
          let indirectRecruiters: any[] = []
          if (tlIds.length > 0) {
            const { data: recs } = await supabaseAdmin
              .from('users')
              .select('id, full_name, role, reports_to, team_id, monthly_target, quarterly_target, annual_target')
              .in('reports_to', tlIds)
              .eq('role', 'recruiter')
              .eq('is_active', true)
            indirectRecruiters = recs || []
          }

          const allMembers = [...(directReports || []), ...indirectRecruiters]
          const allMemberIds = allMembers.map((m: any) => m.id)

          // Name map for "reports to" display
          const nameMap: Record<string, string> = { [srTL.id]: srTL.full_name }
          allMembers.forEach((m: any) => { nameMap[m.id] = m.full_name })

          // Step 4: Revenue + pipeline per member (in parallel)
          const memberPerf = await Promise.all(
            allMembers.map(async (member: any) => {
              const rev = await getMemberRevenue(member.id, member)
              return {
                user_id: member.id,
                user_name: member.full_name,
                role: member.role,
                reports_to_id: member.reports_to,
                reports_to_name: nameMap[member.reports_to] || '—',
                team_name: srTL.full_name,
                ...rev,
              }
            })
          )

          // Team-level stats
          const { count: totalCandidates } = await supabaseAdmin
            .from('candidates').select('*', { count: 'exact', head: true })
            .in('assigned_to', allMemberIds.length > 0 ? allMemberIds : ['none'])

          const { count: monthJoinings } = await supabaseAdmin
            .from('candidates').select('*', { count: 'exact', head: true })
            .in('assigned_to', allMemberIds.length > 0 ? allMemberIds : ['none'])
            .eq('current_stage', 'joined')
            .gte('date_joined', monthStart)

          const { count: totalJobs } = await supabaseAdmin
            .from('jobs').select('*', { count: 'exact', head: true })
            .eq('assigned_team_id', srTL.team_id)

          const { count: activeJobs } = await supabaseAdmin
            .from('jobs').select('*', { count: 'exact', head: true })
            .eq('assigned_team_id', srTL.team_id)
            .eq('status', 'open')

          // Roll up revenue to team level
          const monthly_revenue   = memberPerf.reduce((s, m) => s + m.monthly_revenue, 0)
          const quarterly_revenue = memberPerf.reduce((s, m) => s + m.quarterly_revenue, 0)
          const annual_revenue    = memberPerf.reduce((s, m) => s + m.annual_revenue, 0)
          const monthly_target    = memberPerf.reduce((s, m) => s + m.monthly_target, 0)
          const quarterly_target  = memberPerf.reduce((s, m) => s + m.quarterly_target, 0)
          const annual_target     = memberPerf.reduce((s, m) => s + m.annual_target, 0)

          return {
            sr_tl_id:       srTL.id,
            sr_tl_name:     srTL.full_name,
            team_id:        srTL.team_id,
            tl_count:       allMembers.filter((m: any) => m.role === 'team_leader').length,
            recruiter_count: allMembers.filter((m: any) => m.role === 'recruiter').length,
            total_candidates: totalCandidates || 0,
            month_joinings:   monthJoinings || 0,
            active_jobs:      activeJobs || 0,
            total_jobs:       totalJobs || 0,
            members: memberPerf.sort((a, b) => {
              if (a.role === b.role) return b.monthly_revenue - a.monthly_revenue
              return a.role === 'team_leader' ? -1 : 1
            }),
            monthly_revenue, quarterly_revenue, annual_revenue,
            monthly_target, quarterly_target, annual_target,
            monthly_achievement:   monthly_target   > 0 ? Math.round((monthly_revenue   / monthly_target)   * 100) : 0,
            quarterly_achievement: quarterly_target > 0 ? Math.round((quarterly_revenue / quarterly_target) * 100) : 0,
            annual_achievement:    annual_target    > 0 ? Math.round((annual_revenue    / annual_target)    * 100) : 0,
          } as SrTLTeam
        })
      )

      // Sort teams by monthly revenue desc
      const sortedTeams = teamsData.sort((a, b) => b.monthly_revenue - a.monthly_revenue)
      setTeams(sortedTeams)

      // Expand all by default
      setExpandedTeams(new Set(sortedTeams.map(t => t.sr_tl_id)))

      // Flat list of all members for "all members" view
      const flat = sortedTeams.flatMap(t => t.members)
      setAllMembers(flat)

      // Org-level rollup
      const org_monthly_revenue   = sortedTeams.reduce((s, t) => s + t.monthly_revenue, 0)
      const org_quarterly_revenue = sortedTeams.reduce((s, t) => s + t.quarterly_revenue, 0)
      const org_annual_revenue    = sortedTeams.reduce((s, t) => s + t.annual_revenue, 0)
      const org_monthly_target    = sortedTeams.reduce((s, t) => s + t.monthly_target, 0)
      const org_quarterly_target  = sortedTeams.reduce((s, t) => s + t.quarterly_target, 0)
      const org_annual_target     = sortedTeams.reduce((s, t) => s + t.annual_target, 0)

      setOrgStats({
        total_sr_tls:     srTLs.length,
        total_tls:        flat.filter(m => m.role === 'team_leader').length,
        total_recruiters: flat.filter(m => m.role === 'recruiter').length,
        total_candidates: sortedTeams.reduce((s, t) => s + t.total_candidates, 0),
        month_joinings:   sortedTeams.reduce((s, t) => s + t.month_joinings, 0),
        active_jobs:      sortedTeams.reduce((s, t) => s + t.active_jobs, 0),
        total_jobs:       sortedTeams.reduce((s, t) => s + t.total_jobs, 0),
        org_monthly_revenue, org_quarterly_revenue, org_annual_revenue,
        org_monthly_target, org_quarterly_target, org_annual_target,
        org_monthly_achievement:   org_monthly_target   > 0 ? Math.round((org_monthly_revenue   / org_monthly_target)   * 100) : 0,
        org_quarterly_achievement: org_quarterly_target > 0 ? Math.round((org_quarterly_revenue / org_quarterly_target) * 100) : 0,
        org_annual_achievement:    org_annual_target    > 0 ? Math.round((org_annual_revenue    / org_annual_target)    * 100) : 0,
      })

    } catch (err) {
      console.error('Error loading teams:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Excel Export ───────────────────────────────────────────────────────────
  const exportToExcel = () => {
    setExporting(true)
    try {
      const wb = XLSX.utils.book_new()

      // Sheet 1: Org Summary
      const summaryRows = [
        ['Organisation Team Performance Report'],
        [`Generated on: ${new Date().toLocaleString()}`],
        [],
        ['Metric', 'Value'],
        ['Sr. Team Leaders', orgStats.total_sr_tls],
        ['Team Leaders',     orgStats.total_tls],
        ['Recruiters',       orgStats.total_recruiters],
        ['Total Candidates', orgStats.total_candidates],
        ['Month Joinings',   orgStats.month_joinings],
        ['Active Jobs',      orgStats.active_jobs],
        [],
        ['Period', 'Target (₹)', 'Revenue (₹)', 'Achievement %'],
        ['Monthly',   orgStats.org_monthly_target,   orgStats.org_monthly_revenue,   `${orgStats.org_monthly_achievement}%`],
        ['Quarterly', orgStats.org_quarterly_target, orgStats.org_quarterly_revenue, `${orgStats.org_quarterly_achievement}%`],
        ['Annual',    orgStats.org_annual_target,    orgStats.org_annual_revenue,    `${orgStats.org_annual_achievement}%`],
      ]
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
      wsSummary['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Org Summary')

      // Sheet 2: Team Performance (one row per Sr-TL team)
      const teamHeaders = ['Team (Sr-TL)', 'TL Count', 'Recruiter Count', 'Total Candidates', 'Month Joinings', 'Active Jobs',
        'Monthly Target (₹)', 'Monthly Revenue (₹)', 'Monthly %',
        'Quarterly Target (₹)', 'Quarterly Revenue (₹)', 'Quarterly %',
        'Annual Target (₹)', 'Annual Revenue (₹)', 'Annual %']
      const teamRows = teams.map(t => [
        t.sr_tl_name, t.tl_count, t.recruiter_count, t.total_candidates, t.month_joinings, t.active_jobs,
        t.monthly_target, t.monthly_revenue, `${t.monthly_achievement}%`,
        t.quarterly_target, t.quarterly_revenue, `${t.quarterly_achievement}%`,
        t.annual_target, t.annual_revenue, `${t.annual_achievement}%`,
      ])
      // Org total row
      teamRows.push([
        'ORG TOTAL',
        orgStats.total_tls, orgStats.total_recruiters, orgStats.total_candidates, orgStats.month_joinings, orgStats.active_jobs,
        orgStats.org_monthly_target, orgStats.org_monthly_revenue, `${orgStats.org_monthly_achievement}%`,
        orgStats.org_quarterly_target, orgStats.org_quarterly_revenue, `${orgStats.org_quarterly_achievement}%`,
        orgStats.org_annual_target, orgStats.org_annual_revenue, `${orgStats.org_annual_achievement}%`,
      ])
      const wsTeams = XLSX.utils.aoa_to_sheet([teamHeaders, ...teamRows])
      wsTeams['!cols'] = [{ wch: 24 }, ...Array(14).fill({ wch: 20 })]
      XLSX.utils.book_append_sheet(wb, wsTeams, 'Team Performance')

      // Sheet 3: All Members
      const memberHeaders = ['Name', 'Role', 'Team (Sr-TL)', 'Reports To',
        'Candidates', 'Month Joinings', 'Active Pipeline',
        'Monthly Target (₹)', 'Monthly Revenue (₹)', 'Monthly %',
        'Quarterly Target (₹)', 'Quarterly Revenue (₹)', 'Quarterly %',
        'Annual Target (₹)', 'Annual Revenue (₹)', 'Annual %']
      const memberRows = allMembers.map(m => [
        m.user_name,
        m.role === 'team_leader' ? 'Team Leader' : 'Recruiter',
        m.team_name, m.reports_to_name,
        m.candidates_count, m.this_month_joinings, m.pipeline_count,
        m.monthly_target, m.monthly_revenue, `${m.monthly_achievement}%`,
        m.quarterly_target, m.quarterly_revenue, `${m.quarterly_achievement}%`,
        m.annual_target, m.annual_revenue, `${m.annual_achievement}%`,
      ])
      const wsMembers = XLSX.utils.aoa_to_sheet([memberHeaders, ...memberRows])
      wsMembers['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 20 }, ...Array(12).fill({ wch: 20 })]
      XLSX.utils.book_append_sheet(wb, wsMembers, 'All Members')

      // One sheet per team
      teams.forEach(team => {
        const tHeaders = ['Name', 'Role', 'Reports To', 'Candidates', 'Month Joinings', 'Pipeline',
          'Monthly Target (₹)', 'Monthly Revenue (₹)', 'Monthly %',
          'Quarterly Target (₹)', 'Quarterly Revenue (₹)', 'Quarterly %',
          'Annual Target (₹)', 'Annual Revenue (₹)', 'Annual %']
        const tRows = team.members.map(m => [
          m.user_name, m.role === 'team_leader' ? 'Team Leader' : 'Recruiter', m.reports_to_name,
          m.candidates_count, m.this_month_joinings, m.pipeline_count,
          m.monthly_target, m.monthly_revenue, `${m.monthly_achievement}%`,
          m.quarterly_target, m.quarterly_revenue, `${m.quarterly_achievement}%`,
          m.annual_target, m.annual_revenue, `${m.annual_achievement}%`,
        ])
        tRows.push([
          'TEAM TOTAL', '', '',
          team.members.reduce((s, m) => s + m.candidates_count, 0),
          team.members.reduce((s, m) => s + m.this_month_joinings, 0),
          team.members.reduce((s, m) => s + m.pipeline_count, 0),
          team.monthly_target, team.monthly_revenue, `${team.monthly_achievement}%`,
          team.quarterly_target, team.quarterly_revenue, `${team.quarterly_achievement}%`,
          team.annual_target, team.annual_revenue, `${team.annual_achievement}%`,
        ])
        const wsTeam = XLSX.utils.aoa_to_sheet([tHeaders, ...tRows])
        wsTeam['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 20 }, ...Array(12).fill({ wch: 18 })]
        // Truncate sheet name to 31 chars (Excel limit)
        const sheetName = team.sr_tl_name.slice(0, 28) + ' Team'
        XLSX.utils.book_append_sheet(wb, wsTeam, sheetName.slice(0, 31))
      })

      XLSX.writeFile(wb, `Team_Performance_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err) {
      console.error('Export error:', err)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const formatRevenue = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

  const AchievementBadge = ({ pct, large = false }: { pct: number; large?: boolean }) => (
    <span className={`px-3 py-1 rounded-full font-bold ${large ? 'text-sm' : 'text-xs'} ${
      pct >= 100 ? 'bg-green-100 text-green-800' :
      pct >= 75  ? 'bg-yellow-100 text-yellow-800' :
      'bg-red-100 text-red-800'
    }`}>{pct}%</span>
  )

  const AchievementBadgeFilled = ({ pct }: { pct: number }) => (
    <span className={`px-3 py-1 rounded-full font-bold text-sm text-white ${
      pct >= 100 ? 'bg-green-600' : pct >= 75 ? 'bg-yellow-600' : 'bg-red-600'
    }`}>{pct}%</span>
  )

  const toggleTeam = (id: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const getPerformanceBadge = (joinings: number) => {
    if (joinings >= 5) return { text: 'Top', color: 'bg-green-100 text-green-800' }
    if (joinings >= 2) return { text: 'Good', color: 'bg-blue-100 text-blue-800' }
    if (joinings >= 1) return { text: 'Active', color: 'bg-yellow-100 text-yellow-800' }
    return { text: '—', color: 'bg-gray-100 text-gray-600' }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-500 text-sm">Loading all team data…</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 pb-8">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 rounded-lg p-6 text-white flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">🏆 All Teams Performance</h1>
            <p className="text-blue-200">Organisation-wide target vs achievement · Fiscal year view</p>
          </div>
          <button onClick={exportToExcel} disabled={exporting}
            className="px-4 py-2 bg-white text-blue-700 hover:bg-blue-50 rounded-lg font-semibold flex items-center gap-2 transition disabled:opacity-60 text-sm">
            {exporting ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700"></div>Exporting…</> : <>📥 Export Excel</>}
          </button>
        </div>

        {/* ── Org Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Sr. Team Leaders', value: orgStats.total_sr_tls,     color: 'text-blue-700' },
            { label: 'Team Leaders',     value: orgStats.total_tls,         color: 'text-purple-700' },
            { label: 'Recruiters',       value: orgStats.total_recruiters,  color: 'text-indigo-700' },
            { label: 'Total Candidates', value: orgStats.total_candidates,  color: 'text-gray-800' },
            { label: 'Month Joinings',   value: orgStats.month_joinings,    color: 'text-green-700' },
            { label: 'Active Jobs',      value: orgStats.active_jobs,       color: 'text-orange-700' },
            { label: 'Total Jobs',       value: orgStats.total_jobs,        color: 'text-gray-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-lg p-4 shadow text-center">
              <div className="text-xs text-gray-500 mb-1 leading-tight">{label}</div>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Org Revenue Summary ── */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">💰 Organisation Revenue vs Target</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'This Month', target: orgStats.org_monthly_target, revenue: orgStats.org_monthly_revenue, pct: orgStats.org_monthly_achievement },
              { label: 'This Quarter', target: orgStats.org_quarterly_target, revenue: orgStats.org_quarterly_revenue, pct: orgStats.org_quarterly_achievement },
              { label: 'This Fiscal Year', target: orgStats.org_annual_target, revenue: orgStats.org_annual_revenue, pct: orgStats.org_annual_achievement },
            ].map(({ label, target, revenue, pct }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold text-gray-700">{label}</span>
                  <AchievementBadgeFilled pct={pct} />
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Target</span>
                    <span className="font-semibold text-gray-800">{formatRevenue(target)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Achieved</span>
                    <span className="font-semibold text-blue-700">{formatRevenue(revenue)}</span>
                  </div>
                </div>
                <div className="mt-3 bg-gray-200 rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── View Toggle ── */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { key: 'teams',       label: `🏢 Teams View (${teams.length} teams)` },
                { key: 'all_members', label: `👥 All Members (${allMembers.length} people)` },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setActiveView(key as any)}
                  className={`px-6 py-4 font-medium border-b-2 transition ${activeView === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">

            {/* ── TEAMS VIEW ── */}
            {activeView === 'teams' && (
              <div className="space-y-4">

                {/* Team-level comparison table */}
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Team (Sr-TL)</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">TLs</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Recruiters</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Candidates</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Joinings</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Active Jobs</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">Monthly Target</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">Monthly Rev.</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Monthly %</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">Q. Target</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">Q. Rev.</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Q. %</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">Annual Target</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">Annual Rev.</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Annual %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {teams.map(team => (
                        <tr key={team.sr_tl_id} className="hover:bg-blue-50 cursor-pointer" onClick={() => toggleTeam(team.sr_tl_id)}>
                          <td className="px-4 py-3 font-semibold text-blue-700">
                            <span className="mr-2">{expandedTeams.has(team.sr_tl_id) ? '▼' : '▶'}</span>
                            {team.sr_tl_name}
                          </td>
                          <td className="px-4 py-3 text-center">{team.tl_count}</td>
                          <td className="px-4 py-3 text-center">{team.recruiter_count}</td>
                          <td className="px-4 py-3 text-center">{team.total_candidates}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-semibold text-xs">{team.month_joinings}</span>
                          </td>
                          <td className="px-4 py-3 text-center">{team.active_jobs}</td>
                          <td className="px-4 py-3 text-center text-xs font-medium">{formatRevenue(team.monthly_target)}</td>
                          <td className="px-4 py-3 text-center text-xs font-semibold text-blue-700">{formatRevenue(team.monthly_revenue)}</td>
                          <td className="px-4 py-3 text-center"><AchievementBadge pct={team.monthly_achievement} /></td>
                          <td className="px-4 py-3 text-center text-xs font-medium">{formatRevenue(team.quarterly_target)}</td>
                          <td className="px-4 py-3 text-center text-xs font-semibold text-blue-700">{formatRevenue(team.quarterly_revenue)}</td>
                          <td className="px-4 py-3 text-center"><AchievementBadge pct={team.quarterly_achievement} /></td>
                          <td className="px-4 py-3 text-center text-xs font-medium">{formatRevenue(team.annual_target)}</td>
                          <td className="px-4 py-3 text-center text-xs font-semibold text-blue-700">{formatRevenue(team.annual_revenue)}</td>
                          <td className="px-4 py-3 text-center"><AchievementBadge pct={team.annual_achievement} /></td>
                        </tr>
                      ))}
                      {/* Org Total Row */}
                      <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 font-bold border-t-2 border-blue-300">
                        <td className="px-4 py-3 text-blue-900">ORG TOTAL</td>
                        <td className="px-4 py-3 text-center">{orgStats.total_tls}</td>
                        <td className="px-4 py-3 text-center">{orgStats.total_recruiters}</td>
                        <td className="px-4 py-3 text-center">{orgStats.total_candidates}</td>
                        <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-green-600 text-white rounded font-bold text-xs">{orgStats.month_joinings}</span></td>
                        <td className="px-4 py-3 text-center">{orgStats.active_jobs}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold">{formatRevenue(orgStats.org_monthly_target)}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-blue-700">{formatRevenue(orgStats.org_monthly_revenue)}</td>
                        <td className="px-4 py-3 text-center"><AchievementBadgeFilled pct={orgStats.org_monthly_achievement} /></td>
                        <td className="px-4 py-3 text-center text-xs font-bold">{formatRevenue(orgStats.org_quarterly_target)}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-blue-700">{formatRevenue(orgStats.org_quarterly_revenue)}</td>
                        <td className="px-4 py-3 text-center"><AchievementBadgeFilled pct={orgStats.org_quarterly_achievement} /></td>
                        <td className="px-4 py-3 text-center text-xs font-bold">{formatRevenue(orgStats.org_annual_target)}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-blue-700">{formatRevenue(orgStats.org_annual_revenue)}</td>
                        <td className="px-4 py-3 text-center"><AchievementBadgeFilled pct={orgStats.org_annual_achievement} /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Expanded team detail accordions */}
                {teams.map(team => expandedTeams.has(team.sr_tl_id) && (
                  <div key={team.sr_tl_id} className="border-2 border-blue-200 rounded-lg overflow-hidden">
                    {/* Team header bar */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-white">{team.sr_tl_name}'s Team</h3>
                        <p className="text-blue-200 text-sm">{team.tl_count} TL{team.tl_count !== 1 ? 's' : ''} · {team.recruiter_count} Recruiter{team.recruiter_count !== 1 ? 's' : ''} · {team.total_candidates} candidates · {team.active_jobs} active jobs</p>
                      </div>
                      <div className="flex gap-3">
                        {[
                          { label: 'Monthly', pct: team.monthly_achievement },
                          { label: 'Quarterly', pct: team.quarterly_achievement },
                          { label: 'Annual', pct: team.annual_achievement },
                        ].map(({ label, pct }) => (
                          <div key={label} className="bg-white/20 rounded-lg px-3 py-2 text-center">
                            <div className="text-xs text-blue-200 mb-1">{label}</div>
                            <div className={`text-lg font-bold ${pct >= 100 ? 'text-green-300' : pct >= 75 ? 'text-yellow-300' : 'text-red-300'}`}>{pct}%</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Member detail table */}
                    {team.members.length === 0 ? (
                      <div className="p-6 text-center text-gray-500">No members in this team</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left font-semibold text-gray-700">Member</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700">Role</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700">Reports To</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700">Candidates</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700">Joinings</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700">Pipeline</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">M. Target</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">M. Revenue</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700">M. %</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">Q. Target</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">Q. Revenue</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700">Q. %</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">A. Target</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">A. Revenue</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700">A. %</th>
                              <th className="px-4 py-3 text-center font-semibold text-gray-700">Perf.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {team.members.map(m => {
                              const badge = getPerformanceBadge(m.this_month_joinings)
                              return (
                                <tr key={m.user_id} className={`hover:bg-gray-50 ${m.role === 'team_leader' ? 'bg-purple-50' : ''}`}>
                                  <td className={`px-4 py-3 font-medium ${m.role === 'team_leader' ? 'text-purple-900' : 'text-gray-800'}`}>
                                    {m.role === 'recruiter' && <span className="text-gray-300 mr-1">└</span>}
                                    {m.user_name}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${m.role === 'team_leader' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                                      {m.role === 'team_leader' ? 'TL' : 'Rec.'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center text-xs text-gray-500">{m.reports_to_name}</td>
                                  <td className="px-4 py-3 text-center font-semibold">{m.candidates_count}</td>
                                  <td className="px-4 py-3 text-center">
                                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-semibold text-xs">{m.this_month_joinings}</span>
                                  </td>
                                  <td className="px-4 py-3 text-center">{m.pipeline_count}</td>
                                  <td className="px-4 py-3 text-center text-xs font-medium">{formatRevenue(m.monthly_target)}</td>
                                  <td className="px-4 py-3 text-center text-xs font-semibold text-blue-700">{formatRevenue(m.monthly_revenue)}</td>
                                  <td className="px-4 py-3 text-center"><AchievementBadge pct={m.monthly_achievement} /></td>
                                  <td className="px-4 py-3 text-center text-xs font-medium">{formatRevenue(m.quarterly_target)}</td>
                                  <td className="px-4 py-3 text-center text-xs font-semibold text-blue-700">{formatRevenue(m.quarterly_revenue)}</td>
                                  <td className="px-4 py-3 text-center"><AchievementBadge pct={m.quarterly_achievement} /></td>
                                  <td className="px-4 py-3 text-center text-xs font-medium">{formatRevenue(m.annual_target)}</td>
                                  <td className="px-4 py-3 text-center text-xs font-semibold text-blue-700">{formatRevenue(m.annual_revenue)}</td>
                                  <td className="px-4 py-3 text-center"><AchievementBadge pct={m.annual_achievement} /></td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${badge.color}`}>{badge.text}</span>
                                  </td>
                                </tr>
                              )
                            })}
                            {/* Team total row */}
                            <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                              <td className="px-4 py-3 text-blue-900">Team Total</td>
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3"></td>
                              <td className="px-4 py-3 text-center">{team.members.reduce((s, m) => s + m.candidates_count, 0)}</td>
                              <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-green-600 text-white rounded font-bold text-xs">{team.members.reduce((s, m) => s + m.this_month_joinings, 0)}</span></td>
                              <td className="px-4 py-3 text-center">{team.members.reduce((s, m) => s + m.pipeline_count, 0)}</td>
                              <td className="px-4 py-3 text-center text-xs font-bold">{formatRevenue(team.monthly_target)}</td>
                              <td className="px-4 py-3 text-center text-xs font-bold text-blue-700">{formatRevenue(team.monthly_revenue)}</td>
                              <td className="px-4 py-3 text-center"><AchievementBadgeFilled pct={team.monthly_achievement} /></td>
                              <td className="px-4 py-3 text-center text-xs font-bold">{formatRevenue(team.quarterly_target)}</td>
                              <td className="px-4 py-3 text-center text-xs font-bold text-blue-700">{formatRevenue(team.quarterly_revenue)}</td>
                              <td className="px-4 py-3 text-center"><AchievementBadgeFilled pct={team.quarterly_achievement} /></td>
                              <td className="px-4 py-3 text-center text-xs font-bold">{formatRevenue(team.annual_target)}</td>
                              <td className="px-4 py-3 text-center text-xs font-bold text-blue-700">{formatRevenue(team.annual_revenue)}</td>
                              <td className="px-4 py-3 text-center"><AchievementBadgeFilled pct={team.annual_achievement} /></td>
                              <td className="px-4 py-3"></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── ALL MEMBERS VIEW ── */}
            {activeView === 'all_members' && (
              <div className="overflow-x-auto">
                {allMembers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No members found</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50">Member</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Role</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Team</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Reports To</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Candidates</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Joinings</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Pipeline</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">M. Target</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">M. Revenue</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">M. %</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">Q. Target</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">Q. Revenue</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Q. %</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">A. Target</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">A. Revenue</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">A. %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {allMembers.map((m) => (
                        <tr key={m.user_id} className={`hover:bg-gray-50 ${m.role === 'team_leader' ? 'bg-purple-50' : ''}`}>
                          <td className={`px-4 py-3 font-medium sticky left-0 ${m.role === 'team_leader' ? 'bg-purple-50 text-purple-900' : 'bg-white text-gray-800'}`}>
                            {m.role === 'recruiter' && <span className="text-gray-300 mr-1">└</span>}
                            {m.user_name}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${m.role === 'team_leader' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                              {m.role === 'team_leader' ? 'TL' : 'Rec.'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-gray-600 font-medium">{m.team_name}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">{m.reports_to_name}</td>
                          <td className="px-4 py-3 text-center font-semibold">{m.candidates_count}</td>
                          <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-green-100 text-green-800 rounded font-semibold text-xs">{m.this_month_joinings}</span></td>
                          <td className="px-4 py-3 text-center">{m.pipeline_count}</td>
                          <td className="px-4 py-3 text-center text-xs font-medium">{formatRevenue(m.monthly_target)}</td>
                          <td className="px-4 py-3 text-center text-xs font-semibold text-blue-700">{formatRevenue(m.monthly_revenue)}</td>
                          <td className="px-4 py-3 text-center"><AchievementBadge pct={m.monthly_achievement} /></td>
                          <td className="px-4 py-3 text-center text-xs font-medium">{formatRevenue(m.quarterly_target)}</td>
                          <td className="px-4 py-3 text-center text-xs font-semibold text-blue-700">{formatRevenue(m.quarterly_revenue)}</td>
                          <td className="px-4 py-3 text-center"><AchievementBadge pct={m.quarterly_achievement} /></td>
                          <td className="px-4 py-3 text-center text-xs font-medium">{formatRevenue(m.annual_target)}</td>
                          <td className="px-4 py-3 text-center text-xs font-semibold text-blue-700">{formatRevenue(m.annual_revenue)}</td>
                          <td className="px-4 py-3 text-center"><AchievementBadge pct={m.annual_achievement} /></td>
                        </tr>
                      ))}
                      {/* Grand total row */}
                      <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 font-bold border-t-2 border-blue-300">
                        <td className="px-4 py-3 text-blue-900 sticky left-0 bg-blue-50">ORG TOTAL</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-center font-bold">{orgStats.total_candidates}</td>
                        <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-green-600 text-white rounded font-bold text-xs">{orgStats.month_joinings}</span></td>
                        <td className="px-4 py-3 text-center font-bold">{allMembers.reduce((s, m) => s + m.pipeline_count, 0)}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold">{formatRevenue(orgStats.org_monthly_target)}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-blue-700">{formatRevenue(orgStats.org_monthly_revenue)}</td>
                        <td className="px-4 py-3 text-center"><AchievementBadgeFilled pct={orgStats.org_monthly_achievement} /></td>
                        <td className="px-4 py-3 text-center text-xs font-bold">{formatRevenue(orgStats.org_quarterly_target)}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-blue-700">{formatRevenue(orgStats.org_quarterly_revenue)}</td>
                        <td className="px-4 py-3 text-center"><AchievementBadgeFilled pct={orgStats.org_quarterly_achievement} /></td>
                        <td className="px-4 py-3 text-center text-xs font-bold">{formatRevenue(orgStats.org_annual_target)}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-blue-700">{formatRevenue(orgStats.org_annual_revenue)}</td>
                        <td className="px-4 py-3 text-center"><AchievementBadgeFilled pct={orgStats.org_annual_achievement} /></td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}

          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}
