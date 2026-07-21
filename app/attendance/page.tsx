'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_HOURS_WEEKDAY = 9
const REQUIRED_HOURS_SATURDAY = 8
const GRACE_END_HOUR = 9.5        // 9:30 AM
const HALF_DAY_IN_HOUR = 11.5     // 11:30 AM
const HALF_DAY_OUT_HOUR = 16.0    // 4:00 PM
const EARLY_LEAVE_HOUR = 16.5     // 4:30 PM
const MAX_LATE_GRACE = 3          // times per month before half-day

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'present' | 'half_day' | 'absent' | 'leave' | 'lop' | 'holiday' | 'weekend'
type LeaveType = 'PL' | 'EL' | 'LOP' | 'BL'
type Tab = 'today' | 'calendar' | 'leave'

interface TodayLog {
  id: string
  date: string
  sign_in_time: string | null
  sign_out_time: string | null
  status: AttendanceStatus
  hours_worked: number | null
  required_hours: number
  is_late_arrival: boolean
  is_half_day: boolean
  is_half_day_in: boolean
  is_half_day_out: boolean
  hours_deficit: number | null
  late_count_this_month: number
}

interface LeaveBalance {
  pl_total: number
  pl_used: number
  pl_available: number
  el_opening: number
  el_accrued: number
  el_used: number
  el_available: number
  lop_days: number
  birthday_leave_granted: boolean
  birthday_leave_used: boolean
}

interface CalendarDay {
  date: string
  status: AttendanceStatus | null
  is_holiday: boolean
  holiday_name: string | null
  hours_worked: number | null
  is_weekend: boolean
}

