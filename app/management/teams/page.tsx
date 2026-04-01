// app/management/teams/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

// ─── Types ────────────────────────────────────────────────────────────────────
type DateFilter = 'current_month' | 'prev_month' | 'current_quarter' | 'prev_quarter' | 'custom'

interface MemberPerformance {
  user_id: string
  user_name: string
  role: 'sr_team_leader' | 'team_leader' | 'recruiter'
  reports_to_id: string
  reports_to_name: string
  team_name: string
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
  const [activeFilter, setActiveFilter] = useState<DateFilter>('current_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')

  const [teams, setTeams]           = useState<SrTLTeam[]>([])
  const [allMembers, setAllMembers] = useState<MemberPerformance[]>([])

  const [orgStats, setOrgStats] = useState({
    total_sr_tls: 0, total_tls: 0, total_recruiters: 0,
    total_candidates: 0, month_joinings: 0, active_jobs: 0, total_jobs: 0,
    org_monthly_revenue: 0, org_quarterly_revenue: 0, org_annual_revenue: 0,
    org_monthly_target: 0, org_quarterly_target: 0, org_annual_target: 0,
    org_monthly_achievement: 0, org_quarterly_achievement: 0, org_annual_achievement: 0,
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
    loadAllTeams('current_month')
  }, [])

  // ── Reload on filter / custom date change ──────────────────────────────────
  useEffect(() => {
    if (!user) return
    if (activeFilter === 'custom') {
      if (customFrom && customTo && customFrom <= customTo) loadAllTeams('custom', customFrom, customTo)
    } else {
      loadAllTeams(activeFilter)
    }
  }, [activeFilter, customFrom, customTo])

  // ── Date range helpers ─────────────────────────────────────────────────────
  const getDateRanges = (filter: DateFilter, cfrom = '', cto = '') => {
    const now          = new Date()
    const currentYear  = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    const getCurrentBQ = (m: number) => {
      if (m >= 4 && m <= 6)   return 1
      if (m >= 7 && m <= 9)   return 2
      if (m >= 10 && m <= 12) return 3
      return 4
    }
    const getBQBounds = (bq: number, year: number) => {
      if (bq === 1) return { start: `${year}-04-01`,     end: `${year}-07-01` }
      if (bq === 2) return { start: `${year}-07-01`,     end: `${year}-10-01` }
      if (bq === 3) return { start: `${year}-10-01`,     end: `${year + 1}-01-01` }
      return         { start: `${year}-01-01`,            end: `${year}-04-01` }
    }

    // Monthly bounds
    let monthStart: string
    let monthEnd:   string | null
    if (filter === 'prev_month') {
      monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
      monthEnd   = new Date(now.getFullYear(), now.getMonth(),     1).toISOString().slice(0, 10)
    } else {
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      monthEnd   = null
    }

    // Quarterly bounds
    const currentBQ = getCurrentBQ(currentMonth)
    let quarterStart: string, quarterEnd: string
    if (filter === 'prev_quarter') {
      const prevBQ     = currentBQ === 1 ? 4 : currentBQ - 1
      const prevBQYear = currentBQ === 4 ? currentYear - 1 : currentYear
      const bounds     = getBQBounds(prevBQ, prevBQ === 4 && currentBQ !== 4 ? currentYear : prevBQYear)
      quarterStart = bounds.start; quarterEnd = bounds.end
    } else {
      const bounds = getBQBounds(currentBQ, currentYear)
      quarterStart = bounds.start; quarterEnd = bounds.end
    }

    // Annual
    const fiscalStart = currentMonth >= 4 ? currentYear : currentYear - 1
    const annualStart = `${fiscalStart}-04-01`
    const annualEnd   = `${fiscalStart + 1}-04-01`

    // Primary period — drives candidates, pipeline, joinings counts
    let primaryStart: string
    let primaryEnd:   string | null
    if (filter === 'custom')          { primaryStart = cfrom;        primaryEnd = cto || null }
    else if (filter === 'prev_month')     { primaryStart = monthStart;   primaryEnd = monthEnd }
    else if (filter === 'current_month')  { primaryStart = monthStart;   primaryEnd = null }
    else if (filter === 'prev_quarter')   { primaryStart = quarterStart; primaryEnd = quarterEnd }
    else                              { primaryStart = quarterStart; primaryEnd = null }

    return { monthStart, monthEnd, quarterStart, quarterEnd, annualStart, annualEnd, primaryStart, primaryEnd }
  }

