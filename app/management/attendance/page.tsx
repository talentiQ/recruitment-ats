'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'today' | 'report' | 'leaves' | 'holidays' | 'balances'

interface MemberRow {
  user_id: string; full_name: string; role: string; team_name: string
  sign_in_time: string | null; sign_out_time: string | null
  status: string | null; hours_worked: number | null
  is_late_arrival: boolean; is_half_day: boolean
  present_days: number; half_days: number; absent_days: number
  leave_days: number; lop_days: number; late_count: number
}

interface LeaveRequest {
  id: string; user_id: string; full_name: string; role: string; team_name: string
  leave_type: string; from_date: string; to_date: string
  total_days: number; reason: string; status: string
  applied_to_name: string; created_at: string
  is_sandwich: boolean
}

interface Holiday {
  id: string; date: string; name: string; is_optional: boolean
}

interface BalanceRow {
  user_id: string; full_name: string; role: string; team_name: string
  pl_total: number; pl_used: number; pl_available: number
  el_available: number; el_used: number; lop_days: number
  birthday_leave_granted: boolean; birthday_leave_used: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIST(d: Date) { return new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })) }
function todayIST() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
function formatTime(ts: string | null) {
  if (!ts) return '—'
  return toIST(new Date(ts)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const STATUS_DOT: Record<string, { color: string; bg: string; label: string }> = {
  present:  { color: '#15803d', bg: '#f0fdf4', label: 'Present' },
  half_day: { color: '#92400e', bg: '#fefce8', label: 'Half Day' },
  absent:   { color: '#dc2626', bg: '#fef2f2', label: 'Absent' },
  leave:    { color: '#2563eb', bg: '#eff6ff', label: 'On Leave' },
  lop:      { color: '#9d174d', bg: '#fdf2f8', label: 'LOP' },
  holiday:  { color: '#6d28d9', bg: '#f5f3ff', label: 'Holiday' },
  weekend:  { color: '#64748b', bg: '#f8fafc', label: 'Weekend' },
  pending:  { color: '#047857', bg: '#ecfdf5', label: 'In Office' },
}

const ROLE_LABEL: Record<string, string> = {
  recruiter: 'Recruiter', team_leader: 'TL', sr_team_leader: 'Sr. TL',
}

const LEAVE_LABELS: Record<string, string> = {
  PL: 'Paid Leave', EL: 'Earned Leave', LOP: 'Loss of Pay', BL: 'Birthday Leave',
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ManagementAttendancePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('today')
  const [loading, setLoading] = useState(true)

  // All members
  const [members, setMembers] = useState<MemberRow[]>([])
  const [allMemberIds, setAllMemberIds] = useState<string[]>([])
  const [teamFilter, setTeamFilter] = useState('all')
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])

  // Report
  const [reportMonth, setReportMonth] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const [reportData, setReportData] = useState<MemberRow[]>([])
  const [reportLoading, setReportLoading] = useState(false)

  // Leaves
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [leaveFilter, setLeaveFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')

  // Holidays
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [holidayLoading, setHolidayLoading] = useState(false)
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '', is_optional: false })
  const [savingHoliday, setSavingHoliday] = useState(false)
  const [showHolidayForm, setShowHolidayForm] = useState(false)

  // Balances
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [balanceLoading, setBalanceLoading] = useState(false)

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ud = localStorage.getItem('user')
    if (!ud) { router.push('/'); return }
    const u = JSON.parse(ud)
    if (!['management','ops_head','ceo','finance_head','system_admin'].includes(u.role)) {
      router.push('/'); return
    }
    setUser(u)
    loadAll()
  }, [])

  // ── Load all active staff ─────────────────────────────────────────────────
  const loadAll = async () => {
    setLoading(true)
    try {
      const { data: teamsRaw } = await supabase
        .from('teams').select('id,name').eq('is_active', true).order('name')
      setTeams(teamsRaw || [])

      const { data: usersRaw } = await supabase
        .from('users')
        .select('id,full_name,role,team_id,teams(name)')
        .in('role', ['recruiter','team_leader','sr_team_leader'])
        .eq('is_active', true)
        .order('full_name')

      const ids = (usersRaw || []).map((u: any) => u.id)
      setAllMemberIds(ids)

      if (!ids.length) { setLoading(false); return }

      const today = todayIST()
      const monthStart = `${today.slice(0, 7)}-01`

      const [logsRes, monthRes] = await Promise.all([
        supabase.from('attendance_logs').select('*').in('user_id', ids).eq('date', today),
        supabase.from('attendance_logs').select('user_id,status,is_late_arrival')
          .in('user_id', ids).gte('date', monthStart).lte('date', today),
      ])

      const logMap: Record<string, any> = {}
      ;(logsRes.data || []).forEach((l: any) => { logMap[l.user_id] = l })
      const mMap: Record<string, any> = {}
      ids.forEach(id => { mMap[id] = { present: 0, half: 0, absent: 0, leave: 0, lop: 0, late: 0 } })
      ;(monthRes.data || []).forEach((l: any) => {
        if (!mMap[l.user_id]) return
        if (['present','holiday'].includes(l.status)) mMap[l.user_id].present++
        else if (l.status === 'half_day') mMap[l.user_id].half++
        else if (l.status === 'absent')   mMap[l.user_id].absent++
        else if (l.status === 'leave')    mMap[l.user_id].leave++
        else if (l.status === 'lop')      mMap[l.user_id].lop++
        if (l.is_late_arrival) mMap[l.user_id].late++
      })

      setMembers((usersRaw || []).map((u: any) => {
        const log = logMap[u.id], ms = mMap[u.id] || {}
        return {
          user_id: u.id, full_name: u.full_name, role: u.role,
          team_name: (u.teams as any)?.name || '—',
          sign_in_time: log?.sign_in_time || null, sign_out_time: log?.sign_out_time || null,
          status: log?.status || null, hours_worked: log?.hours_worked || null,
          is_late_arrival: log?.is_late_arrival || false, is_half_day: log?.is_half_day || false,
          present_days: ms.present || 0, half_days: ms.half || 0,
          absent_days: ms.absent || 0, leave_days: ms.leave || 0,
          lop_days: ms.lop || 0, late_count: ms.late || 0,
        }
      }))
    } finally {
      setLoading(false)
    }
  }

  // ── Load monthly report ───────────────────────────────────────────────────
  const loadReport = useCallback(async (ids: string[], month: string) => {
    if (!ids.length) return
    setReportLoading(true)
    const [yr, mo] = month.split('-').map(Number)
    const start = `${yr}-${String(mo).padStart(2, '0')}-01`
    const end = new Date(yr, mo, 0).toISOString().slice(0, 10)

    const [logsRes, usersRes] = await Promise.all([
      supabase.from('attendance_logs').select('user_id,status,is_late_arrival,hours_worked')
        .in('user_id', ids).gte('date', start).lte('date', end),
      supabase.from('users').select('id,full_name,role,teams(name)').in('id', ids),
    ])

    const agg: Record<string, any> = {}
    ids.forEach(id => { agg[id] = { present: 0, half: 0, absent: 0, leave: 0, lop: 0, late: 0, hours: 0 } })
    ;(logsRes.data || []).forEach((l: any) => {
      if (!agg[l.user_id]) return
      if (['present','holiday'].includes(l.status)) agg[l.user_id].present++
      else if (l.status === 'half_day') agg[l.user_id].half++
      else if (l.status === 'absent')   agg[l.user_id].absent++
      else if (l.status === 'leave')    agg[l.user_id].leave++
      else if (l.status === 'lop')      agg[l.user_id].lop++
      if (l.is_late_arrival) agg[l.user_id].late++
      agg[l.user_id].hours += l.hours_worked || 0
    })

    setReportData((usersRes.data || []).map((u: any) => ({
      user_id: u.id, full_name: u.full_name, role: u.role,
      team_name: (u.teams as any)?.name || '—',
      sign_in_time: null, sign_out_time: null, status: null,
      hours_worked: agg[u.id]?.hours || 0,
      is_late_arrival: false, is_half_day: false,
      present_days: agg[u.id]?.present || 0, half_days: agg[u.id]?.half || 0,
      absent_days: agg[u.id]?.absent || 0, leave_days: agg[u.id]?.leave || 0,
      lop_days: agg[u.id]?.lop || 0, late_count: agg[u.id]?.late || 0,
    })).sort((a, b) => a.team_name.localeCompare(b.team_name) || a.full_name.localeCompare(b.full_name)))
    setReportLoading(false)
  }, [])

  // ── Load leaves ───────────────────────────────────────────────────────────
  const loadLeaves = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    setLeaveLoading(true)
    const { data } = await supabase
      .from('leave_requests')
      .select('*,users!user_id(full_name,role,teams(name)),approver:applied_to(full_name)')
      .in('user_id', ids)
      .order('created_at', { ascending: false })
      .limit(100)
    setLeaveRequests((data || []).map((l: any) => ({
      ...l,
      full_name: l.users?.full_name || '—',
      role: l.users?.role || 'recruiter',
      team_name: l.users?.teams?.name || '—',
      applied_to_name: l.approver?.full_name || '—',
    })))
    setLeaveLoading(false)
  }, [])

  // ── Load holidays ─────────────────────────────────────────────────────────
  const loadHolidays = useCallback(async () => {
    setHolidayLoading(true)
    const { data } = await supabase.from('holidays').select('*').order('date')
    setHolidays(data || [])
    setHolidayLoading(false)
  }, [])

  // ── Load leave balances ───────────────────────────────────────────────────
  const loadBalances = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    setBalanceLoading(true)
    const year = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1
    const [balRes, usersRes] = await Promise.all([
      supabase.from('leave_balances').select('*').in('user_id', ids).eq('year', year),
      supabase.from('users').select('id,full_name,role,teams(name)').in('id', ids),
    ])
    const balMap: Record<string, any> = {}
    ;(balRes.data || []).forEach((b: any) => { balMap[b.user_id] = b })
    setBalances((usersRes.data || []).map((u: any) => {
      const b = balMap[u.id] || {}
      return {
        user_id: u.id, full_name: u.full_name, role: u.role,
        team_name: (u.teams as any)?.name || '—',
        pl_total: b.pl_total || 0, pl_used: b.pl_used || 0, pl_available: b.pl_available || 0,
        el_available: b.el_available || 0, el_used: b.el_used || 0,
        lop_days: b.lop_days || 0,
        birthday_leave_granted: b.birthday_leave_granted || false,
        birthday_leave_used: b.birthday_leave_used || false,
      }
    }).sort((a, b) => a.team_name.localeCompare(b.team_name) || a.full_name.localeCompare(b.full_name)))
    setBalanceLoading(false)
  }, [])

  useEffect(() => { if (tab === 'report' && allMemberIds.length) loadReport(allMemberIds, reportMonth) }, [tab, reportMonth, allMemberIds])
  useEffect(() => { if (tab === 'leaves' && allMemberIds.length) loadLeaves(allMemberIds) }, [tab, allMemberIds])
  useEffect(() => { if (tab === 'holidays') loadHolidays() }, [tab])
  useEffect(() => { if (tab === 'balances' && allMemberIds.length) loadBalances(allMemberIds) }, [tab, allMemberIds])

  // ── Add Holiday ───────────────────────────────────────────────────────────
  const handleAddHoliday = async () => {
    if (!holidayForm.date || !holidayForm.name) { alert('Date and name required'); return }
    setSavingHoliday(true)
    const { error } = await supabase.from('holidays').insert({
      date: holidayForm.date, name: holidayForm.name, is_optional: holidayForm.is_optional,
    })
    if (error) { alert('Failed: ' + error.message) }
    else {
      setHolidayForm({ date: '', name: '', is_optional: false })
      setShowHolidayForm(false)
      loadHolidays()
    }
    setSavingHoliday(false)
  }

  const handleDeleteHoliday = async (id: string, name: string) => {
    if (!confirm(`Delete holiday "${name}"?`)) return
    await supabase.from('holidays').delete().eq('id', id)
    setHolidays(h => h.filter(x => x.id !== id))
  }

  // ── Leave override (management can force-approve/reject) ──────────────────
  const handleLeaveOverride = async (id: string, action: 'approved' | 'rejected') => {
    if (!confirm(`${action === 'approved' ? 'Approve' : 'Reject'} this leave request?`)) return
    const { error } = await supabase.from('leave_requests').update({
      status: action, approved_by: user.id, approved_at: new Date().toISOString(),
    }).eq('id', id)
    if (!error) setLeaveRequests(prev => prev.map(lr => lr.id === id ? { ...lr, status: action } : lr))
  }

  // ── Excel export ──────────────────────────────────────────────────────────
  const exportExcel = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Attendance Report')
    ws.columns = [
      { header: 'Name', width: 22 }, { header: 'Role', width: 14 }, { header: 'Team', width: 18 },
      { header: 'Present', width: 10 }, { header: 'Half Days', width: 10 },
      { header: 'Absent', width: 10 }, { header: 'Leave', width: 10 },
      { header: 'LOP', width: 10 }, { header: 'Late', width: 10 },
      { header: 'Total Hrs', width: 12 }, { header: 'Eff. Days', width: 12 },
    ]
    reportData.forEach(r => ws.addRow([
      r.full_name, ROLE_LABEL[r.role] || r.role, r.team_name,
      r.present_days, r.half_days, r.absent_days, r.leave_days, r.lop_days, r.late_count,
      r.hours_worked ? Math.round((r.hours_worked as number) * 10) / 10 : 0,
      r.present_days + r.half_days * 0.5,
    ]))
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `Attendance_${reportMonth}_OrgWide.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  // ── Filtered views ────────────────────────────────────────────────────────
  const filteredMembers = teamFilter === 'all' ? members : members.filter(m => m.team_name === teams.find(t => t.id === teamFilter)?.name)
  const filteredLeaves  = leaveFilter === 'all' ? leaveRequests : leaveRequests.filter(l => l.status === leaveFilter)

  // ── Today summary ─────────────────────────────────────────────────────────
  const summary = {
    total:     members.length,
    signedIn:  members.filter(m => m.sign_in_time).length,
    signedOut: members.filter(m => m.sign_out_time).length,
    onLeave:   members.filter(m => m.status === 'leave').length,
    absent:    members.filter(m => !m.sign_in_time && !m.status).length,
    late:      members.filter(m => m.is_late_arrival).length,
    halfDay:   members.filter(m => m.is_half_day).length,
  }

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    </DashboardLayout>
  )

  const TCOLS = '170px 70px 100px 90px 90px 120px 80px 80px 80px'
  const RCOLS = '160px 70px 100px 70px 70px 70px 70px 70px 70px 80px 80px'

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60, fontFamily: "'Inter','Segoe UI',sans-serif" }}>

        {/* ── Header ── */}
        <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)', borderRadius: 16, padding: '24px 32px', marginBottom: 24, color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Management · Attendance Control</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>🏢 Organisation Attendance</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
            {/* KPI strip */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[
                { label: 'Total Staff', value: summary.total,     color: '#e2e8f0' },
                { label: 'In Office',   value: summary.signedIn,  color: '#4ade80' },
                { label: 'Signed Out',  value: summary.signedOut, color: '#93c5fd' },
                { label: 'On Leave',    value: summary.onLeave,   color: '#fbbf24' },
                { label: 'Not In',      value: summary.absent,    color: '#f87171' },
                { label: 'Late Today',  value: summary.late,      color: '#fb923c' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: 24, overflowX: 'auto' }}>
          {([
            { key: 'today',    label: "📍 Today" },
            { key: 'report',   label: '📋 Monthly Report' },
            { key: 'leaves',   label: `🏖 Leave Requests (${leaveRequests.filter(l => l.status === 'pending').length || ''})` },
            { key: 'holidays', label: '🗓 Holiday Calendar' },
            { key: 'balances', label: '⚖️ Leave Balances' },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding: '10px 22px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', color: tab === key ? '#2563eb' : '#6b7280', borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -2 }}>
              {label}
            </button>
          ))}
        </div>

        {/* ════ TODAY ════ */}
        {tab === 'today' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Team filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '12px 16px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Filter by Team:</span>
              <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
                style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
                <option value="all">All Teams</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <span style={{ fontSize: 13, color: '#6b7280' }}>Showing {filteredMembers.length} of {members.length}</span>
            </div>

            {/* Alerts */}
            {summary.late > 0 && (
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                ⏰ {summary.late} late arrival{summary.late !== 1 ? 's' : ''} today · {summary.halfDay} half day{summary.halfDay !== 1 ? 's' : ''}
              </div>
            )}

            {/* Today table */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: TCOLS, gap: 4, padding: '10px 16px', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <div>Member</div><div>Role</div><div>Team</div>
                <div>Sign In</div><div>Sign Out</div><div>Status</div>
                <div style={{ textAlign: 'center' }}>Hours</div>
                <div style={{ textAlign: 'center' }}>M.Present</div>
                <div style={{ textAlign: 'center' }}>Late</div>
              </div>

              {filteredMembers.map((m, i) => {
                const sc = m.status ? (STATUS_DOT[m.status] || STATUS_DOT.absent) : (m.sign_in_time ? STATUS_DOT.pending : STATUS_DOT.absent)
                return (
                  <div key={m.user_id} style={{ display: 'grid', gridTemplateColumns: TCOLS, gap: 4, alignItems: 'center', padding: '11px 16px', background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{m.full_name}</div>
                    <div><span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: m.role === 'team_leader' ? '#eff6ff' : m.role === 'sr_team_leader' ? '#fef2f2' : '#f0fdf4', color: m.role === 'team_leader' ? '#2563eb' : m.role === 'sr_team_leader' ? '#dc2626' : '#15803d', fontWeight: 600 }}>{ROLE_LABEL[m.role]}</span></div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{m.team_name}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>{formatTime(m.sign_in_time)}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>{formatTime(m.sign_out_time)}</div>
                    <div><span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, fontWeight: 700, background: sc.bg, color: sc.color }}>{m.is_late_arrival ? '⏰ ' : ''}{m.is_half_day ? '½ ' : ''}{sc.label}</span></div>
                    <div style={{ textAlign: 'center', fontSize: 13, color: '#6b7280' }}>{m.hours_worked ? `${Math.floor(m.hours_worked)}h ${Math.round((m.hours_worked - Math.floor(m.hours_worked)) * 60)}m` : '—'}</div>
                    <div style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb', fontSize: 15 }}>{m.present_days + m.half_days * 0.5}</div>
                    <div style={{ textAlign: 'center', fontSize: 13, color: m.late_count > 0 ? '#dc2626' : '#9ca3af', fontWeight: m.late_count > 0 ? 700 : 400 }}>{m.late_count || '—'}</div>
                  </div>
                )
              })}
              {!filteredMembers.length && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No members</div>}
            </div>
          </div>
        )}

        {/* ════ MONTHLY REPORT ════ */}
        {tab === 'report' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 20px', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => { const [y, m] = reportMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); setReportMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 16 }}>‹</button>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', minWidth: 150, textAlign: 'center' }}>{new Date(reportMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
                <button onClick={() => { const [y, m] = reportMonth.split('-').map(Number); const d = new Date(y, m, 1); setReportMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 16 }}>›</button>
              </div>
              <button onClick={exportExcel} style={{ padding: '9px 18px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>📥 Export Excel</button>
            </div>

            {reportLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading report…</div> : (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: RCOLS, gap: 4, padding: '10px 16px', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <div>Member</div><div>Role</div><div>Team</div>
                  {['Present','Half','Absent','Leave','LOP','Late','Total Hrs','Eff.Days'].map(h => <div key={h} style={{ textAlign: 'center' }}>{h}</div>)}
                </div>

                {reportData.map((r, i) => {
                  const eff = r.present_days + r.half_days * 0.5
                  return (
                    <div key={r.user_id} style={{ display: 'grid', gridTemplateColumns: RCOLS, gap: 4, alignItems: 'center', padding: '11px 16px', background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{r.full_name}</div>
                      <div><span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 100, background: r.role === 'team_leader' ? '#eff6ff' : '#f0fdf4', color: r.role === 'team_leader' ? '#2563eb' : '#15803d', fontWeight: 600 }}>{ROLE_LABEL[r.role]}</span></div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{r.team_name}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: '#15803d', fontSize: 14 }}>{r.present_days}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: '#92400e', fontSize: 14 }}>{r.half_days || '—'}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: r.absent_days > 0 ? '#dc2626' : '#9ca3af', fontSize: 14 }}>{r.absent_days || '—'}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb', fontSize: 14 }}>{r.leave_days || '—'}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: r.lop_days > 0 ? '#9d174d' : '#9ca3af', fontSize: 14 }}>{r.lop_days || '—'}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: r.late_count > 2 ? '#dc2626' : r.late_count > 0 ? '#92400e' : '#9ca3af', fontSize: 14 }}>{r.late_count || '—'}</div>
                      <div style={{ textAlign: 'center', fontSize: 12, color: '#6b7280' }}>{r.hours_worked ? Math.round((r.hours_worked as number) * 10) / 10 + 'h' : '—'}</div>
                      <div style={{ textAlign: 'center' }}><span style={{ fontWeight: 800, fontSize: 14, color: eff >= 20 ? '#15803d' : eff >= 15 ? '#2563eb' : '#dc2626' }}>{eff}</span></div>
                    </div>
                  )
                })}

                {/* Totals */}
                <div style={{ display: 'grid', gridTemplateColumns: RCOLS, gap: 4, alignItems: 'center', padding: '12px 16px', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', color: '#fff', fontWeight: 800 }}>
                  <div style={{ fontSize: 13 }}>ORG TOTAL</div><div /><div />
                  <div style={{ textAlign: 'center', color: '#4ade80' }}>{reportData.reduce((s, r) => s + r.present_days, 0)}</div>
                  <div style={{ textAlign: 'center', color: '#fbbf24' }}>{reportData.reduce((s, r) => s + r.half_days, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: '#f87171' }}>{reportData.reduce((s, r) => s + r.absent_days, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: '#93c5fd' }}>{reportData.reduce((s, r) => s + r.leave_days, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: '#f9a8d4' }}>{reportData.reduce((s, r) => s + r.lop_days, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: '#fbbf24' }}>{reportData.reduce((s, r) => s + r.late_count, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>—</div>
                  <div style={{ textAlign: 'center', color: '#4ade80' }}>{reportData.reduce((s, r) => s + r.present_days + r.half_days * 0.5, 0)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ LEAVE REQUESTS ════ */}
        {tab === 'leaves' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 8, background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '12px 16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Filter:</span>
              {(['all','pending','approved','rejected'] as const).map(f => (
                <button key={f} onClick={() => setLeaveFilter(f)}
                  style={{ padding: '6px 14px', border: `2px solid ${leaveFilter === f ? '#2563eb' : '#e5e7eb'}`, borderRadius: 8, background: leaveFilter === f ? '#eff6ff' : '#fff', color: leaveFilter === f ? '#2563eb' : '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                  {f} {f === 'pending' ? `(${leaveRequests.filter(l => l.status === 'pending').length})` : ''}
                </button>
              ))}
            </div>

            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#92400e' }}>
              ⚡ <strong>Management override:</strong> You can approve or reject any leave request directly, bypassing the TL approval flow. Use with care.
            </div>

            {leaveLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading…</div> : filteredLeaves.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb' }}>No {leaveFilter === 'all' ? '' : leaveFilter} leave requests</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredLeaves.map(lr => {
                  const sc: Record<string, { bg: string; color: string }> = { pending: { bg: '#fefce8', color: '#92400e' }, approved: { bg: '#f0fdf4', color: '#15803d' }, rejected: { bg: '#fef2f2', color: '#dc2626' }, cancelled: { bg: '#f8fafc', color: '#64748b' } }
                  const s = sc[lr.status] || sc.pending
                  return (
                    <div key={lr.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{lr.full_name}</span>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 100, background: '#f0fdf4', color: '#15803d', fontWeight: 600 }}>{ROLE_LABEL[lr.role] || lr.role}</span>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>{lr.team_name}</span>
                          {lr.is_sandwich && <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 7px', borderRadius: 100, fontWeight: 600 }}>🥪 Sandwich</span>}
                        </div>
                        <div style={{ fontSize: 13, color: '#374151', marginBottom: 2 }}>
                          <strong>{LEAVE_LABELS[lr.leave_type] || lr.leave_type}</strong> · {lr.total_days} day{lr.total_days !== 1 ? 's' : ''} · {lr.from_date} → {lr.to_date}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{lr.reason}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Sent to: {lr.applied_to_name}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ padding: '4px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
                          {lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}
                        </span>
                        {lr.status === 'pending' && (
                          <>
                            <button onClick={() => handleLeaveOverride(lr.id, 'approved')}
                              style={{ padding: '6px 14px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                              ✓ Approve
                            </button>
                            <button onClick={() => handleLeaveOverride(lr.id, 'rejected')}
                              style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                              ✕ Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ HOLIDAYS ════ */}
        {tab === 'holidays' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, color: '#6b7280' }}>
                Holidays are marked as <strong>Present</strong> for all staff. They apply to sandwich leave rule calculations.
              </div>
              <button onClick={() => setShowHolidayForm(f => !f)}
                style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {showHolidayForm ? '✕ Cancel' : '+ Add Holiday'}
              </button>
            </div>

            {showHolidayForm && (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: '20px 24px' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 16 }}>Add Holiday</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Date *</label>
                    <input type="date" value={holidayForm.date} onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Holiday Name *</label>
                    <input type="text" value={holidayForm.name} onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Diwali, Independence Day"
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }} />
                  </div>
                  <button onClick={handleAddHoliday} disabled={savingHoliday}
                    style={{ padding: '9px 20px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: savingHoliday ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: savingHoliday ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                    {savingHoliday ? 'Saving…' : '✓ Add'}
                  </button>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={holidayForm.is_optional} onChange={e => setHolidayForm(f => ({ ...f, is_optional: e.target.checked }))} />
                  Optional holiday (employees may choose to work)
                </label>
              </div>
            )}

            {holidayLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading…</div> : holidays.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb' }}>
                No holidays added yet. Add company and public holidays above.
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 80px', gap: 4, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <div>Date</div><div>Holiday</div><div>Day</div><div>Type</div><div />
                </div>
                {holidays.map((h, i) => {
                  const d = new Date(h.date)
                  const isPast = new Date(h.date) < new Date()
                  return (
                    <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 100px 60px', gap: 4, alignItems: 'center', padding: '12px 16px', background: isPast ? '#fafafa' : '#fff', borderBottom: i < holidays.length - 1 ? '1px solid #f1f5f9' : 'none', opacity: isPast ? 0.7 : 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{h.date}</div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                        {h.name}
                        {!isPast && <span style={{ marginLeft: 8, fontSize: 10, background: '#f5f3ff', color: '#6d28d9', padding: '1px 7px', borderRadius: 100, fontWeight: 600 }}>Upcoming</span>}
                      </div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>{d.toLocaleDateString('en-IN', { weekday: 'long' })}</div>
                      <div>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, fontWeight: 600, background: h.is_optional ? '#fef3c7' : '#f5f3ff', color: h.is_optional ? '#92400e' : '#6d28d9' }}>
                          {h.is_optional ? 'Optional' : 'Mandatory'}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteHoliday(h.id, h.name)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, padding: 4 }}>🗑</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ LEAVE BALANCES ════ */}
        {tab === 'balances' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#2563eb' }}>
              ℹ️ Leave balances for FY {new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1}–{(new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1) + 1}. EL lapses on 31st March each year.
            </div>

            {balanceLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading…</div> : (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 70px 100px 80px 80px 80px 80px 80px 80px', gap: 4, padding: '10px 16px', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <div>Member</div><div>Role</div><div>Team</div>
                  <div style={{ textAlign: 'center' }}>PL Total</div>
                  <div style={{ textAlign: 'center' }}>PL Used</div>
                  <div style={{ textAlign: 'center' }}>PL Left</div>
                  <div style={{ textAlign: 'center' }}>EL Avail</div>
                  <div style={{ textAlign: 'center' }}>LOP</div>
                  <div style={{ textAlign: 'center' }}>🎂</div>
                </div>

                {balances.map((b, i) => (
                  <div key={b.user_id} style={{ display: 'grid', gridTemplateColumns: '180px 70px 100px 80px 80px 80px 80px 80px 80px', gap: 4, alignItems: 'center', padding: '12px 16px', background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{b.full_name}</div>
                    <div><span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 100, background: b.role === 'team_leader' ? '#eff6ff' : '#f0fdf4', color: b.role === 'team_leader' ? '#2563eb' : '#15803d', fontWeight: 600 }}>{ROLE_LABEL[b.role]}</span></div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{b.team_name}</div>
                    <div style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb', fontSize: 14 }}>{b.pl_total}</div>
                    <div style={{ textAlign: 'center', fontWeight: 700, color: '#92400e', fontSize: 14 }}>{b.pl_used || '—'}</div>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: b.pl_available > 0 ? '#15803d' : '#dc2626' }}>{b.pl_available}</span>
                    </div>
                    <div style={{ textAlign: 'center', fontWeight: 700, color: b.el_available > 0 ? '#6d28d9' : '#9ca3af', fontSize: 14 }}>{b.el_available || '—'}</div>
                    <div style={{ textAlign: 'center', fontWeight: 700, color: b.lop_days > 0 ? '#dc2626' : '#9ca3af', fontSize: 14 }}>{b.lop_days || '—'}</div>
                    <div style={{ textAlign: 'center', fontSize: 16 }}>
                      {b.birthday_leave_granted && !b.birthday_leave_used ? '🎂' : b.birthday_leave_used ? '✅' : '—'}
                    </div>
                  </div>
                ))}

                {/* Summary row */}
                <div style={{ display: 'grid', gridTemplateColumns: '180px 70px 100px 80px 80px 80px 80px 80px 80px', gap: 4, alignItems: 'center', padding: '12px 16px', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', color: '#fff', fontWeight: 800 }}>
                  <div style={{ fontSize: 13 }}>ORG TOTAL</div><div /><div />
                  <div style={{ textAlign: 'center', color: '#93c5fd' }}>{balances.reduce((s, b) => s + b.pl_total, 0)}</div>
                  <div style={{ textAlign: 'center', color: '#fbbf24' }}>{balances.reduce((s, b) => s + b.pl_used, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: '#4ade80' }}>{balances.reduce((s, b) => s + b.pl_available, 0)}</div>
                  <div style={{ textAlign: 'center', color: '#c4b5fd' }}>{balances.reduce((s, b) => s + b.el_available, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: '#f87171' }}>{balances.reduce((s, b) => s + b.lop_days, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>—</div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}