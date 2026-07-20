'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

type Tab = 'today' | 'report' | 'leaves'

interface MemberAttendance {
  user_id: string; full_name: string; role: string
  sign_in_time: string | null; sign_out_time: string | null
  status: string | null; hours_worked: number | null
  is_late_arrival: boolean; is_half_day: boolean
  present_days: number; half_days: number; absent_days: number
  leave_days: number; lop_days: number; late_count: number
}

interface LeaveRequest {
  id: string; user_id: string; full_name: string; role: string
  leave_type: string; from_date: string; to_date: string
  total_days: number; half_day: boolean; reason: string
  status: string; created_at: string
}

function toIST(d: Date) { return new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })) }
function todayIST() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
function formatTime(ts: string | null) {
  if (!ts) return '—'
  return toIST(new Date(ts)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function formatHours(h: number | null) {
  if (!h) return '—'
  return `${Math.floor(h)}h ${Math.round((h - Math.floor(h)) * 60)}m`
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

export default function SrTLAttendancePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('today')
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<MemberAttendance[]>([])
  const [allMemberIds, setAllMemberIds] = useState<string[]>([])
  const [reportMonth, setReportMonth] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const [reportData, setReportData] = useState<MemberAttendance[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [leaveLoading, setLeaveLoading] = useState(false)

  useEffect(() => {
    const ud = localStorage.getItem('user')
    if (!ud) { router.push('/'); return }
    const u = JSON.parse(ud)
    if (!['sr_team_leader','management','ops_head','ceo','system_admin'].includes(u.role)) {
      router.push('/'); return
    }
    setUser(u)
    loadTeam(u)
  }, [])

  const loadTeam = async (u: any) => {
    setLoading(true)
    try {
      const { data: tls } = await supabase
        .from('users').select('id,full_name,role').eq('reports_to', u.id).eq('is_active', true)
      const tlIds = (tls || []).map((t: any) => t.id)

      let recruiters: any[] = []
      if (tlIds.length > 0) {
        const { data: recs } = await supabase
          .from('users').select('id,full_name,role').in('reports_to', tlIds).eq('is_active', true)
        recruiters = recs || []
      }

      const allMembers = [...(tls || []), ...recruiters]
      const ids = allMembers.map((m: any) => m.id)
      setAllMemberIds(ids)
      if (ids.length === 0) { setLoading(false); return }

      const today = todayIST()
      const monthStart = `${today.slice(0, 7)}-01`

      const [logsRes, monthRes] = await Promise.all([
        supabase.from('attendance_logs').select('*').in('user_id', ids).eq('date', today),
        supabase.from('attendance_logs').select('user_id,status,is_late_arrival').in('user_id', ids).gte('date', monthStart).lte('date', today),
      ])

      const logMap: Record<string, any> = {}
      ;(logsRes.data || []).forEach((l: any) => { logMap[l.user_id] = l })
      const mMap: Record<string, any> = {}
      allMembers.forEach((m: any) => { mMap[m.id] = { present: 0, half: 0, absent: 0, leave: 0, lop: 0, late: 0 } })
      ;(monthRes.data || []).forEach((l: any) => {
        if (!mMap[l.user_id]) return
        if (['present','holiday'].includes(l.status)) mMap[l.user_id].present++
        else if (l.status === 'half_day') mMap[l.user_id].half++
        else if (l.status === 'absent')   mMap[l.user_id].absent++
        else if (l.status === 'leave')    mMap[l.user_id].leave++
        else if (l.status === 'lop')      mMap[l.user_id].lop++
        if (l.is_late_arrival) mMap[l.user_id].late++
      })

      setMembers(allMembers.map((m: any) => {
        const log = logMap[m.id], ms = mMap[m.id] || {}
        return {
          user_id: m.id, full_name: m.full_name, role: m.role,
          sign_in_time: log?.sign_in_time || null, sign_out_time: log?.sign_out_time || null,
          status: log?.status || null, hours_worked: log?.hours_worked || null,
          is_late_arrival: log?.is_late_arrival || false, is_half_day: log?.is_half_day || false,
          present_days: ms.present || 0, half_days: ms.half || 0,
          absent_days: ms.absent || 0, leave_days: ms.leave || 0,
          lop_days: ms.lop || 0, late_count: ms.late || 0,
        }
      }).sort((a, b) => a.role === b.role ? a.full_name.localeCompare(b.full_name) : a.role === 'team_leader' ? -1 : 1))
    } finally {
      setLoading(false)
    }
  }

  const loadReport = useCallback(async (ids: string[], month: string) => {
    if (!ids.length) return
    setReportLoading(true)
    const [yr, mo] = month.split('-').map(Number)
    const start = `${yr}-${String(mo).padStart(2, '0')}-01`
    const end = new Date(yr, mo, 0).toISOString().slice(0, 10)

    const [logsRes, usersRes] = await Promise.all([
      supabase.from('attendance_logs').select('user_id,status,is_late_arrival,hours_worked').in('user_id', ids).gte('date', start).lte('date', end),
      supabase.from('users').select('id,full_name,role').in('id', ids),
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
      sign_in_time: null, sign_out_time: null, status: null,
      hours_worked: agg[u.id]?.hours || 0,
      is_late_arrival: false, is_half_day: false,
      present_days: agg[u.id]?.present || 0, half_days: agg[u.id]?.half || 0,
      absent_days: agg[u.id]?.absent || 0, leave_days: agg[u.id]?.leave || 0,
      lop_days: agg[u.id]?.lop || 0, late_count: agg[u.id]?.late || 0,
    })).sort((a, b) => a.role === b.role ? a.full_name.localeCompare(b.full_name) : a.role === 'team_leader' ? -1 : 1))
    setReportLoading(false)
  }, [])

  const loadLeaves = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    setLeaveLoading(true)
    const { data } = await supabase
      .from('leave_requests').select('*,users!user_id(full_name,role)')
      .in('user_id', ids).order('created_at', { ascending: false }).limit(50)
    setLeaveRequests((data || []).map((l: any) => ({ ...l, full_name: l.users?.full_name || '—', role: l.users?.role || 'recruiter' })))
    setLeaveLoading(false)
  }, [])

  useEffect(() => { if (tab === 'report' && allMemberIds.length) loadReport(allMemberIds, reportMonth) }, [tab, reportMonth, allMemberIds])
  useEffect(() => { if (tab === 'leaves' && allMemberIds.length) loadLeaves(allMemberIds) }, [tab, allMemberIds])

  const todaySummary = {
    signedIn:  members.filter(m => m.sign_in_time).length,
    signedOut: members.filter(m => m.sign_out_time).length,
    onLeave:   members.filter(m => m.status === 'leave').length,
    absent:    members.filter(m => !m.sign_in_time && !m.status).length,
    late:      members.filter(m => m.is_late_arrival).length,
  }

  const exportExcel = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Attendance')
    ws.columns = [
      { header: 'Name', width: 22 }, { header: 'Role', width: 14 },
      { header: 'Present', width: 10 }, { header: 'Half Days', width: 10 },
      { header: 'Absent', width: 10 }, { header: 'Leave', width: 10 },
      { header: 'LOP', width: 10 }, { header: 'Late', width: 10 },
      { header: 'Total Hrs', width: 12 }, { header: 'Eff. Days', width: 12 },
    ]
    reportData.forEach(r => ws.addRow([
      r.full_name, ROLE_LABEL[r.role] || r.role,
      r.present_days, r.half_days, r.absent_days, r.leave_days, r.lop_days, r.late_count,
      r.hours_worked ? Math.round((r.hours_worked as number) * 10) / 10 : 0,
      r.present_days + r.half_days * 0.5,
    ]))
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `Attendance_${reportMonth}_SrTL.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    </DashboardLayout>
  )

  const GCOLS = '180px 70px 90px 90px 110px 80px 80px 80px'
  const RCOLS = '180px 70px 80px 80px 80px 80px 80px 80px 80px 90px'

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60, fontFamily: "'Inter','Segoe UI',sans-serif" }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', borderRadius: 16, padding: '24px 32px', marginBottom: 24, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Sr. Team Leader · Attendance</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>📊 Team Attendance</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{members.length} team members</div>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {[
              { label: 'In Office', value: todaySummary.signedIn, color: '#4ade80' },
              { label: 'Signed Out', value: todaySummary.signedOut, color: '#93c5fd' },
              { label: 'On Leave', value: todaySummary.onLeave, color: '#fbbf24' },
              { label: 'Not In', value: todaySummary.absent, color: '#f87171' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
          {([
            { key: 'today', label: "📍 Today's Attendance" },
            { key: 'report', label: '📋 Monthly Report' },
            { key: 'leaves', label: '🏖 Leave Requests' },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ padding: '10px 24px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', color: tab === key ? '#2563eb' : '#6b7280', borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -2 }}>
              {label}
            </button>
          ))}
        </div>

        {/* TODAY */}
        {tab === 'today' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {todaySummary.late > 0 && (
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                ⏰ {todaySummary.late} late arrival{todaySummary.late !== 1 ? 's' : ''} today
              </div>
            )}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: GCOLS, gap: 4, padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <div>Member</div><div>Role</div><div>Sign In</div><div>Sign Out</div>
                <div>Status</div><div>Hours</div><div style={{ textAlign: 'center' }}>M.Present</div><div style={{ textAlign: 'center' }}>Late</div>
              </div>
              {members.map((m, i) => {
                const sc = m.status ? (STATUS_DOT[m.status] || STATUS_DOT.absent) : (m.sign_in_time ? STATUS_DOT.pending : STATUS_DOT.absent)
                return (
                  <div key={m.user_id} style={{ display: 'grid', gridTemplateColumns: GCOLS, gap: 4, alignItems: 'center', padding: '12px 16px', background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{m.full_name}</div>
                    <div><span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: m.role === 'team_leader' ? '#eff6ff' : '#f0fdf4', color: m.role === 'team_leader' ? '#2563eb' : '#15803d', fontWeight: 600 }}>{ROLE_LABEL[m.role]}</span></div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>{formatTime(m.sign_in_time)}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>{formatTime(m.sign_out_time)}</div>
                    <div><span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, fontWeight: 700, background: sc.bg, color: sc.color }}>{m.is_late_arrival && '⏰ '}{m.is_half_day && '½ '}{sc.label}</span></div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{formatHours(m.hours_worked)}</div>
                    <div style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb', fontSize: 15 }}>{m.present_days + m.half_days * 0.5}</div>
                    <div style={{ textAlign: 'center', fontSize: 13, color: m.late_count > 0 ? '#dc2626' : '#9ca3af', fontWeight: m.late_count > 0 ? 700 : 400 }}>{m.late_count || '—'}</div>
                  </div>
                )
              })}
              {!members.length && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No team members found</div>}
            </div>
          </div>
        )}

        {/* MONTHLY REPORT */}
        {tab === 'report' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => { const [y, m] = reportMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); setReportMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 16 }}>‹</button>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', minWidth: 140, textAlign: 'center' }}>{new Date(reportMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
                <button onClick={() => { const [y, m] = reportMonth.split('-').map(Number); const d = new Date(y, m, 1); setReportMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 16 }}>›</button>
              </div>
              <button onClick={exportExcel} style={{ padding: '8px 16px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>📥 Export Excel</button>
            </div>

            {reportLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading…</div> : (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: RCOLS, gap: 4, padding: '10px 16px', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <div>Member</div>
                  {['Present','Half Day','Absent','Leave','LOP','Late','Total Hrs','Eff. Days'].map(h => <div key={h} style={{ textAlign: 'center' }}>{h}</div>)}
                </div>
                {reportData.map((r, i) => {
                  const eff = r.present_days + r.half_days * 0.5
                  return (
                    <div key={r.user_id} style={{ display: 'grid', gridTemplateColumns: RCOLS, gap: 4, alignItems: 'center', padding: '12px 16px', background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{r.full_name}</div>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 100, background: r.role === 'team_leader' ? '#eff6ff' : '#f0fdf4', color: r.role === 'team_leader' ? '#2563eb' : '#15803d', fontWeight: 600 }}>{ROLE_LABEL[r.role]}</span>
                      </div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: '#15803d', fontSize: 15 }}>{r.present_days}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: '#92400e', fontSize: 15 }}>{r.half_days || '—'}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: r.absent_days > 0 ? '#dc2626' : '#9ca3af', fontSize: 15 }}>{r.absent_days || '—'}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: '#2563eb', fontSize: 15 }}>{r.leave_days || '—'}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: r.lop_days > 0 ? '#9d174d' : '#9ca3af', fontSize: 15 }}>{r.lop_days || '—'}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: r.late_count > 2 ? '#dc2626' : r.late_count > 0 ? '#92400e' : '#9ca3af', fontSize: 15 }}>{r.late_count || '—'}</div>
                      <div style={{ textAlign: 'center', fontSize: 13, color: '#6b7280' }}>{r.hours_worked ? Math.round((r.hours_worked as number) * 10) / 10 + 'h' : '—'}</div>
                      <div style={{ textAlign: 'center' }}><span style={{ fontWeight: 800, fontSize: 15, color: eff >= 20 ? '#15803d' : eff >= 15 ? '#2563eb' : '#dc2626' }}>{eff}</span></div>
                    </div>
                  )
                })}
                <div style={{ display: 'grid', gridTemplateColumns: RCOLS, gap: 4, alignItems: 'center', padding: '12px 16px', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', color: '#fff', fontWeight: 800 }}>
                  <div style={{ fontSize: 13 }}>TEAM TOTAL</div>
                  <div style={{ textAlign: 'center', color: '#4ade80' }}>{reportData.reduce((s, r) => s + r.present_days, 0)}</div>
                  <div style={{ textAlign: 'center', color: '#fbbf24' }}>{reportData.reduce((s, r) => s + r.half_days, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: '#f87171' }}>{reportData.reduce((s, r) => s + r.absent_days, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: '#93c5fd' }}>{reportData.reduce((s, r) => s + r.leave_days, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: '#f9a8d4' }}>{reportData.reduce((s, r) => s + r.lop_days, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: '#fbbf24' }}>{reportData.reduce((s, r) => s + r.late_count, 0) || '—'}</div>
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>—</div>
                  <div style={{ textAlign: 'center', color: '#4ade80' }}>{reportData.reduce((s, r) => s + r.present_days + r.half_days * 0.5, 0)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LEAVES */}
        {tab === 'leaves' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#2563eb' }}>
              ℹ️ Leaves are approved by each recruiter's direct TL. This view is read-only for Sr. TL.
            </div>
            {leaveLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading…</div> : leaveRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb' }}>No leave requests</div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {leaveRequests.map((lr, i) => {
                  const sc: Record<string, { bg: string; color: string }> = { pending: { bg: '#fefce8', color: '#92400e' }, approved: { bg: '#f0fdf4', color: '#15803d' }, rejected: { bg: '#fef2f2', color: '#dc2626' }, cancelled: { bg: '#f8fafc', color: '#64748b' } }
                  const s = sc[lr.status] || sc.pending
                  return (
                    <div key={lr.id} style={{ padding: '14px 20px', borderBottom: i < leaveRequests.length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{lr.full_name}</span>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 100, background: '#f0fdf4', color: '#15803d', fontWeight: 600 }}>{ROLE_LABEL[lr.role] || lr.role}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#374151' }}><strong>{lr.leave_type}</strong> · {lr.total_days} day{lr.total_days !== 1 ? 's' : ''} · {lr.from_date} → {lr.to_date}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{lr.reason}</div>
                      </div>
                      <span style={{ padding: '4px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}