  // ── Label helpers ──────────────────────────────────────────────────────────
  const getFilterLabel = (filter: DateFilter) => {
    if (filter === 'custom' && customFrom && customTo) return `${customFrom} → ${customTo}`
    const map: Record<DateFilter, string> = {
      current_month: 'This Month', prev_month: 'Prev. Month',
      current_quarter: 'This Quarter', prev_quarter: 'Prev. Quarter', custom: 'Custom Range',
    }
    return map[filter]
  }

  const getColumnLabels = (filter: DateFilter) => ({
    monthly:   filter === 'prev_month'    ? 'Prev. Month'   : filter === 'custom' ? 'Period' : 'This Month',
    quarterly: filter === 'prev_quarter'  ? 'Prev. Quarter' : filter === 'custom' ? 'Period' : 'This Quarter',
  })

  // ── Per-member revenue & stats ─────────────────────────────────────────────
  const getMemberRevenue = async (memberId: string, memberData: any, filter: DateFilter, cfrom = '', cto = '') => {
    const { monthStart, monthEnd, quarterStart, quarterEnd, annualStart, annualEnd, primaryStart, primaryEnd } =
      getDateRanges(filter, cfrom, cto)

    const buildRevQ = (start: string, end: string | null) => {
      let q = supabaseAdmin.from('candidates').select('revenue_earned')
        .eq('assigned_to', memberId).eq('current_stage', 'joined').gte('date_joined', start)
      if (end) q = q.lt('date_joined', end)
      return q
    }

    // Revenue: custom = same range for all three; otherwise standard periods
    const monthlyQ   = filter === 'custom' ? buildRevQ(primaryStart, primaryEnd) : buildRevQ(monthStart, monthEnd)
    const quarterlyQ = filter === 'custom' ? buildRevQ(primaryStart, primaryEnd) : buildRevQ(quarterStart, quarterEnd)
    const annualQ    = filter === 'custom' ? buildRevQ(primaryStart, primaryEnd) : buildRevQ(annualStart, annualEnd)

    // ── Candidates sourced in primary period ──────────────────────────────
    let candidatesQ = supabaseAdmin.from('candidates')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', memberId).gte('date_sourced', primaryStart)
    if (primaryEnd) candidatesQ = candidatesQ.lt('date_sourced', primaryEnd)

    // ── Joinings in primary period ────────────────────────────────────────
    let joiningsQ = supabaseAdmin.from('candidates')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', memberId).eq('current_stage', 'joined').gte('date_joined', primaryStart)
    if (primaryEnd) joiningsQ = joiningsQ.lt('date_joined', primaryEnd)

    // ── Pipeline: sourced in primary period AND in active stages ──────────
    let pipelineQ = supabaseAdmin.from('candidates')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', memberId)
      .in('current_stage', ['screening', 'interview_scheduled', 'interview_completed', 'offer_extended', 'offer_accepted'])
      .gte('date_sourced', primaryStart)
    if (primaryEnd) pipelineQ = pipelineQ.lt('date_sourced', primaryEnd)

    const [monthlyRevData, quarterlyRevData, annualRevData, candidatesCount, monthJoinings, pipelineCount] =
      await Promise.all([monthlyQ, quarterlyQ, annualQ, candidatesQ, joiningsQ, pipelineQ])

    const monthly_revenue   = monthlyRevData.data?.reduce((s, c) => s + (c.revenue_earned || 0), 0) || 0
    const quarterly_revenue = quarterlyRevData.data?.reduce((s, c) => s + (c.revenue_earned || 0), 0) || 0
    const annual_revenue    = annualRevData.data?.reduce((s, c) => s + (c.revenue_earned || 0), 0) || 0

    const monthly_target   = memberData.monthly_target   ? Number(memberData.monthly_target)   : (memberData.role === 'team_leader' ? 5 : 2)
    const quarterly_target = memberData.quarterly_target ? Number(memberData.quarterly_target) : monthly_target * 3
    const annual_target    = memberData.annual_target    ? Number(memberData.annual_target)    : monthly_target * 12

    return {
      candidates_count:    candidatesCount.count || 0,
      this_month_joinings: monthJoinings.count   || 0,
      pipeline_count:      pipelineCount.count   || 0,
      monthly_revenue, quarterly_revenue, annual_revenue,
      monthly_target, quarterly_target, annual_target,
      monthly_achievement:   monthly_target   > 0 ? Math.round((monthly_revenue   / monthly_target)   * 100) : 0,
      quarterly_achievement: quarterly_target > 0 ? Math.round((quarterly_revenue / quarterly_target) * 100) : 0,
      annual_achievement:    annual_target    > 0 ? Math.round((annual_revenue    / annual_target)    * 100) : 0,
    }
  }

