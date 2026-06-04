// app/tl/dashboard/page.tsx - ENHANCED FOR TL OVERSIGHT
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import StaleCandidatesBanner from '@/components/StaleCandidatesBanner'
import TLRewardsSection from '@/components/TLRewardsSection'

// ─── Pro-rated target helpers (mirrors management dashboard) ─────────────────

function getActiveMonths(
  periodStart: string, periodEnd: string,
  lwd: string | null, targetEnd: string | null,
  totalMonths: number,
): number {
  if (!lwd && !targetEnd) return totalMonths
  const cutoffs = [lwd, targetEnd].filter(Boolean) as string[]
  if (cutoffs.length === 0) return totalMonths
  const effectiveCutoff = cutoffs.sort()[0]
  if (effectiveCutoff < periodStart) return 0
  if (effectiveCutoff >= periodEnd) return totalMonths
  const pStart  = new Date(periodStart)
  const cutDate = new Date(effectiveCutoff)
  const monthsActive = (cutDate.getFullYear() - pStart.getFullYear()) * 12
    + (cutDate.getMonth() - pStart.getMonth()) + 1
  return Math.max(0, Math.min(monthsActive, totalMonths))
}

function getProRatedTarget(
  monthlyTarget: number,
  periodStart: string, periodEnd: string,
  lwd: string | null, targetEnd: string | null,
  totalMonths: number,
): number {
  if (monthlyTarget <= 0) return 0
  return monthlyTarget * getActiveMonths(periodStart, periodEnd, lwd, targetEnd, totalMonths)
}

function calcAchievementPct(achieved: number, target: number): number {
  if (target <= 0) return 0
  return Math.round((achieved / target) * 100)
}

// ─────────────────────────────────────────────────────────────────────────────

const TERMINAL_STAGES = ['joined', 'screening_rejected', 'interview_rejected', 'offer_rejected', 'renege']
const ALL_REJECTED_STAGES = ['screening_rejected', 'interview_rejected', 'offer_rejected', 'renege']

interface RecruiterDetail {
  id: string
  name: string
  role: string
  is_exited: boolean          // ← NEW: flag for Alumni badge / rewards split

  // Targets & Achievement (now pro-rated)
  monthlyTarget: number
  monthlyRevenue: number
  monthlyAchievement: number
  quarterlyTarget: number
  quarterlyRevenue: number
  annualRevenue: number
  halfYearlyTarget: number
  halfYearlyAchievement: number
  annualTarget: number
  annualAchievement: number

  // Joinings
  monthlyJoinings: number
  totalJoined: number

  // Pipeline by stage
  sourced: number
  screening: number
  interviewScheduled: number
  interviewCompleted: number
  offerExtended: number
  offerAccepted: number
  documentation: number
  joined: number
  rejected: number
  renege: number
  onHold: number

  // Metrics
  totalCandidates: number
  activeCandidates: number
  conversionRate: number

  // Critical alerts
  staleCount: number
  pendingInterviews: number
  pendingOffers: number
}

interface TeamMember {
  id: string
  full_name: string
  role: string
  email: string
  reports_to: string | null
  hierarchy_level: number
  monthly_target: number
  quarterly_target: number
  annual_target: number
}

interface DashboardStats {
  teamMonthlyRevenue: number
  teamMonthlyTarget: number
  teamAchievement: number
  teamQuarterlyTarget: number
  teamQuarterlyRevenue: number
  teamAnnualRevenue: number
  teamAnnualTarget: number
  teamMonthlyJoinings: number
  totalCandidates: number
  activeCandidates: number
  totalSourced: number
  totalScreening: number
  totalInterview: number
  totalOffered: number
  totalJoined: number
  totalRejected: number
  recruiterDetails: RecruiterDetail[]
  exitedRecruiterDetails?: RecruiterDetail[]
  clientStats: Array<{ clientName: string; candidates: number; joinings: number }>
  todayJoinings: number
  thisWeekJoinings: number
  thisMonthJoinings: number
}