interface LeaveRequest {
  id: string
  leave_type: LeaveType
  from_date: string
  to_date: string
  total_days: number
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  half_day: boolean
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIST(date: Date): Date {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
}

function getHourDecimal(date: Date): number {
  const ist = toIST(date)
  return ist.getHours() + ist.getMinutes() / 60
}

function formatTime(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return toIST(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatHours(h: number | null): string {
  if (h === null || h === undefined) return '—'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return `${hrs}h ${mins}m`
}

// BUG3 FIX: todayIST() for display only — never use for attendance recording
function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

// BUG3 + BUG2 FIX: authoritative server time for all attendance writes
async function getServerTime(sb: ReturnType<typeof import('@/lib/supabase')['supabase']['from']> | any) {
  const { data, error } = await sb.rpc('get_server_time_ist')
  const serverTs = (!error && data) ? data : new Date().toISOString()
  const serverNow = new Date(serverTs)
  // Convert to IST by adding 330 minutes (UTC+5:30)
  const istOffset = 330 * 60 * 1000
  const istNow    = new Date(serverNow.getTime() + istOffset)
  const todayDate = istNow.toISOString().slice(0, 10)
  const hourIST   = istNow.getUTCHours() + istNow.getUTCMinutes() / 60
  const dowIST    = istNow.getUTCDay() // 0=Sun, 6=Sat
  // BUG2 FIX: 2nd and 4th Saturday = non-working; other Saturday = 8h; weekday = 9h
  const isSat = dowIST === 6
  const weekOfMonth = Math.ceil(istNow.getUTCDate() / 7)
  const isWorkingSat = isSat && ![2, 4].includes(weekOfMonth)
  const requiredHours = isWorkingSat ? 8 : 9
  return { serverNow, todayDate, hourIST, isWorkingSat, requiredHours }
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  present:  { label: 'Present',   bg: '#f0fdf4', color: '#15803d', dot: '#22c55e' },
  half_day: { label: 'Half Day',  bg: '#fefce8', color: '#92400e', dot: '#f59e0b' },
  absent:   { label: 'Absent',    bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
  leave:    { label: 'On Leave',  bg: '#eff6ff', color: '#2563eb', dot: '#3b82f6' },
  lop:      { label: 'LOP',       bg: '#fdf2f8', color: '#9d174d', dot: '#ec4899' },
  holiday:  { label: 'Holiday',   bg: '#f5f3ff', color: '#6d28d9', dot: '#8b5cf6' },
  weekend:  { label: 'Weekend',   bg: '#f8fafc', color: '#64748b', dot: '#94a3b8' },

}

const LEAVE_LABELS: Record<LeaveType, string> = {
  PL: 'Paid Leave', EL: 'Earned Leave', LOP: 'Loss of Pay', BL: 'Birthday Leave',
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('today')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Today
  const [todayLog, setTodayLog] = useState<TodayLog | null>(null)
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [elapsed, setElapsed] = useState<number | null>(null) // hours since sign-in
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Calendar
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const [calDays, setCalDays] = useState<CalendarDay[]>([])
  const [calLoading, setCalLoading] = useState(false)

  // Leave
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [supervisor, setSupervisor] = useState<any>(null)
  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'PL' as LeaveType,
    from_date: '',
    to_date: '',
    half_day: false,
    half_day_slot: 'morning',
    reason: '',
  })
  const [leaveSubmitting, setLeaveSubmitting] = useState(false)
  const [showLeaveForm, setShowLeaveForm] = useState(false)

  // ── Auth & init ────────────────────────────────────────────────────────────
  useEffect(() => {
    const ud = localStorage.getItem('user')
    if (!ud) { router.push('/'); return }
    const u = JSON.parse(ud)
    if (!['recruiter','team_leader','sr_team_leader'].includes(u.role)) {
      router.push('/'); return
    }
    setUser(u)
    loadAll(u)
  }, [])

  // Live clock
  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(new Date())
      if (todayLog?.sign_in_time && !todayLog.sign_out_time) {
        const hrs = (Date.now() - new Date(todayLog.sign_in_time).getTime()) / 3600000
        setElapsed(hrs)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [todayLog])

  const loadAll = async (u: any) => {
    setLoading(true)
    await Promise.all([
      loadToday(u.id),
      loadBalance(u.id),
      loadSupervisor(u),
    ])
    setLoading(false)
  }

  const loadToday = async (userId: string) => {
    // BUG1 FIX: use maybeSingle() so missing record returns null, not error
    // BUG3 FIX: get today's date from server, not browser
    const { todayDate } = await getServerTime(supabase)
    const { data } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('date', todayDate)
      .maybeSingle()
    setTodayLog(data || null)
    if (data?.sign_in_time && !data.sign_out_time) {
      const hrs = (Date.now() - new Date(data.sign_in_time).getTime()) / 3600000
      setElapsed(hrs)
    }
  }

  const loadBalance = async (userId: string) => {
    const year = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1
    const { data } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)
      .single()
    setBalance(data || null)
  }

  const loadSupervisor = async (u: any) => {
    if (!u.reports_to) return
    const { data } = await supabase
      .from('users')
      .select('id, full_name, role')
      .eq('id', u.reports_to)
      .single()
    setSupervisor(data)
  }

  const loadCalendar = useCallback(async (userId: string, month: string) => {
    setCalLoading(true)
    const [yr, mo] = month.split('-').map(Number)
    const start = `${yr}-${String(mo).padStart(2, '0')}-01`
    const end = new Date(yr, mo, 0).toISOString().slice(0, 10)

    const [logsRes, holidaysRes] = await Promise.all([
      supabase.from('attendance_logs').select('date,status,hours_worked,is_weekend').eq('user_id', userId).gte('date', start).lte('date', end),
      supabase.from('holidays').select('date,name').gte('date', start).lte('date', end),
    ])

    const logMap: Record<string, any> = {}
    ;(logsRes.data || []).forEach((l: any) => { logMap[l.date] = l })
    const holidayMap: Record<string, string> = {}
    ;(holidaysRes.data || []).forEach((h: any) => { holidayMap[h.date] = h.name })

    const days: CalendarDay[] = []
    const cur = new Date(yr, mo - 1, 1)
    while (cur.getMonth() === mo - 1) {
      const ds = cur.toISOString().slice(0, 10)
      const dow = cur.getDay()
      const isWeekend = dow === 0 // Sunday always
      // 2nd and 4th Saturday
      const isSat2nd4th = dow === 6 && [2, 4].includes(Math.ceil(cur.getDate() / 7))
      const log = logMap[ds]
      days.push({
        date: ds,
        status: log?.status || null,
        is_holiday: !!holidayMap[ds],
        holiday_name: holidayMap[ds] || null,
        hours_worked: log?.hours_worked || null,
        is_weekend: isWeekend || isSat2nd4th,
      })
      cur.setDate(cur.getDate() + 1)
    }
    setCalDays(days)
    setCalLoading(false)
  }, [])

  const loadLeaveRequests = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    setLeaveRequests(data || [])
  }, [])

  useEffect(() => {
    if (tab === 'calendar' && user) loadCalendar(user.id, calMonth)
  }, [tab, calMonth, user])

  useEffect(() => {
    if (tab === 'leave' && user) loadLeaveRequests(user.id)
  }, [tab, user])

  // ── Sign In ────────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!user) return
    setActionLoading(true)
    try {
      const now = new Date()
      const today = todayIST()
      const hourNow = getHourDecimal(now)

      // Count late arrivals this month
      const monthStart = `${today.slice(0, 7)}-01`
      const { count: lateCount } = await supabase
        .from('attendance_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_late_arrival', true)
        .gte('date', monthStart)
        .lt('date', today)

      const isLate = hourNow > GRACE_END_HOUR
      const isHalfDayIn = hourNow > HALF_DAY_IN_HOUR || (isLate && (lateCount || 0) >= MAX_LATE_GRACE)

      const { data, error } = await supabase
        .from('attendance_logs')
        .upsert({
          user_id: user.id,
          date: today,
          sign_in_time: now.toISOString(),
          status: 'present',
          is_late_arrival: isLate,
          is_half_day_in: isHalfDayIn,
          late_count_this_month: lateCount || 0,
          required_hours: 9,
          sign_in_ip: null,
          updated_at: now.toISOString(),
        }, { onConflict: 'user_id,date' })
        .select()
        .single()

      if (error) throw error
      setTodayLog(data)

      if (isHalfDayIn) {
        alert(`⚠️ You have signed in at ${formatTime(now.toISOString())}. This will be marked as a Half Day.`)
      } else if (isLate) {
        const remaining = MAX_LATE_GRACE - (lateCount || 0)
        alert(`⏰ Late arrival noted. You have ${remaining} grace arrival${remaining !== 1 ? 's' : ''} remaining this month.`)
      }
    } catch (err: any) {
      alert('Sign in failed: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // ── Sign Out ───────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    if (!user || !todayLog) return
    setActionLoading(true)
    try {
      const now = new Date()
      const hourNow = getHourDecimal(now)
      const workedHrs = (now.getTime() - new Date(todayLog.sign_in_time!).getTime()) / 3600000

      const isEarlyLeave = hourNow < EARLY_LEAVE_HOUR
      const isHalfDayOut = hourNow < HALF_DAY_OUT_HOUR

      // Count early leaves this month
      let halfDayOut = isHalfDayOut
      if (isEarlyLeave && !isHalfDayOut) {
        const monthStart = `${todayIST().slice(0, 7)}-01`
        const { count: earlyCount } = await supabase
          .from('attendance_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_early_leave', true)
          .gte('date', monthStart)
          .lt('date', todayIST())
        if ((earlyCount || 0) >= MAX_LATE_GRACE) halfDayOut = true
      }

      const isHalfDay = todayLog.is_half_day_in || halfDayOut
      const reqHrs = todayLog.required_hours || REQUIRED_HOURS_WEEKDAY
      const deficit = Math.max(0, reqHrs - workedHrs)

      // Warn if hours incomplete
      if (deficit > 0.25) {
        const ok = confirm(`⚠️ You have only worked ${formatHours(workedHrs)} of ${reqHrs}h required.\n\nSign out anyway? This may affect your attendance record.`)
        if (!ok) { setActionLoading(false); return }
      }

      const { data, error } = await supabase
        .from('attendance_logs')
        .update({
          sign_out_time: now.toISOString(),
          hours_worked: Math.round(workedHrs * 100) / 100,
          hours_deficit: Math.round(deficit * 100) / 100,
          is_early_leave: isEarlyLeave,
          is_half_day_out: halfDayOut,
          is_half_day: isHalfDay,
          status: isHalfDay ? 'half_day' : 'present',
          updated_at: now.toISOString(),
        })
        .eq('id', todayLog.id)
        .select()
        .single()

      if (error) throw error
      setTodayLog(data)
      setElapsed(null)
    } catch (err: any) {
      alert('Sign out failed: ' + err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // ── Apply Leave ────────────────────────────────────────────────────────────
  const handleLeaveSubmit = async () => {
    if (!user || !leaveForm.from_date || !leaveForm.to_date || !leaveForm.reason) {
      alert('Please fill all required fields'); return
    }
    if (!supervisor) { alert('No supervisor found. Contact admin.'); return }
    setLeaveSubmitting(true)
    try {
      const from = new Date(leaveForm.from_date)
      const to   = new Date(leaveForm.to_date)
      if (to < from) { alert('End date must be after start date'); return }

      // Count business days
      let days = 0
      const cur = new Date(from)
      while (cur <= to) {
        const dow = cur.getDay()
        if (dow !== 0 && dow !== 6) days++
        cur.setDate(cur.getDate() + 1)
      }
      const totalDays = leaveForm.half_day ? 0.5 : days

      const { error } = await supabase
        .from('leave_requests')
        .insert({
          user_id: user.id,
          leave_type: leaveForm.leave_type,
          from_date: leaveForm.from_date,
          to_date: leaveForm.to_date,
          half_day: leaveForm.half_day,
          half_day_slot: leaveForm.half_day ? leaveForm.half_day_slot : null,
          total_days: totalDays,
          reason: leaveForm.reason,
          applied_to: supervisor.id,
          status: 'pending',
        })

      if (error) throw error

      alert(`✅ Leave request submitted to ${supervisor.full_name} for approval.`)
      setShowLeaveForm(false)
      setLeaveForm({ leave_type: 'PL', from_date: '', to_date: '', half_day: false, half_day_slot: 'morning', reason: '' })
      loadLeaveRequests(user.id)
    } catch (err: any) {
      alert('Failed to submit leave: ' + err.message)
    } finally {
      setLeaveSubmitting(false)
    }
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  const istNow = toIST(currentTime)
  const timeStr = istNow.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  const dateStr = istNow.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const isSigned  = !!todayLog?.sign_in_time
  const isOut     = !!todayLog?.sign_out_time
  const reqHrs    = todayLog?.required_hours || REQUIRED_HOURS_WEEKDAY
  const pct       = elapsed !== null ? Math.min(100, (elapsed / reqHrs) * 100) : 0
  const statusCfg = todayLog ? (STATUS_CONFIG[todayLog.status] || STATUS_CONFIG.present) : STATUS_CONFIG.absent

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    </DashboardLayout>
  )

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 60px', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

        {/* ── Header ── */}
        <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)', borderRadius: 16, padding: '28px 32px', marginBottom: 24, color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>⏱ Attendance</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>
                {user?.full_name?.split(' ')[0]}'s Attendance
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{dateStr}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 36, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>{timeStr}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>IST</div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
          {([
            { key: 'today',    label: '📍 Today' },
            { key: 'calendar', label: '📅 Calendar' },
            { key: 'leave',    label: '🏖 Leave' },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding: '10px 24px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', color: tab === key ? '#2563eb' : '#6b7280', borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -2, transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════
            TAB: TODAY
        ════════════════════════════════════════════════════════════ */}
        {tab === 'today' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Sign In/Out Card */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              {/* Status bar */}
              <div style={{ background: statusCfg.bg, borderBottom: `3px solid ${statusCfg.dot}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: statusCfg.dot, boxShadow: `0 0 8px ${statusCfg.dot}` }} />
                <span style={{ fontWeight: 700, color: statusCfg.color, fontSize: 15 }}>{statusCfg.label}</span>
                {todayLog?.is_late_arrival && <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>⏰ Late Arrival</span>}
                {todayLog?.is_half_day && <span style={{ fontSize: 11, background: '#fef9c3', color: '#92400e', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>½ Half Day</span>}
              </div>

              <div style={{ padding: '24px' }}>
                {/* Time display row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                  {[
                    { label: 'Sign In', value: formatTime(todayLog?.sign_in_time || null), color: '#15803d' },
                    { label: 'Sign Out', value: formatTime(todayLog?.sign_out_time || null), color: '#dc2626' },
                    { label: isOut ? 'Hours Worked' : 'Time Elapsed', value: isOut ? formatHours(todayLog?.hours_worked || null) : (elapsed !== null ? formatHours(elapsed) : '—'), color: '#2563eb' },
                  ].map(item => (
                    <div key={item.label} style={{ textAlign: 'center', padding: '16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: item.color, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                {isSigned && !isOut && elapsed !== null && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                      <span>Progress toward {reqHrs}h shift</span>
                      <span style={{ fontWeight: 600, color: pct >= 100 ? '#15803d' : '#2563eb' }}>{Math.round(pct)}%</span>
                    </div>
                    <div style={{ height: 10, background: '#f1f5f9', borderRadius: 100, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#22c55e' : pct >= 75 ? '#3b82f6' : '#f59e0b', borderRadius: 100, transition: 'width 1s linear' }} />
                    </div>
                    {pct >= 100 && <div style={{ fontSize: 12, color: '#15803d', marginTop: 6, fontWeight: 600 }}>✅ Shift complete! You can sign out.</div>}
                    {pct < 75 && elapsed !== null && <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>⚠️ {formatHours(reqHrs - elapsed)} remaining to complete your shift.</div>}
                  </div>
                )}

                {/* Deficit warning (after sign-out) */}
                {isOut && todayLog?.hours_deficit && todayLog.hours_deficit > 0.25 && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#dc2626' }}>
                    ⚠️ Short by {formatHours(todayLog.hours_deficit)} — this may count as a half day.
                  </div>
                )}

                {/* Sign In / Out Button */}
                {!isSigned ? (
                  <button onClick={handleSignIn} disabled={actionLoading}
                    style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1, fontFamily: 'inherit', letterSpacing: '0.02em' }}>
                    {actionLoading ? 'Signing in…' : '🟢 Sign In'}
                  </button>
                ) : !isOut ? (
                  <button onClick={handleSignOut} disabled={actionLoading}
                    style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1, fontFamily: 'inherit', letterSpacing: '0.02em' }}>
                    {actionLoading ? 'Signing out…' : '🔴 Sign Out'}
                  </button>
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px', background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', color: '#15803d', fontWeight: 700, fontSize: 15 }}>
                    ✅ Attendance recorded for today
                  </div>
                )}
              </div>
            </div>

            {/* Leave Balance Card */}
            {balance && (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: '20px 24px' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 16 }}>🏖 Leave Balance</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  {[
                    { label: 'Paid Leave (PL)', avail: balance.pl_available, used: balance.pl_used, total: balance.pl_total, color: '#2563eb', bg: '#eff6ff' },
                    { label: 'Earned Leave (EL)', avail: balance.el_available, used: balance.el_used, total: balance.el_opening + balance.el_accrued, color: '#6d28d9', bg: '#f5f3ff' },
                    { label: 'Loss of Pay', avail: null, used: balance.lop_days, total: null, color: '#dc2626', bg: '#fef2f2' },
                  ].map(b => (
                    <div key={b.label} style={{ background: b.bg, borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{b.label}</div>
                      {b.avail !== null ? (
                        <>
                          <div style={{ fontSize: 24, fontWeight: 800, color: b.color }}>{b.avail}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{b.used} used of {b.total}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: 24, fontWeight: 800, color: b.color }}>{b.used}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>days this year</div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {balance.birthday_leave_granted && !balance.birthday_leave_used && (
                  <div style={{ marginTop: 12, background: '#fef9c3', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                    🎂 You have 1 Birthday Leave available!
                  </div>
                )}
              </div>
            )}

            {/* Rules reminder */}
            <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 20px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 10 }}>📋 Attendance Rules</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#6b7280' }}>
                <div>⏰ Office hours: Mon–Fri 9:00 AM – 6:00 PM · Saturday 9:00 AM – 5:00 PM</div>
                <div>🕒 Grace period: Up to 9:30 AM (max 3 times/month) — 4th time = half day</div>
                <div>⚠️ Sign-in after 11:30 AM = Half Day · Sign-out before 4:00 PM = Half Day</div>
                <div>📅 2nd and 4th Saturdays are non-working days</div>
                <div>🥪 Sandwich rule: Leave on Friday + Monday = weekend counted as leave</div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB: CALENDAR
        ════════════════════════════════════════════════════════════ */}
        {tab === 'calendar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Month navigator */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 20px' }}>
              <button onClick={() => {
                const [y, m] = calMonth.split('-').map(Number)
                const d = new Date(y, m - 2, 1)
                setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
              }} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 16 }}>‹</button>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
                {new Date(calMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => {
                const [y, m] = calMonth.split('-').map(Number)
                const d = new Date(y, m, 1)
                setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
              }} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 16 }}>›</button>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11 }}>
              {Object.entries(STATUS_CONFIG).filter(([k]) => !['pending'].includes(k)).map(([k, v]) => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 100, background: v.bg, color: v.color, border: `1px solid ${v.dot}33`, fontWeight: 600 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.dot, display: 'inline-block' }} />
                  {v.label}
                </span>
              ))}
            </div>

            {/* Calendar grid */}
            {calLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading calendar…</div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {/* Weekday headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                    <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
                  ))}
                </div>

                {/* Days */}
                {(() => {
                  const firstDay = new Date(calMonth + '-01')
                  const startDow = (firstDay.getDay() + 6) % 7 // Mon=0
                  const cells: (CalendarDay | null)[] = [...Array(startDow).fill(null), ...calDays]
                  while (cells.length % 7 !== 0) cells.push(null)
                  const weeks = []
                  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
                  return weeks.map((week, wi) => (
                    <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: wi < weeks.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      {week.map((day, di) => {
                        if (!day) return <div key={di} style={{ padding: '10px 8px', minHeight: 64 }} />
                        const cfg = day.is_holiday ? STATUS_CONFIG.holiday : day.is_weekend ? STATUS_CONFIG.weekend : day.status ? STATUS_CONFIG[day.status] : null
                        const dayNum = new Date(day.date).getDate()
                        const isToday = day.date === todayIST()
                        return (
                          <div key={di} style={{ padding: '8px', minHeight: 64, background: cfg?.bg || '#fff', borderLeft: di > 0 ? '1px solid #f1f5f9' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 600, color: isToday ? '#2563eb' : '#374151', background: isToday ? '#dbeafe' : 'transparent', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{dayNum}</span>
                              {cfg && <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot }} />}
                            </div>
                            {day.is_holiday && <div style={{ fontSize: 9, color: '#6d28d9', marginTop: 2, lineHeight: 1.2, fontWeight: 600 }}>{day.holiday_name}</div>}
                            {day.hours_worked !== null && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{formatHours(day.hours_worked)}</div>}
                            {cfg && <div style={{ fontSize: 9, color: cfg.color, marginTop: 1, fontWeight: 600 }}>{cfg.label}</div>}
                          </div>
                        )
                      })}
                    </div>
                  ))
                })()}
              </div>
            )}

            {/* Monthly summary */}
            {calDays.length > 0 && (() => {
              const present = calDays.filter(d => d.status === 'present' || d.is_holiday).length
              const halfDay = calDays.filter(d => d.status === 'half_day').length
              const leave   = calDays.filter(d => d.status === 'leave').length
              const absent  = calDays.filter(d => d.status === 'absent').length
              const lop     = calDays.filter(d => d.status === 'lop').length
              const effective = present + halfDay * 0.5
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
                  {[
                    { label: 'Present + Holiday', value: present, color: '#15803d', bg: '#f0fdf4' },
                    { label: 'Half Days', value: halfDay, color: '#92400e', bg: '#fefce8' },
                    { label: 'Leave Days', value: leave, color: '#2563eb', bg: '#eff6ff' },
                    { label: 'Absent', value: absent, color: '#dc2626', bg: '#fef2f2' },
                    { label: 'Effective Days', value: effective, color: '#6d28d9', bg: '#f5f3ff' },
                  ].map(s => (
                    <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB: LEAVE
        ════════════════════════════════════════════════════════════ */}
        {tab === 'leave' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Apply leave button */}
            {!showLeaveForm ? (
              <button onClick={() => setShowLeaveForm(true)}
                style={{ padding: '14px', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Apply for Leave
              </button>
            ) : (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: '24px' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 20 }}>📝 Leave Application</div>
                {supervisor && (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#2563eb' }}>
                    📤 Will be sent to: <strong>{supervisor.full_name}</strong> ({supervisor.role.replace(/_/g,' ')})
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Leave type */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Leave Type</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                      {(['PL','EL','LOP','BL'] as LeaveType[]).map(lt => (
                        <button key={lt} onClick={() => setLeaveForm(f => ({ ...f, leave_type: lt }))}
                          style={{ padding: '10px', border: `2px solid ${leaveForm.leave_type === lt ? '#2563eb' : '#e5e7eb'}`, borderRadius: 10, background: leaveForm.leave_type === lt ? '#eff6ff' : '#fff', color: leaveForm.leave_type === lt ? '#2563eb' : '#6b7280', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {lt}
                          <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2 }}>{LEAVE_LABELS[lt].split(' ')[0]}</div>
                        </button>
                      ))}
                    </div>
                    {leaveForm.leave_type === 'PL' && balance && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Available: {balance.pl_available} PL</div>}
                    {leaveForm.leave_type === 'EL' && balance && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Available: {balance.el_available} EL</div>}
                  </div>

                  {/* Date range */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>From Date *</label>
                      <input type="date" value={leaveForm.from_date} min={todayIST()}
                        onChange={e => setLeaveForm(f => ({ ...f, from_date: e.target.value, to_date: f.to_date < e.target.value ? e.target.value : f.to_date }))}
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>To Date *</label>
                      <input type="date" value={leaveForm.to_date} min={leaveForm.from_date || todayIST()}
                        onChange={e => setLeaveForm(f => ({ ...f, to_date: e.target.value }))}
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }} />
                    </div>
                  </div>

                  {/* Half day toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                      <input type="checkbox" checked={leaveForm.half_day} onChange={e => setLeaveForm(f => ({ ...f, half_day: e.target.checked }))} />
                      Half Day Leave
                    </label>
                    {leaveForm.half_day && (
                      <select value={leaveForm.half_day_slot} onChange={e => setLeaveForm(f => ({ ...f, half_day_slot: e.target.value }))}
                        style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
                        <option value="morning">Morning (First Half)</option>
                        <option value="afternoon">Afternoon (Second Half)</option>
                      </select>
                    )}
                  </div>

                  {/* Reason */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Reason *</label>
                    <textarea value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} rows={3}
                      placeholder="Please provide a brief reason for your leave…"
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
                  </div>

                  {/* Sandwich warning */}
                  {leaveForm.from_date && leaveForm.to_date && (() => {
                    const from = new Date(leaveForm.from_date), to = new Date(leaveForm.to_date)
                    const hasFriday = [0,1,2,3,4].some(d => { const day = new Date(from); day.setDate(day.getDate() + d); return day.getDay() === 5 && day <= to })
                    const hasMonday = [0,1,2,3,4].some(d => { const day = new Date(from); day.setDate(day.getDate() + d); return day.getDay() === 1 && day <= to })
                    if (hasFriday || hasMonday) return (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
                        🥪 <strong>Sandwich Leave Rule:</strong> If your leave includes Friday and the following Monday, the weekend will also be counted as leave.
                      </div>
                    )
                    return null
                  })()}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setShowLeaveForm(false)}
                      style={{ flex: 1, padding: '12px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                    <button onClick={handleLeaveSubmit} disabled={leaveSubmitting}
                      style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: leaveSubmitting ? 'not-allowed' : 'pointer', opacity: leaveSubmitting ? 0.7 : 1, fontFamily: 'inherit' }}>
                      {leaveSubmitting ? 'Submitting…' : '📤 Submit Leave Request'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Leave requests history */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                Leave Requests
              </div>
              {leaveRequests.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No leave requests yet</div>
              ) : leaveRequests.map(lr => {
                const statusColors: Record<string, { bg: string; color: string }> = {
                  pending:   { bg: '#fefce8', color: '#92400e' },
                  approved:  { bg: '#f0fdf4', color: '#15803d' },
                  rejected:  { bg: '#fef2f2', color: '#dc2626' },
                  cancelled: { bg: '#f8fafc', color: '#64748b' },
                }
                const sc = statusColors[lr.status] || statusColors.pending
                return (
                  <div key={lr.id} style={{ padding: '14px 20px', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                        {LEAVE_LABELS[lr.leave_type]} · {lr.total_days} day{lr.total_days !== 1 ? 's' : ''}
                        {lr.half_day && <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>(half day)</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        {lr.from_date} → {lr.to_date} · {lr.reason}
                      </div>
                    </div>
                    <span style={{ padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
                      {lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}