  // ── Main data loader ────────────────────────────────────────────────────────
  const loadAllTeams = async (filter: DateFilter, cfrom = '', cto = '') => {
    setLoading(true)
    try {
      const { primaryStart, primaryEnd } = getDateRanges(filter, cfrom, cto)

      const { data: srTLs } = await supabaseAdmin
        .from('users').select('id, full_name, team_id, monthly_target, quarterly_target, annual_target')
        .eq('role', 'sr_team_leader').eq('is_active', true).order('full_name')

      if (!srTLs || srTLs.length === 0) { setLoading(false); return }

      const teamsData = await Promise.all(srTLs.map(async (srTL: any) => {
        const { data: directReports } = await supabaseAdmin
          .from('users').select('id, full_name, role, reports_to, team_id, monthly_target, quarterly_target, annual_target')
          .eq('reports_to', srTL.id).eq('is_active', true)

        const tlIds = (directReports || []).filter((m: any) => m.role === 'team_leader').map((m: any) => m.id)

        let indirectRecruiters: any[] = []
        if (tlIds.length > 0) {
          const { data: recs } = await supabaseAdmin
            .from('users').select('id, full_name, role, reports_to, team_id, monthly_target, quarterly_target, annual_target')
            .in('reports_to', tlIds).eq('role', 'recruiter').eq('is_active', true)
          indirectRecruiters = recs || []
        }

        const allMembersLocal = [...(directReports || []), ...indirectRecruiters]
        const allMemberIds    = allMembersLocal.map((m: any) => m.id)
        const nameMap: Record<string, string> = { [srTL.id]: srTL.full_name }
        allMembersLocal.forEach((m: any) => { nameMap[m.id] = m.full_name })

        const memberPerf = await Promise.all(allMembersLocal.map(async (member: any) => {
          const rev = await getMemberRevenue(member.id, member, filter, cfrom, cto)
          return {
            user_id: member.id, user_name: member.full_name, role: member.role,
            reports_to_id: member.reports_to, reports_to_name: nameMap[member.reports_to] || '—',
            team_name: srTL.full_name, ...rev,
          }
        }))

        // Team candidates: sourced in primary period
        let teamCandQ = supabaseAdmin.from('candidates')
          .select('*', { count: 'exact', head: true })
          .in('assigned_to', allMemberIds.length > 0 ? allMemberIds : ['none'])
          .gte('date_sourced', primaryStart)
        if (primaryEnd) teamCandQ = teamCandQ.lt('date_sourced', primaryEnd)
        const { count: totalCandidates } = await teamCandQ

        // Team joinings in primary period
        let teamJoinQ = supabaseAdmin.from('candidates')
          .select('*', { count: 'exact', head: true })
          .in('assigned_to', allMemberIds.length > 0 ? allMemberIds : ['none'])
          .eq('current_stage', 'joined').gte('date_joined', primaryStart)
        if (primaryEnd) teamJoinQ = teamJoinQ.lt('date_joined', primaryEnd)
        const { count: monthJoinings } = await teamJoinQ

        const { count: totalJobs }  = await supabaseAdmin.from('jobs').select('*', { count: 'exact', head: true }).eq('assigned_team_id', srTL.team_id)
        const { count: activeJobs } = await supabaseAdmin.from('jobs').select('*', { count: 'exact', head: true }).eq('assigned_team_id', srTL.team_id).eq('status', 'open')

        const monthly_revenue   = memberPerf.reduce((s, m) => s + m.monthly_revenue,   0)
        const quarterly_revenue = memberPerf.reduce((s, m) => s + m.quarterly_revenue, 0)
        const annual_revenue    = memberPerf.reduce((s, m) => s + m.annual_revenue,    0)
        const monthly_target    = memberPerf.reduce((s, m) => s + m.monthly_target,    0)
        const quarterly_target  = memberPerf.reduce((s, m) => s + m.quarterly_target,  0)
        const annual_target     = memberPerf.reduce((s, m) => s + m.annual_target,     0)

        return {
          sr_tl_id: srTL.id, sr_tl_name: srTL.full_name, team_id: srTL.team_id,
          tl_count:        allMembersLocal.filter((m: any) => m.role === 'team_leader').length,
          recruiter_count: allMembersLocal.filter((m: any) => m.role === 'recruiter').length,
          total_candidates: totalCandidates || 0,
          month_joinings:   monthJoinings   || 0,
          active_jobs: activeJobs || 0, total_jobs: totalJobs || 0,
          members: memberPerf.sort((a, b) => a.role === b.role ? b.monthly_revenue - a.monthly_revenue : a.role === 'team_leader' ? -1 : 1),
          monthly_revenue, quarterly_revenue, annual_revenue,
          monthly_target, quarterly_target, annual_target,
          monthly_achievement:   monthly_target   > 0 ? Math.round((monthly_revenue   / monthly_target)   * 100) : 0,
          quarterly_achievement: quarterly_target > 0 ? Math.round((quarterly_revenue / quarterly_target) * 100) : 0,
          annual_achievement:    annual_target    > 0 ? Math.round((annual_revenue    / annual_target)    * 100) : 0,
        } as SrTLTeam
      }))

      const sortedTeams = teamsData.sort((a, b) => b.monthly_revenue - a.monthly_revenue)
      setTeams(sortedTeams)
      setExpandedTeams(new Set(sortedTeams.map(t => t.sr_tl_id)))

      const flat = sortedTeams.flatMap(t => t.members)
      setAllMembers(flat)

      const org_monthly_revenue   = sortedTeams.reduce((s, t) => s + t.monthly_revenue,   0)
      const org_quarterly_revenue = sortedTeams.reduce((s, t) => s + t.quarterly_revenue, 0)
      const org_annual_revenue    = sortedTeams.reduce((s, t) => s + t.annual_revenue,    0)
      const org_monthly_target    = sortedTeams.reduce((s, t) => s + t.monthly_target,    0)
      const org_quarterly_target  = sortedTeams.reduce((s, t) => s + t.quarterly_target,  0)
      const org_annual_target     = sortedTeams.reduce((s, t) => s + t.annual_target,     0)

      setOrgStats({
        total_sr_tls:     srTLs.length,
        total_tls:        flat.filter(m => m.role === 'team_leader').length,
        total_recruiters: flat.filter(m => m.role === 'recruiter').length,
        total_candidates: sortedTeams.reduce((s, t) => s + t.total_candidates, 0),
        month_joinings:   sortedTeams.reduce((s, t) => s + t.month_joinings,   0),
        active_jobs:      sortedTeams.reduce((s, t) => s + t.active_jobs,      0),
        total_jobs:       sortedTeams.reduce((s, t) => s + t.total_jobs,       0),
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
  const exportToExcel = async () => {
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const cl = getColumnLabels(activeFilter)

      const wsSummary = wb.addWorksheet('Org Summary')
      wsSummary.columns = [{ width: 28 }, { width: 18 }, { width: 18 }, { width: 16 }]
      wsSummary.addRows([
        ['Organisation Team Performance Report'],
        [`Generated: ${new Date().toLocaleString()} | Filter: ${getFilterLabel(activeFilter)}`],
        [],
        ['Metric', 'Value'],
        ['Sr. Team Leaders', orgStats.total_sr_tls],
        ['Team Leaders', orgStats.total_tls],
        ['Recruiters', orgStats.total_recruiters],
        ['Candidates (period)', orgStats.total_candidates],
        ['Joinings (period)', orgStats.month_joinings],
        ['Active Jobs', orgStats.active_jobs],
        [],
        ['Period', 'Target (₹)', 'Revenue (₹)', 'Achievement %'],
        [cl.monthly,        orgStats.org_monthly_target,   orgStats.org_monthly_revenue,   `${orgStats.org_monthly_achievement}%`],
        [cl.quarterly,      orgStats.org_quarterly_target, orgStats.org_quarterly_revenue, `${orgStats.org_quarterly_achievement}%`],
        ['Annual (Fiscal)',  orgStats.org_annual_target,    orgStats.org_annual_revenue,    `${orgStats.org_annual_achievement}%`],
      ])

      const wsTeams = wb.addWorksheet('Team Performance')
      wsTeams.columns = [{ width: 24 }, ...Array(14).fill({ width: 20 })]
      wsTeams.addRow(['Team (Sr-TL)', 'TL Count', 'Recruiter Count', 'Candidates (Period)', 'Joinings (Period)', 'Active Jobs',
        `${cl.monthly} Target (₹)`, `${cl.monthly} Revenue (₹)`, 'M %',
        `${cl.quarterly} Target (₹)`, `${cl.quarterly} Revenue (₹)`, 'Q %',
        'Annual Target (₹)', 'Annual Revenue (₹)', 'Annual %'])
      teams.forEach(t => wsTeams.addRow([
        t.sr_tl_name, t.tl_count, t.recruiter_count, t.total_candidates, t.month_joinings, t.active_jobs,
        t.monthly_target, t.monthly_revenue, `${t.monthly_achievement}%`,
        t.quarterly_target, t.quarterly_revenue, `${t.quarterly_achievement}%`,
        t.annual_target, t.annual_revenue, `${t.annual_achievement}%`]))
      wsTeams.addRow(['ORG TOTAL', orgStats.total_tls, orgStats.total_recruiters, orgStats.total_candidates, orgStats.month_joinings, orgStats.active_jobs,
        orgStats.org_monthly_target, orgStats.org_monthly_revenue, `${orgStats.org_monthly_achievement}%`,
        orgStats.org_quarterly_target, orgStats.org_quarterly_revenue, `${orgStats.org_quarterly_achievement}%`,
        orgStats.org_annual_target, orgStats.org_annual_revenue, `${orgStats.org_annual_achievement}%`])

      const wsMembers = wb.addWorksheet('All Members')
      wsMembers.columns = [{ width: 22 }, { width: 14 }, { width: 22 }, { width: 20 }, ...Array(12).fill({ width: 20 })]
      wsMembers.addRow(['Name', 'Role', 'Team (Sr-TL)', 'Reports To', 'Candidates (Period)', 'Joinings (Period)', 'Pipeline (Period)',
        `${cl.monthly} Target (₹)`, `${cl.monthly} Revenue (₹)`, 'M %',
        `${cl.quarterly} Target (₹)`, `${cl.quarterly} Revenue (₹)`, 'Q %',
        'Annual Target (₹)', 'Annual Revenue (₹)', 'Annual %'])
      allMembers.forEach(m => wsMembers.addRow([
        m.user_name, m.role === 'team_leader' ? 'Team Leader' : 'Recruiter', m.team_name, m.reports_to_name,
        m.candidates_count, m.this_month_joinings, m.pipeline_count,
        m.monthly_target, m.monthly_revenue, `${m.monthly_achievement}%`,
        m.quarterly_target, m.quarterly_revenue, `${m.quarterly_achievement}%`,
        m.annual_target, m.annual_revenue, `${m.annual_achievement}%`]))

      teams.forEach(team => {
        const sheetName = (team.sr_tl_name.slice(0, 28) + ' Team').slice(0, 31)
        const ws = wb.addWorksheet(sheetName)
        ws.columns = [{ width: 22 }, { width: 14 }, { width: 20 }, ...Array(12).fill({ width: 18 })]
        ws.addRow(['Name', 'Role', 'Reports To', 'Candidates (Period)', 'Joinings (Period)', 'Pipeline (Period)',
          'Monthly Target (₹)', 'Monthly Revenue (₹)', 'M %',
          'Quarterly Target (₹)', 'Quarterly Revenue (₹)', 'Q %',
          'Annual Target (₹)', 'Annual Revenue (₹)', 'Annual %'])
        team.members.forEach(m => ws.addRow([
          m.user_name, m.role === 'team_leader' ? 'Team Leader' : 'Recruiter', m.reports_to_name,
          m.candidates_count, m.this_month_joinings, m.pipeline_count,
          m.monthly_target, m.monthly_revenue, `${m.monthly_achievement}%`,
          m.quarterly_target, m.quarterly_revenue, `${m.quarterly_achievement}%`,
          m.annual_target, m.annual_revenue, `${m.annual_achievement}%`]))
        ws.addRow(['TEAM TOTAL', '', '',
          team.members.reduce((s, m) => s + m.candidates_count, 0),
          team.members.reduce((s, m) => s + m.this_month_joinings, 0),
          team.members.reduce((s, m) => s + m.pipeline_count, 0),
          team.monthly_target, team.monthly_revenue, `${team.monthly_achievement}%`,
          team.quarterly_target, team.quarterly_revenue, `${team.quarterly_achievement}%`,
          team.annual_target, team.annual_revenue, `${team.annual_achievement}%`])
      })

      const buffer = await wb.xlsx.writeBuffer()
      const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url    = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href = url; a.download = `Team_Performance_${activeFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export error:', err); alert('Export failed.')
    } finally {
      setExporting(false)
    }
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const formatRevenue = (n: number) => `₹${n.toLocaleString('en-IN')}`

  const AchievementBadge = ({ pct }: { pct: number }) => (
    <span className={`px-3 py-1 rounded-full font-bold text-xs ${pct >= 100 ? 'bg-green-100 text-green-800' : pct >= 75 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{pct}%</span>
  )
  const AchievementBadgeFilled = ({ pct }: { pct: number }) => (
    <span className={`px-3 py-1 rounded-full font-bold text-sm text-white ${pct >= 100 ? 'bg-green-600' : pct >= 75 ? 'bg-yellow-600' : 'bg-red-600'}`}>{pct}%</span>
  )

  const toggleTeam = (id: string) => {
    setExpandedTeams(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const getPerformanceBadge = (j: number) => {
    if (j >= 5) return { text: 'Top',    color: 'bg-green-100 text-green-800' }
    if (j >= 2) return { text: 'Good',   color: 'bg-blue-100 text-blue-800' }
    if (j >= 1) return { text: 'Active', color: 'bg-yellow-100 text-yellow-800' }
    return { text: '—', color: 'bg-gray-100 text-gray-600' }
  }

  const cl = getColumnLabels(activeFilter)

  const candidatesLabel = activeFilter === 'current_month' ? 'Month Candidates'
    : activeFilter === 'prev_month'    ? 'Prev. Month Added'
    : activeFilter === 'custom'        ? 'Period Candidates'
    : 'Quarter Candidates'
  const joiningLabel = activeFilter === 'prev_month'   ? 'Prev. Month Joinings'
    : (activeFilter === 'prev_quarter' || activeFilter === 'current_quarter') ? 'Quarter Joinings'
    : activeFilter === 'custom' ? 'Period Joinings'
    : 'Month Joinings'

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

        {/* ── Date Filter Bar ── */}
        <div className="bg-white rounded-lg shadow px-5 py-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-600">📅 View Period:</span>
            {([
              { key: 'current_month',   label: 'This Month' },
              { key: 'prev_month',      label: 'Previous Month' },
              { key: 'current_quarter', label: 'This Quarter' },
              { key: 'prev_quarter',    label: 'Previous Quarter' },
              { key: 'custom',          label: '📆 Custom Range' },
            ] as { key: DateFilter; label: string }[]).map(({ key, label }) => (
              <button key={key} onClick={() => setActiveFilter(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition border ${
                  activeFilter === key
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                }`}>
                {label}
              </button>
            ))}
            {activeFilter !== 'current_month' && activeFilter !== 'custom' && (
              <span className="ml-auto text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full font-medium">
                Showing: {getFilterLabel(activeFilter)}
              </span>
            )}
          </div>

          {/* Custom date pickers — shown only when custom is active */}
          {activeFilter === 'custom' && (
            <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-gray-100">
              <span className="text-sm text-gray-500 font-medium">From:</span>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} max={customTo || undefined}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-sm text-gray-500 font-medium">To:</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} min={customFrom || undefined}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {customFrom && customTo && customFrom <= customTo && (
                <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full font-medium">
                  {customFrom} → {customTo}
                </span>
              )}
              {customFrom && customTo && customFrom > customTo && (
                <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
                  ⚠️ From date must be before To date
                </span>
              )}
              {(!customFrom || !customTo) && (
                <span className="text-xs text-gray-400 italic">Select both dates to load data</span>
              )}
            </div>
          )}
        </div>

        {/* ── Org Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Sr. Team Leaders',  value: orgStats.total_sr_tls,     color: 'text-blue-700' },
            { label: 'Team Leaders',       value: orgStats.total_tls,         color: 'text-purple-700' },
            { label: 'Recruiters',         value: orgStats.total_recruiters,  color: 'text-indigo-700' },
            { label: candidatesLabel,      value: orgStats.total_candidates,  color: 'text-gray-800' },
            { label: joiningLabel,         value: orgStats.month_joinings,    color: 'text-green-700' },
            { label: 'Active Jobs',        value: orgStats.active_jobs,       color: 'text-orange-700' },
            { label: 'Total Jobs',         value: orgStats.total_jobs,        color: 'text-gray-700' },
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
              { label: cl.monthly,          target: orgStats.org_monthly_target,   revenue: orgStats.org_monthly_revenue,   pct: orgStats.org_monthly_achievement },
              { label: cl.quarterly,        target: orgStats.org_quarterly_target, revenue: orgStats.org_quarterly_revenue, pct: orgStats.org_quarterly_achievement },
              { label: 'This Fiscal Year',  target: orgStats.org_annual_target,    revenue: orgStats.org_annual_revenue,    pct: orgStats.org_annual_achievement },
            ].map(({ label, target, revenue, pct }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold text-gray-700">{label}</span>
                  <AchievementBadgeFilled pct={pct} />
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Target</span><span className="font-semibold text-gray-800">{formatRevenue(target)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Achieved</span><span className="font-semibold text-blue-700">{formatRevenue(revenue)}</span></div>
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
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">{cl.monthly} Target</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">{cl.monthly} Rev.</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">M. %</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">{cl.quarterly} Target</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">{cl.quarterly} Rev.</th>
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
                            <span className="mr-2">{expandedTeams.has(team.sr_tl_id) ? '▼' : '▶'}</span>{team.sr_tl_name}
                          </td>
                          <td className="px-4 py-3 text-center">{team.tl_count}</td>
                          <td className="px-4 py-3 text-center">{team.recruiter_count}</td>
                          <td className="px-4 py-3 text-center">{team.total_candidates}</td>
                          <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-green-100 text-green-800 rounded font-semibold text-xs">{team.month_joinings}</span></td>
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

                {teams.map(team => expandedTeams.has(team.sr_tl_id) && (
                  <div key={team.sr_tl_id} className="border-2 border-blue-200 rounded-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-white">{team.sr_tl_name}'s Team</h3>
                        <p className="text-blue-200 text-sm">{team.tl_count} TL{team.tl_count !== 1 ? 's' : ''} · {team.recruiter_count} Recruiter{team.recruiter_count !== 1 ? 's' : ''} · {team.total_candidates} candidates · {team.active_jobs} active jobs</p>
                      </div>
                      <div className="flex gap-3">
                        {[{ label: cl.monthly, pct: team.monthly_achievement }, { label: cl.quarterly, pct: team.quarterly_achievement }, { label: 'Annual', pct: team.annual_achievement }]
                          .map(({ label, pct }) => (
                            <div key={label} className="bg-white/20 rounded-lg px-3 py-2 text-center">
                              <div className="text-xs text-blue-200 mb-1">{label}</div>
                              <div className={`text-lg font-bold ${pct >= 100 ? 'text-green-300' : pct >= 75 ? 'text-yellow-300' : 'text-red-300'}`}>{pct}%</div>
                            </div>
                          ))}
                      </div>
                    </div>

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
                                    {m.role === 'recruiter' && <span className="text-gray-300 mr-1">└</span>}{m.user_name}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${m.role === 'team_leader' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                                      {m.role === 'team_leader' ? 'TL' : 'Rec.'}
                                    </span>
                                  </td>
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
                                  <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded text-xs font-medium ${badge.color}`}>{badge.text}</span></td>
                                </tr>
                              )
                            })}
                            <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                              <td className="px-4 py-3 text-blue-900">Team Total</td>
                              <td /><td />
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
                              <td />
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
                            {m.role === 'recruiter' && <span className="text-gray-300 mr-1">└</span>}{m.user_name}
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
                      <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 font-bold border-t-2 border-blue-300">
                        <td className="px-4 py-3 text-blue-900 sticky left-0 bg-blue-50">ORG TOTAL</td>
                        <td /><td /><td />
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