export default function TLDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedRecruiters, setExpandedRecruiters] = useState<Set<string>>(new Set())
  const [user, setUser] = useState<any>(null)

  const getUserTeamId = async (userId: string) => {
    const { data } = await supabase.from('users').select('team_id').eq('id', userId).single()
    return data?.team_id
  }

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadDashboardStats(parsedUser.id)
    }
  }, [])

  const toggleRecruiter = (recruiterId: string) => {
    const newExpanded = new Set(expandedRecruiters)
    if (newExpanded.has(recruiterId)) newExpanded.delete(recruiterId)
    else newExpanded.add(recruiterId)
    setExpandedRecruiters(newExpanded)
  }

  const loadDashboardStats = async (userId: string) => {
    setLoading(true)
    try {
      // ── Date ranges ──────────────────────────────────────────────────────────
      const now          = new Date()
      const currentYear  = now.getFullYear()
      const currentMonth = now.getMonth() + 1
      const today        = now.toISOString().slice(0, 10)
      const weekAgo      = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)
      const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)

      let businessQuarter: number
      if      (currentMonth >= 4  && currentMonth <= 6)  businessQuarter = 1
      else if (currentMonth >= 7  && currentMonth <= 9)  businessQuarter = 2
      else if (currentMonth >= 10 && currentMonth <= 12) businessQuarter = 3
      else                                                businessQuarter = 4

      let quarterStartMonth: number, quarterEndMonth: number
      let quarterStartYear: number, quarterEndYear: number
      if      (businessQuarter === 1) { quarterStartMonth = 4;  quarterEndMonth = 7;  quarterStartYear = currentYear; quarterEndYear = currentYear }
      else if (businessQuarter === 2) { quarterStartMonth = 7;  quarterEndMonth = 10; quarterStartYear = currentYear; quarterEndYear = currentYear }
      else if (businessQuarter === 3) { quarterStartMonth = 10; quarterEndMonth = 1;  quarterStartYear = currentYear; quarterEndYear = currentYear + 1 }
      else                            { quarterStartMonth = 1;  quarterEndMonth = 4;  quarterStartYear = currentYear; quarterEndYear = currentYear }

      const quarterStart = `${quarterStartYear}-${String(quarterStartMonth).padStart(2, '0')}-01`
      const quarterEnd   = `${quarterEndYear}-${String(quarterEndMonth).padStart(2, '0')}-01`

      const fiscalYearStart = currentMonth >= 4 ? currentYear : currentYear - 1
      const annualStart     = `${fiscalYearStart}-04-01`
      const annualEnd       = `${fiscalYearStart + 1}-04-01`

      // FY start (for fetching exited-this-FY members)
      const fyStartDate = annualStart

      // ── Step 1: Active team members via RPC ──────────────────────────────────
      const { data: teamMembersFromRpc, error: rpcError } = await supabase
        .rpc('get_user_and_direct_reports', { p_user_id: userId })

      if (rpcError) console.error('RPC error:', rpcError)

      const currentUser  = teamMembersFromRpc?.find((m: TeamMember) => m.id === userId)
      const rpcMemberIds = teamMembersFromRpc?.map((m: TeamMember) => m.id) || []

      // ── Step 2: Fetch exit fields for all RPC members ────────────────────────
      // RPC doesn't return last_working_date / target_end_date / is_active
      const { data: exitData } = await supabase
        .from('users')
        .select('id, last_working_date, target_end_date, is_active')
        .in('id', rpcMemberIds.length > 0 ? rpcMemberIds : ['__none__'])

      const exitMap: Record<string, any> = {}
      ;(exitData || []).forEach((u: any) => { exitMap[u.id] = u })

      // ── Step 3: Fetch exited-this-FY direct reports NOT in RPC result ────────
      // The RPC only returns active members; we add resigned ones separately
      const { data: exitedDirectReports } = await supabase
        .from('users')
        .select('id, full_name, role, reports_to, monthly_target, quarterly_target, annual_target, last_working_date, target_end_date, is_active')
        .eq('reports_to', userId)
        .eq('is_active', false)
        .gte('last_working_date', fyStartDate)
        .not('id', 'in', `(${rpcMemberIds.length > 0 ? rpcMemberIds.join(',') : 'null'})`)

      // ── Step 4: Combine all member IDs ───────────────────────────────────────
      const exitedIds = (exitedDirectReports || []).map((m: any) => m.id)
      const allMemberIds = [...rpcMemberIds, ...exitedIds]

      // Build a unified member map: RPC members enriched with exit data + exited members
      const allMembersMap: Record<string, any> = {}
      ;(teamMembersFromRpc || []).forEach((m: any) => {
        allMembersMap[m.id] = {
          ...m,
          ...(exitMap[m.id] || {}),
          is_exited: false,
        }
      })
      ;(exitedDirectReports || []).forEach((m: any) => {
        if (!allMembersMap[m.id]) {
          allMembersMap[m.id] = { ...m, is_exited: true }
        }
      })

      // ── Step 5: Fetch candidates for all members (active + exited) ───────────
      // Also include candidates where original_assigned_to matches (post-exit reassignment)
      const idsStr = allMemberIds.length > 0 ? allMemberIds.join(',') : 'null'

      const { data: candidatesByAssigned } = await supabase
        .from('candidates')
        .select(`*, jobs(clients(company_name)), users:assigned_to(id, full_name, role)`)
        .in('assigned_to', allMemberIds.length > 0 ? allMemberIds : ['__none__'])

      // Candidates reassigned away from this team — original credit stays here
      const { data: candidatesByOriginal } = await supabase
        .from('candidates')
        .select(`*, jobs(clients(company_name)), users:assigned_to(id, full_name, role)`)
        .in('original_assigned_to', allMemberIds.length > 0 ? allMemberIds : ['__none__'])
        .not('assigned_to', 'in', `(${idsStr})`)   // avoid duplicates

      // Deduplicated candidate list
      const candidateIdSet = new Set<string>()
      const candidates: any[] = []
      for (const c of [...(candidatesByAssigned || []), ...(candidatesByOriginal || [])]) {
        if (!candidateIdSet.has(c.id)) {
          candidateIdSet.add(c.id)
          candidates.push(c)
        }
      }

      // Revenue credit helper: original_assigned_to wins if set
      const creditHolder = (c: any): string => c.original_assigned_to || c.assigned_to

      // ── Step 6: Time-based joinings (team level) ─────────────────────────────
      const todayJoinings      = candidates.filter(c => c.date_joined?.startsWith(today)).length
      const thisWeekJoinings   = candidates.filter(c => c.date_joined && c.date_joined >= weekAgo).length
      const thisMonthJoinings  = candidates.filter(c => c.date_joined && c.date_joined >= monthStart).length

      const totalCandidates    = candidates.length
      const activeCandidates   = candidates.filter(c => !TERMINAL_STAGES.includes(c.current_stage)).length

      const totalSourced   = candidates.filter(c => c.current_stage === 'sourced').length
      const totalScreening = candidates.filter(c => c.current_stage === 'screening').length
      const totalInterview = candidates.filter(c => ['interview_scheduled','interview_completed'].includes(c.current_stage)).length
      const totalOffered   = candidates.filter(c => ['offer_extended','offer_accepted'].includes(c.current_stage)).length
      const totalJoined    = candidates.filter(c => c.current_stage === 'joined').length
      const totalRejected  = candidates.filter(c => ALL_REJECTED_STAGES.includes(c.current_stage)).length

      // ── Step 7: Per-member stats with pro-rated targets ───────────────────────
      const buildRecruiterDetail = (member: any): RecruiterDetail => {
        const memberId = member.id

        // Candidates credited to this member (via original or current assignment)
        const memberCandidates = candidates.filter(c => creditHolder(c) === memberId)

        // Pipeline counts use current assignment (not credit holder) for pipeline view
        const currentAssignedCandidates = candidates.filter(c => c.assigned_to === memberId)

        // Revenue: always via credit holder
        const monthlyRevenue = memberCandidates
          .filter(c => c.current_stage === 'joined' && c.date_joined && c.date_joined >= monthStart && c.date_joined < nextMonthStart)
          .reduce((sum, c) => sum + (c.revenue_earned || 0), 0)

        const quarterlyRevenue = memberCandidates
          .filter(c => c.current_stage === 'joined' && c.date_joined && c.date_joined >= quarterStart && c.date_joined < quarterEnd)
          .reduce((sum, c) => sum + (c.revenue_earned || 0), 0)

        const annualRevenue = memberCandidates
          .filter(c => c.current_stage === 'joined' && c.date_joined && c.date_joined >= annualStart && c.date_joined < annualEnd)
          .reduce((sum, c) => sum + (c.revenue_earned || 0), 0)

        const monthlyJoinings = memberCandidates
          .filter(c => c.current_stage === 'joined' && c.date_joined && c.date_joined >= monthStart && c.date_joined < nextMonthStart).length

        // ── Pro-rated target ──────────────────────────────────────────────────
        const baseTarget = member.monthly_target
          ? Number(member.monthly_target)
          : (['team_leader','sr_team_leader'].includes(member.role) ? 5 : 2)

        const lwd       = member.last_working_date ?? null
        const targetEnd = member.target_end_date   ?? null

        const monthlyTarget = getProRatedTarget(baseTarget, monthStart, nextMonthStart, lwd, targetEnd, 1)

        const quarterlyTarget = getProRatedTarget(
  baseTarget,
  annualStart,
  `${fiscalYearStart}-10-01`, // Q1 Apr-Jun
  lwd,
  targetEnd,
  3
)
        const halfYearlyTarget = getProRatedTarget(
  baseTarget,
  annualStart,
  `${fiscalYearStart}-10-01`, // H1 Apr-Sep
  lwd,
  targetEnd,
  6
)

const annualTarget = getProRatedTarget(
  baseTarget,
  annualStart,
  annualEnd,
  lwd,
  targetEnd,
  12
)

const halfYearlyAchievement = calcAchievementPct(
  quarterlyRevenue, // replace with H1 revenue if available
  halfYearlyTarget
)

const annualAchievement = calcAchievementPct(
  annualRevenue,
  annualTarget
)


        // Pipeline from current-assignment candidates
        const sourced            = currentAssignedCandidates.filter(c => c.current_stage === 'sourced').length
        const screening          = currentAssignedCandidates.filter(c => c.current_stage === 'screening').length
        const interviewScheduled = currentAssignedCandidates.filter(c => c.current_stage === 'interview_scheduled').length
        const interviewCompleted = currentAssignedCandidates.filter(c => c.current_stage === 'interview_completed').length
        const offerExtended      = currentAssignedCandidates.filter(c => c.current_stage === 'offer_extended').length
        const offerAccepted      = currentAssignedCandidates.filter(c => c.current_stage === 'offer_accepted').length
        const documentation      = currentAssignedCandidates.filter(c => c.current_stage === 'documentation').length
        const joined             = currentAssignedCandidates.filter(c => c.current_stage === 'joined').length
        const onHold             = currentAssignedCandidates.filter(c => c.current_stage === 'on_hold').length
        const rejected           = currentAssignedCandidates.filter(c => ['screening_rejected','interview_rejected','offer_rejected'].includes(c.current_stage)).length
        const renege             = currentAssignedCandidates.filter(c => c.current_stage === 'renege').length

        const totalCandidatesMember   = currentAssignedCandidates.length
        const activeCandidatesMember  = currentAssignedCandidates.filter(c => !TERMINAL_STAGES.includes(c.current_stage)).length
        const totalJoinedMember       = currentAssignedCandidates.filter(c => c.current_stage === 'joined').length
        const conversionRate          = totalCandidatesMember > 0 ? Math.round((totalJoinedMember / totalCandidatesMember) * 100) : 0

        const staleCount = currentAssignedCandidates.filter(c => {
          if (TERMINAL_STAGES.includes(c.current_stage)) return false
          return Math.floor((now.getTime() - new Date(c.date_sourced).getTime()) / 86400000) > 30
        }).length

        return {
          id:                   memberId,
          name:                 member.full_name,
          role:                 member.role,
          is_exited:            !(member.is_active ?? true),
          monthlyTarget,
          monthlyRevenue,
          monthlyAchievement:   calcAchievementPct(monthlyRevenue, monthlyTarget),
          quarterlyRevenue,
          quarterlyTarget,
          halfYearlyTarget,
          halfYearlyAchievement,
          annualTarget,
          annualRevenue,
          annualAchievement,
          monthlyJoinings,
          totalJoined:          totalJoinedMember,
          sourced, screening, interviewScheduled, interviewCompleted,
          offerExtended, offerAccepted, documentation, joined, rejected, renege, onHold,
          totalCandidates:      totalCandidatesMember,
          activeCandidates:     activeCandidatesMember,
          conversionRate,
          staleCount,
          pendingInterviews:    interviewScheduled,
          pendingOffers:        offerExtended,
        }
      }

      const allRecruiterDetails: RecruiterDetail[] = Object.values(allMembersMap)
        .map(buildRecruiterDetail)
        .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)

      // Split into active vs exited for separate display / rewards
      const recruiterDetails      = allRecruiterDetails.filter(r => !r.is_exited)
      const exitedRecruiterDetails = allRecruiterDetails.filter(r => r.is_exited)

      // ── Step 8: Team totals (all members including exited) ───────────────────
      const teamMonthlyRevenue   = allRecruiterDetails.reduce((s, r) => s + r.monthlyRevenue,   0)
      const teamMonthlyTarget    = allRecruiterDetails.reduce((s, r) => s + r.monthlyTarget,    0)
      const teamQuarterlyTarget  = allRecruiterDetails.reduce((s, r) => s + r.quarterlyTarget,  0)
      const teamQuarterlyRevenue = allRecruiterDetails.reduce((s, r) => s + r.quarterlyRevenue, 0)
      const teamAnnualRevenue    = allRecruiterDetails.reduce((s, r) => s + r.annualRevenue,    0)
      const teamAnnualTarget     = allRecruiterDetails.reduce((s, r) => s + r.annualTarget,     0)
      const teamMonthlyJoinings  = allRecruiterDetails.reduce((s, r) => s + r.monthlyJoinings,  0)
      const teamAchievement      = calcAchievementPct(teamMonthlyRevenue, teamMonthlyTarget)

      // ── Client stats ──────────────────────────────────────────────────────────
      const clientMap = new Map<string, { clientName: string; candidates: number; joinings: number }>()
      candidates.forEach(c => {
        const clientName = c.jobs?.clients?.company_name || 'Unknown'
        if (!clientMap.has(clientName)) clientMap.set(clientName, { clientName, candidates: 0, joinings: 0 })
        const cs = clientMap.get(clientName)!
        cs.candidates++
        if (c.current_stage === 'joined') cs.joinings++
      })
      const clientStats = Array.from(clientMap.values()).sort((a, b) => b.joinings - a.joinings)

      setStats({
        teamMonthlyRevenue, teamMonthlyTarget, teamAchievement,teamQuarterlyTarget,
        teamQuarterlyRevenue, teamAnnualTarget, teamAnnualRevenue, teamMonthlyJoinings,
        totalCandidates, activeCandidates,
        totalSourced, totalScreening, totalInterview, totalOffered, totalJoined, totalRejected,
        recruiterDetails,
        exitedRecruiterDetails,
        clientStats,
        todayJoinings, thisWeekJoinings, thisMonthJoinings,
      })
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatRevenue = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

  if (loading || !stats) {
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
      <div className="space-y-6">
        {/* Header */}
        <StaleCandidatesBanner userId={user?.id} userRole={user?.role} />
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Team Leader Dashboard</h2>
          <p className="text-gray-600">Detailed team performance monitoring & oversight</p>
        </div>

        {/* Team Summary Cards */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            📊 Team Performance Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className={`kpi-card ${stats.teamAchievement >= 100 ? 'kpi-success' : stats.teamAchievement >= 75 ? 'kpi-warning' : 'kpi-danger'}`}>
              <div className="kpi-title">Monthly Achievement</div>
              <div className="kpi-value">{stats.teamAchievement}%</div>
              <div className="kpi-sub text-xs">
                {formatRevenue(stats.teamMonthlyRevenue)} / {formatRevenue(stats.teamMonthlyTarget)}
              </div>
            </div>

            <div className="kpi-card kpi-success">
              <div className="kpi-title">Joinings (Month)</div>
              <div className="kpi-value">{stats.teamMonthlyJoinings}</div>
              <div className="kpi-sub text-xs">{stats.totalJoined} total</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-title">Quarterly Revenue</div>
              <div className="kpi-value text-lg">{formatRevenue(stats.teamQuarterlyRevenue)}</div>
              <div className="kpi-sub text-xs">Q{Math.ceil((new Date().getMonth() + 1) / 3)}</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-title">Annual Revenue</div>
              <div className="kpi-value text-lg">{formatRevenue(stats.teamAnnualRevenue)}</div>
              <div className="kpi-sub text-xs">FY {new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1}-{String((new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1) + 1).slice(-2)}</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-title">Active Pipeline</div>
              <div className="kpi-value">{stats.activeCandidates}</div>
              <div className="kpi-sub text-xs">{stats.totalCandidates} total</div>
            </div>
          </div>
        </div>

        {/* Rewards & Incentives */}
        <TLRewardsSection
          tlUserId={user?.id}
          recruiterDetails={[
            ...stats.recruiterDetails,
            ...(stats.exitedRecruiterDetails || []),
          ]}
        />

        {/* Detailed Team Member Performance */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            👥 Detailed Team Member Performance & Pipeline
          </h3>

          <div className="space-y-4">
            {stats.recruiterDetails.map((recruiter) => (
              <div key={recruiter.id} className="card">
                <div
                  className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-4 -m-4 rounded-lg"
                  onClick={() => toggleRecruiter(recruiter.id)}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="min-w-[200px]">
                      <div className="font-semibold text-gray-900">{recruiter.name}</div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        ['team_leader','sr_team_leader'].includes(recruiter.role)
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {recruiter.role === 'team_leader' ? 'Team Leader' :
                         recruiter.role === 'sr_team_leader' ? 'Sr Team Leader' : 'Recruiter'}
                      </span>
                    </div>

                    <div className="min-w-[260px]">
                    <div className="text-xs text-gray-500">Monthly</div>
                    <div className="font-semibold text-sm"> {formatRevenue(recruiter.monthlyTarget)} / {formatRevenue(recruiter.monthlyRevenue)}</div>
                    <div className="text-xs text-gray-500">Quarterly</div>
                    <div className="font-semibold text-sm"> {formatRevenue(recruiter.quarterlyTarget)} / {formatRevenue(recruiter.quarterlyRevenue)}</div>
                    <div className="text-xs text-gray-500">Annual</div>
                    <div className="font-semibold text-sm"> {formatRevenue(recruiter.annualTarget)} / {formatRevenue(recruiter.annualRevenue)}</div>      
  
                    
                    </div>

                    <div className="min-w-[100px]">
                      <div className="text-xs text-gray-500">Achievement</div>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        recruiter.monthlyAchievement >= 100
                          ? 'bg-green-100 text-green-800'
                          : recruiter.monthlyAchievement >= 75
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {recruiter.monthlyAchievement}%
                      </span>
                    </div>

                    <div className="flex gap-4 flex-1">
                      <div><div className="text-xs text-gray-500">Joinings</div><div className="font-bold text-green-600">{recruiter.monthlyJoinings}</div></div>
                      <div><div className="text-xs text-gray-500">Total</div><div className="font-bold text-gray-900">{recruiter.totalCandidates}</div></div>
                      <div><div className="text-xs text-gray-500">Active</div><div className="font-bold text-blue-600">{recruiter.activeCandidates}</div></div>
                      <div><div className="text-xs text-gray-500">Conv %</div><div className="font-bold text-purple-600">{recruiter.conversionRate}%</div></div>
                    </div>

                    {(recruiter.staleCount > 0 || recruiter.pendingInterviews > 0 || recruiter.pendingOffers > 0) && (
                      <div className="flex gap-2">
                        {recruiter.staleCount > 0 && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded">{recruiter.staleCount} stale</span>
                        )}
                        {recruiter.pendingInterviews > 0 && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded">{recruiter.pendingInterviews} interviews</span>
                        )}
                        {recruiter.pendingOffers > 0 && (
                          <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded">{recruiter.pendingOffers} offers</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-gray-400">{expandedRecruiters.has(recruiter.id) ? '▼' : '▶'}</div>
                </div>

                {expandedRecruiters.has(recruiter.id) && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Pipeline Breakdown by Stage</h4>
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                        <div className="bg-gray-50 p-3 rounded-lg"><div className="text-xs text-gray-600 mb-1">Sourced</div><div className="text-xl font-bold text-gray-900">{recruiter.sourced}</div></div>
                        <div className="bg-yellow-50 p-3 rounded-lg"><div className="text-xs text-yellow-700 mb-1">Sent to Client</div><div className="text-xl font-bold text-yellow-700">{recruiter.screening}</div></div>
                        <div className="bg-purple-50 p-3 rounded-lg"><div className="text-xs text-purple-700 mb-1">Interview Scheduled</div><div className="text-xl font-bold text-purple-700">{recruiter.interviewScheduled}</div></div>
                        <div className="bg-purple-50 p-3 rounded-lg"><div className="text-xs text-purple-700 mb-1">Interview Done</div><div className="text-xl font-bold text-purple-700">{recruiter.interviewCompleted}</div></div>
                        <div className="bg-indigo-50 p-3 rounded-lg"><div className="text-xs text-indigo-700 mb-1">Offer Extended</div><div className="text-xl font-bold text-indigo-700">{recruiter.offerExtended}</div></div>
                        <div className="bg-indigo-50 p-3 rounded-lg"><div className="text-xs text-indigo-700 mb-1">Offer Accepted</div><div className="text-xl font-bold text-indigo-700">{recruiter.offerAccepted}</div></div>
                        <div className="bg-blue-50 p-3 rounded-lg"><div className="text-xs text-blue-700 mb-1">Documentation</div><div className="text-xl font-bold text-blue-700">{recruiter.documentation}</div></div>
                        <div className="bg-green-50 p-3 rounded-lg"><div className="text-xs text-green-700 mb-1">Joined</div><div className="text-xl font-bold text-green-700">{recruiter.joined}</div></div>
                        <div className="bg-red-50 p-3 rounded-lg"><div className="text-xs text-red-700 mb-1">Rejected</div><div className="text-xl font-bold text-red-700">{recruiter.rejected}</div></div>
                        <div className="bg-orange-50 p-3 rounded-lg"><div className="text-xs text-orange-700 mb-1">Renege</div><div className="text-xl font-bold text-orange-700">{recruiter.renege}</div></div>
                        <div className="bg-gray-50 p-3 rounded-lg"><div className="text-xs text-gray-600 mb-1">On Hold</div><div className="text-xl font-bold text-gray-600">{recruiter.onHold}</div></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 mt-4">
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-3 rounded-lg border border-green-200"><div className="text-xs text-green-700 mb-1">Quarterly Revenue</div><div className="text-lg font-bold text-green-800">{formatRevenue(recruiter.quarterlyRevenue)}</div></div>
                      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-3 rounded-lg border border-blue-200"><div className="text-xs text-blue-700 mb-1">Annual Revenue</div><div className="text-lg font-bold text-blue-800">{formatRevenue(recruiter.annualRevenue)}</div></div>
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-3 rounded-lg border border-purple-200"><div className="text-xs text-purple-700 mb-1">Total Joined</div><div className="text-lg font-bold text-purple-800">{recruiter.totalJoined}</div></div>
                      <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-3 rounded-lg border border-orange-200"><div className="text-xs text-orange-700 mb-1">Conversion Rate</div><div className="text-lg font-bold text-orange-800">{recruiter.conversionRate}%</div></div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Team Total Summary */}
            <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div className="min-w-[200px]">
                    <div className="font-bold text-lg text-blue-900">TEAM TOTAL</div>
                  </div>
                  <div className="min-w-[150px]">
                    <div className="text-xs text-blue-700">Target / Revenue</div>
                    <div className="font-bold text-blue-900">{formatRevenue(stats.teamMonthlyTarget)} / {formatRevenue(stats.teamMonthlyRevenue)}</div>
                  </div>
                  <div className="min-w-[100px]">
                    <div className="text-xs text-blue-700">Achievement</div>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      stats.teamAchievement >= 100 ? 'bg-green-600 text-white' :
                      stats.teamAchievement >= 75  ? 'bg-yellow-600 text-white' : 'bg-red-600 text-white'
                    }`}>{stats.teamAchievement}%</span>
                  </div>
                  <div className="flex gap-4 flex-1">
                    <div><div className="text-xs text-blue-700">Joinings</div><div className="font-bold text-lg text-green-700">{stats.teamMonthlyJoinings}</div></div>
                    <div><div className="text-xs text-blue-700">Total</div><div className="font-bold text-lg text-blue-900">{stats.totalCandidates}</div></div>
                    <div><div className="text-xs text-blue-700">Active</div><div className="font-bold text-lg text-blue-700">{stats.activeCandidates}</div></div>
                   <div><div className="text-xs text-blue-700">Quarterly Target</div><div className="font-bold text-lg text-blue-900">{formatRevenue(stats.teamQuarterlyTarget)}</div></div>
                   <div><div className="text-xs text-blue-700">Quarterly</div><div className="font-bold text-lg text-blue-900">{formatRevenue(stats.teamQuarterlyRevenue)}</div></div>
                  <div><div className="text-xs text-blue-700">Annual Target</div><div className="font-bold text-lg text-blue-900">{formatRevenue(stats.teamAnnualTarget)}</div></div>
                  <div><div className="text-xs text-blue-700">Annual</div><div className="font-bold text-lg text-blue-900">{formatRevenue(stats.teamAnnualRevenue)}</div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Team Pipeline Overview */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🔄 Team Pipeline Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="card"><div className="text-sm text-gray-600 mb-1">Sourced</div><div className="text-2xl font-bold text-gray-900">{stats.totalSourced}</div></div>
            <div className="card bg-yellow-50"><div className="text-sm text-yellow-700 mb-1">Sent to Client</div><div className="text-2xl font-bold text-yellow-700">{stats.totalScreening}</div></div>
            <div className="card bg-purple-50"><div className="text-sm text-purple-700 mb-1">Interview</div><div className="text-2xl font-bold text-purple-700">{stats.totalInterview}</div></div>
            <div className="card bg-indigo-50"><div className="text-sm text-indigo-700 mb-1">Offered</div><div className="text-2xl font-bold text-indigo-700">{stats.totalOffered}</div></div>
            <div className="card bg-green-50"><div className="text-sm text-green-700 mb-1">Joined</div><div className="text-2xl font-bold text-green-700">{stats.totalJoined}</div></div>
            <div className="card bg-red-50"><div className="text-sm text-red-700 mb-1">Rejected / Renege</div><div className="text-2xl font-bold text-red-700">{stats.totalRejected}</div></div>
          </div>
        </div>

        {/* Team Member Wise Pipeline Breakdown */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Team Member Wise Pipeline Breakdown</h3>
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th className="text-center">Sourced</th>
                  <th className="text-center">Sent to Client</th>
                  <th className="text-center">Interview</th>
                  <th className="text-center">Offered</th>
                  <th className="text-center">Documentation</th>
                  <th className="text-center">Joined</th>
                  <th className="text-center">Rejected</th>
                  <th className="text-center">Renege</th>
                  <th className="text-center">On Hold</th>
                  <th className="text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.recruiterDetails.map((recruiter) => (
                  <tr key={recruiter.id}>
                    <td>
                      <div className="font-medium">{recruiter.name}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        ['team_leader','sr_team_leader'].includes(recruiter.role)
                          ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {recruiter.role === 'team_leader' ? 'TL' : recruiter.role === 'sr_team_leader' ? 'STL' : 'Recruiter'}
                      </span>
                    </td>
                    <td className="text-center"><span className="text-gray-900 font-medium">{recruiter.sourced}</span></td>
                    <td className="text-center"><span className={`font-medium ${recruiter.screening > 0 ? 'text-yellow-700' : 'text-gray-400'}`}>{recruiter.screening}</span></td>
                    <td className="text-center"><span className={`font-medium ${(recruiter.interviewScheduled + recruiter.interviewCompleted) > 0 ? 'text-purple-700' : 'text-gray-400'}`}>{recruiter.interviewScheduled + recruiter.interviewCompleted}</span></td>
                    <td className="text-center"><span className={`font-medium ${(recruiter.offerExtended + recruiter.offerAccepted) > 0 ? 'text-indigo-700' : 'text-gray-400'}`}>{recruiter.offerExtended + recruiter.offerAccepted}</span></td>
                    <td className="text-center"><span className={`font-medium ${recruiter.documentation > 0 ? 'text-blue-700' : 'text-gray-400'}`}>{recruiter.documentation}</span></td>
                    <td className="text-center"><span className={`px-2 py-1 rounded-full text-sm font-bold ${recruiter.joined > 0 ? 'bg-green-100 text-green-800' : 'text-gray-400'}`}>{recruiter.joined}</span></td>
                    <td className="text-center"><span className={`font-medium ${recruiter.rejected > 0 ? 'text-red-600' : 'text-gray-400'}`}>{recruiter.rejected}</span></td>
                    <td className="text-center"><span className={`font-medium ${recruiter.renege > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{recruiter.renege}</span></td>
                    <td className="text-center"><span className={`font-medium ${recruiter.onHold > 0 ? 'text-gray-600' : 'text-gray-400'}`}>{recruiter.onHold}</span></td>
                    <td className="text-center"><span className="font-bold text-gray-900">{recruiter.totalCandidates}</span></td>
                  </tr>
                ))}
                <tr className="bg-blue-50 font-bold border-t-2 border-blue-300">
                  <td>TEAM TOTAL</td>
                  <td className="text-center text-gray-900">{stats.totalSourced}</td>
                  <td className="text-center text-yellow-700">{stats.totalScreening}</td>
                  <td className="text-center text-purple-700">{stats.totalInterview}</td>
                  <td className="text-center text-indigo-700">{stats.totalOffered}</td>
                  <td className="text-center text-blue-700">{stats.recruiterDetails.reduce((s, r) => s + r.documentation, 0)}</td>
                  <td className="text-center"><span className="px-2 py-1 rounded-full bg-green-600 text-white text-sm">{stats.totalJoined}</span></td>
                  <td className="text-center text-red-600">{stats.recruiterDetails.reduce((s, r) => s + r.rejected, 0)}</td>
                  <td className="text-center text-orange-600">{stats.recruiterDetails.reduce((s, r) => s + r.renege, 0)}</td>
                  <td className="text-center text-gray-600">{stats.recruiterDetails.reduce((s, r) => s + r.onHold, 0)}</td>
                  <td className="text-center text-gray-900">{stats.totalCandidates}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Client Performance */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🏢 Client Wise Performance</h3>
          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="text-center">Candidates</th>
                  <th className="text-center">Joinings</th>
                  <th>Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {stats.clientStats.slice(0, 10).map((client, idx) => (
                  <tr key={idx}>
                    <td>{client.clientName}</td>
                    <td className="text-center">{client.candidates}</td>
                    <td className="text-center"><span className="badge-success">{client.joinings}</span></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div className="bg-green-600 h-2 rounded-full"
                            style={{ width: `${client.candidates > 0 ? (client.joinings / client.candidates) * 100 : 0}%` }} />
                        </div>
                        <span className="text-sm font-medium">
                          {client.candidates > 0 ? Math.round((client.joinings / client.candidates) * 100) : 0}%
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">⚡ Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <button onClick={() => router.push('/tl/candidates')} className="btn-primary text-center">View Team Pipeline</button>
            <button onClick={() => router.push('/tl/candidates/add')} className="btn-primary text-center">+ Add Candidate</button>
            <button onClick={() => router.push('/tl/candidates?filter=stale')} className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700">Review Stale Candidates</button>
            <button onClick={() => router.push('/tl/jobs')} className="bg-white border-2 border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:border-blue-500">Manage Jobs</button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}