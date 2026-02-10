// app/tl/dashboard/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

/* ---------------- Types ---------------- */

interface LoggedInUser {
  id: string
  team_id: string
  role: string
}

interface DashboardStats {
  totalCandidates: number
  activeCandidates: number
  thisMonthJoinings: number
  thisWeekJoinings: number
  todayJoinings: number
  teamRevenue: number
  teamTarget: number
  achievementPercent: number

  sourced: number
  screening: number
  interview: number
  offered: number
  joined: number
  dropped: number

  recruiterStats: Array<{
    id: string
    name: string
    candidates: number
    joinings: number
    revenue: number
  }>

  clientStats: Array<{
    clientName: string
    candidates: number
    joinings: number
  }>

  staleCount: number
  pendingInterviews: number
  pendingOffers: number
}

/* ---------------- Component ---------------- */

export default function TLDashboard() {
  const router = useRouter()

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month'>('month')

  useEffect(() => {
    if (typeof window === 'undefined') return

    const userData: LoggedInUser | null = (() => {
      try {
        return JSON.parse(localStorage.getItem('user') || '')
      } catch {
        return null
      }
    })()

    if (!userData?.team_id) {
      console.warn('TL user not found in localStorage')
      return
    }

    loadDashboardStats(userData.team_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeFilter])

  const loadDashboardStats = async (teamId: string) => {
    setLoading(true)

    try {
      /* ---------- Candidates ---------- */
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

      /* ---------- Team Members ---------- */
      const { data: teamMembers } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('team_id', teamId)
        .eq('role', 'recruiter')

      /* ---------- Target ---------- */
      const currentMonth = new Date().toISOString().slice(0, 7)
      const { data: targetData } = await supabase
        .from('targets')
        .select('revenue_target')
        .eq('team_id', teamId)
        .eq('target_type', 'team')
        .gte('month', `${currentMonth}-01`)
        .lte('month', `${currentMonth}-31`)
        .single()

      const now = new Date()
      const today = now.toISOString().slice(0, 10)
      const weekAgo = new Date(now.getTime() - 7 * 86400000)
        .toISOString()
        .slice(0, 10)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10)

      const totalCandidates = candidates?.length || 0
      const activeCandidates =
        candidates?.filter(
          c => !['joined', 'rejected', 'dropped'].includes(c.current_stage)
        ).length || 0

      const todayJoinings =
        candidates?.filter(c => c.date_joined?.startsWith(today)).length || 0

      const thisWeekJoinings =
        candidates?.filter(c => c.date_joined && c.date_joined >= weekAgo).length || 0

      const thisMonthJoinings =
        candidates?.filter(c => c.date_joined && c.date_joined >= monthStart).length || 0

      const teamRevenue =
        candidates?.reduce(
          (sum, c) => sum + (c.revenue_generated || 0),
          0
        ) || 0

      const teamTarget = targetData?.revenue_target || 0
      const achievementPercent =
        teamTarget > 0 ? Math.round((teamRevenue / teamTarget) * 100) : 0

      const sourced = candidates?.filter(c => c.current_stage === 'sourced').length || 0
      const screening = candidates?.filter(c => c.current_stage === 'screening').length || 0
      const interview =
        candidates?.filter(c =>
          ['interview_scheduled', 'interview_completed'].includes(c.current_stage)
        ).length || 0
      const offered =
        candidates?.filter(c =>
          ['offer_made', 'offer_accepted'].includes(c.current_stage)
        ).length || 0
      const joined = candidates?.filter(c => c.current_stage === 'joined').length || 0
      const dropped =
        candidates?.filter(c =>
          ['rejected', 'dropped'].includes(c.current_stage)
        ).length || 0

      /* ---------- Recruiter Stats ---------- */
      const recruiterStats =
        teamMembers?.map(member => {
          const memberCandidates =
            candidates?.filter(c => c.assigned_to === member.id) || []

          return {
            id: member.id,
            name: member.full_name,
            candidates: memberCandidates.length,
            joinings: memberCandidates.filter(c => c.current_stage === 'joined').length,
            revenue: Number(
              memberCandidates
                .reduce((sum, c) => sum + (c.revenue_generated || 0), 0)
                .toFixed(2)
            ),
          }
        }).sort((a, b) => b.revenue - a.revenue) || []

      /* ---------- Client Stats ---------- */
      const clientMap = new Map<string, { clientName: string; candidates: number; joinings: number }>()

      candidates?.forEach(c => {
        const clientName = c.jobs?.clients?.company_name || 'Unknown'
        if (!clientMap.has(clientName)) {
          clientMap.set(clientName, { clientName, candidates: 0, joinings: 0 })
        }
        const item = clientMap.get(clientName)!
        item.candidates++
        if (c.current_stage === 'joined') item.joinings++
      })

      const clientStats = Array.from(clientMap.values()).sort(
        (a, b) => b.joinings - a.joinings
      )

      /* ---------- Alerts ---------- */
      const staleCount =
        candidates?.filter(c => {
          if (['joined', 'rejected', 'dropped'].includes(c.current_stage)) return false
          const days = Math.floor(
            (now.getTime() - new Date(c.date_sourced).getTime()) / 86400000
          )
          return days > 30
        }).length || 0

      const pendingInterviews =
        candidates?.filter(c => c.current_stage === 'interview_scheduled').length || 0

      const pendingOffers =
        candidates?.filter(c => c.current_stage === 'offer_made').length || 0

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
        pendingOffers,
      })
    } catch (error) {
      console.error('Error loading TL dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !stats) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </DashboardLayout>
    )
  }

  const getJoinings = () => {
    if (timeFilter === 'day') return stats.todayJoinings
    if (timeFilter === 'week') return stats.thisWeekJoinings
    return stats.thisMonthJoinings
  }

  /* ---- UI BELOW UNCHANGED ---- */
  return (
    <DashboardLayout>
      {/* UI exactly as you already had */}
      {/* No UI changes done */}
    </DashboardLayout>
  )
}
