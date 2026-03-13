// app/recruiter/interviews/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import InterviewScheduler from '@/components/InterviewScheduler'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Interview {
  id: string
  candidate_id: string
  interview_date: string
  interview_time: string
  interview_type: 'phone' | 'video' | 'in_person'
  interview_round: number
  status: string
  interviewer_name: string | null
  interviewer_email: string | null
  notes: string | null
  // Flag fields
  client_hold: boolean
  more_interviews_in_progress: boolean
  hold_notes: string | null
  cancel_reason: string | null
  reschedule_reason: string | null
  // Joined
  _candidateName: string
  _jobTitle: string
  _clientName: string
  _recruiterName: string
  _candidateStage: string
  _jobCode: string
  _jobId: string
}

type ViewMode = 'list' | 'day' | 'week' | 'month'
type TabMode = 'active' | 'past'

// Stages that move interview to "Past" tab
const PAST_STAGES = [
  'rejected', 'interview_rejected', 'hold', 'interview_completed',
  'offer_extended', 'offer_accepted', 'joined', 'renege',
  'dropped', 'renege_dropped', 'on_hold',
]

const TYPE_ICONS: Record<string, string>  = { phone: '📞', video: '🎥', in_person: '🏢' }
const TYPE_LABELS: Record<string, string> = { phone: 'Phone', video: 'Video', in_person: 'In Person' }
const TYPE_COLORS: Record<string, string> = {
  phone: 'bg-sky-500', video: 'bg-violet-500', in_person: 'bg-emerald-500',
}
const TYPE_LIGHT: Record<string, string> = {
  phone:     'bg-sky-50 border-sky-200 text-sky-800',
  video:     'bg-violet-50 border-violet-200 text-violet-800',
  in_person: 'bg-emerald-50 border-emerald-200 text-emerald-800',
}
const STATUS_COLORS: Record<string, string> = {
  scheduled:   'bg-blue-100 text-blue-800',
  completed:   'bg-green-100 text-green-800',
  cancelled:   'bg-red-100 text-red-800',
  rescheduled: 'bg-yellow-100 text-yellow-800',
  no_show:     'bg-gray-100 text-gray-700',
  on_hold:     'bg-orange-100 text-orange-800',
  rejected:    'bg-red-100 text-red-800',
}
const STAGE_LABELS: Record<string, string> = {
  sourced: 'Sourced', screening: 'Screening', shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview Scheduled', interview_completed: 'Interview Completed',
  interview_rejected: 'Interview Rejected',
  on_hold: 'On Hold', hold: 'Hold',
  offer_sent: 'Offer Sent', offer_extended: 'Offer Extended',
  negotiation: 'Negotiation', offer_accepted: 'Offer Accepted',
  joined: 'Joined', renege: 'Renege', dropped: 'Dropped',
  renege_dropped: 'Renege Dropped', rejected: 'Rejected',
}
const STAGE_COLORS: Record<string, string> = {
  sourced: 'bg-gray-100 text-gray-700', screening: 'bg-yellow-100 text-yellow-800',
  shortlisted: 'bg-cyan-100 text-cyan-800',
  interview_scheduled: 'bg-blue-100 text-blue-700', interview_completed: 'bg-blue-100 text-blue-800',
  interview_rejected: 'bg-red-100 text-red-800',
  on_hold: 'bg-orange-100 text-orange-800', hold: 'bg-gray-100 text-gray-700',
  offer_sent: 'bg-purple-100 text-purple-800', offer_extended: 'bg-indigo-100 text-indigo-800',
  negotiation: 'bg-amber-100 text-amber-800', offer_accepted: 'bg-violet-100 text-violet-800',
  joined: 'bg-green-100 text-green-800', renege: 'bg-orange-100 text-orange-800',
  dropped: 'bg-red-100 text-red-700', renege_dropped: 'bg-orange-100 text-orange-700',
  rejected: 'bg-red-200 text-red-900',
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)
const todayStr = isoDate(new Date())

const MIPBadge = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 border border-orange-300 text-orange-800 text-xs font-bold rounded-full">
    👥 More Interviews in Progress
  </span>
)
const ClientHoldBadge = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold rounded-full">
    ⏸️ Client Hold
  </span>
)

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RecruiterInterviewsPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [allInterviews, setAllInterviews] = useState<Interview[]>([])
  const [tab, setTab]           = useState<TabMode>('active')
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')

  const [calDate, setCalDate] = useState(new Date())

  const [selectedInterview, setSelectedInterview]   = useState<Interview | null>(null)
  const [schedulerInterview, setSchedulerInterview] = useState<Interview | null>(null)

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/'); return }
    const parsedUser = JSON.parse(userData)
    if (parsedUser.role !== 'recruiter') {
      alert('Access denied.'); router.push('/'); return
    }
    setUser(parsedUser)
    loadAll(parsedUser)
  }, [])

  // ── Data loader — Recruiter sees only their own interviews ────────────────
  const loadAll = async (currentUser?: any) => {
    const me = currentUser || user
    setLoading(true)
    try {
      if (!me) { setLoading(false); return }

      // Fetch interviews by recruiter_id
      const { data: raw } = await supabaseAdmin
        .from('interviews')
        .select('*, recruiter:recruiter_id(full_name)')
        .eq('recruiter_id', me.id)
        .order('interview_date', { ascending: true })
        .order('interview_time', { ascending: true })

      const candidateIds = [...new Set((raw || []).map((iv: any) => iv.candidate_id).filter(Boolean))]
      let candidateMap: Record<string, any> = {}
      if (candidateIds.length > 0) {
        const { data: cands } = await supabaseAdmin
          .from('candidates')
          .select('id, full_name, current_stage, assigned_to, more_interviews_in_progress, jobs(id, job_title, job_code, clients(company_name))')
          .in('id', candidateIds)
        ;(cands || []).forEach((c: any) => { candidateMap[c.id] = c })
      }

      const mapped: Interview[] = (raw || []).map((iv: any) => {
        const cand = candidateMap[iv.candidate_id]
        return {
          id:               iv.id,
          candidate_id:     iv.candidate_id,
          interview_date:   iv.interview_date,
          interview_time:   iv.interview_time || '',
          interview_type:   iv.interview_type || 'phone',
          interview_round:  iv.interview_round || 1,
          status:           iv.status || 'scheduled',
          interviewer_name: iv.interviewer_name || null,
          interviewer_email: iv.interviewer_email || null,
          notes:            iv.notes || null,
          client_hold:               iv.client_hold || false,
          more_interviews_in_progress: iv.more_interviews_in_progress || cand?.more_interviews_in_progress || false,
          hold_notes:       iv.hold_notes || null,
          cancel_reason:    iv.cancel_reason || null,
          reschedule_reason: iv.reschedule_reason || null,
          _candidateName:   cand?.full_name || '—',
          _jobTitle:        cand?.jobs?.job_title || '—',
          _jobCode:         cand?.jobs?.job_code || '',
          _clientName:      cand?.jobs?.clients?.company_name || '—',
          _recruiterName:   me.full_name,
          _candidateStage:  cand?.current_stage || '',
          _jobId:           cand?.jobs?.id || '',
        }
      })

      setAllInterviews(mapped)
    } catch (err) {
      console.error('Error loading interviews:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Split active vs past ───────────────────────────────────────────────────
  const { activeInterviews, pastInterviews } = useMemo(() => {
    const active: Interview[] = []
    const past: Interview[]   = []
    allInterviews.forEach(iv => {
      if (
        PAST_STAGES.includes(iv._candidateStage) ||
        ['completed', 'cancelled', 'no_show', 'rejected'].includes(iv.status)
      ) {
        past.push(iv)
      } else {
        active.push(iv)
      }
    })
    return { activeInterviews: active, pastInterviews: past }
  }, [allInterviews])

  // ── Apply filters ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let src = tab === 'active' ? activeInterviews : pastInterviews
    if (statusFilter !== 'all') src = src.filter(i => i.status === statusFilter)
    if (dateFrom) src = src.filter(i => i.interview_date >= dateFrom)
    if (dateTo)   src = src.filter(i => i.interview_date <= dateTo)
    return src
  }, [tab, activeInterviews, pastInterviews, statusFilter, dateFrom, dateTo])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = {
    total:    allInterviews.length,
    active:   activeInterviews.length,
    today:    activeInterviews.filter(i => i.interview_date === todayStr).length,
    tomorrow: activeInterviews.filter(i => {
      const t = new Date(); t.setDate(t.getDate() + 1); return i.interview_date === isoDate(t)
    }).length,
    thisWeek: activeInterviews.filter(i => {
      const d = new Date(i.interview_date)
      const ws = new Date(); ws.setDate(ws.getDate() - ws.getDay())
      const we = new Date(ws); we.setDate(ws.getDate() + 6)
      return d >= ws && d <= we
    }).length,
    past: pastInterviews.length,
  }

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const interviewsByDate = useMemo(() => {
    const map: Record<string, Interview[]> = {}
    filtered.forEach(iv => {
      if (!map[iv.interview_date]) map[iv.interview_date] = []
      map[iv.interview_date].push(iv)
    })
    return map
  }, [filtered])

  const monthStart  = new Date(calDate.getFullYear(), calDate.getMonth(), 1)
  const monthEnd    = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0)
  const calStartDay = monthStart.getDay()
  const monthDays: (Date | null)[] = []
  for (let i = 0; i < calStartDay; i++) monthDays.push(null)
  for (let d = 1; d <= monthEnd.getDate(); d++) monthDays.push(new Date(calDate.getFullYear(), calDate.getMonth(), d))

  const weekStart = new Date(calDate)
  weekStart.setDate(calDate.getDate() - calDate.getDay())
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d
  })

  const navCalendar = (dir: number) => {
    const d = new Date(calDate)
    if (viewMode === 'month')      d.setMonth(d.getMonth() + dir)
    else if (viewMode === 'week')  d.setDate(d.getDate() + dir * 7)
    else if (viewMode === 'day')   d.setDate(d.getDate() + dir)
    setCalDate(d)
  }

  const calTitle = () => {
    if (viewMode === 'month') return calDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    if (viewMode === 'week') {
      const end = new Date(weekStart); end.setDate(weekStart.getDate() + 6)
      return `${weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return calDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  const CalendarDayCell = ({ date, interviews }: { date: Date | null; interviews: Interview[] }) => {
    if (!date) return <div className="min-h-[100px] bg-gray-50 rounded-lg" />
    const ds = isoDate(date)
    const isToday = ds === todayStr
    const isPast  = ds < todayStr
    return (
      <div className={`min-h-[100px] rounded-lg p-2 border transition
        ${isToday ? 'border-blue-400 bg-blue-50' : isPast ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white hover:border-blue-200'}`}>
        <div className={`text-sm font-bold mb-1.5 w-7 h-7 flex items-center justify-center rounded-full
          ${isToday ? 'bg-blue-600 text-white' : isPast ? 'text-gray-400' : 'text-gray-700'}`}>
          {date.getDate()}
        </div>
        <div className="space-y-1">
          {interviews.slice(0, 3).map(iv => (
            <div key={iv.id} onClick={() => setSelectedInterview(iv)}
              className={`text-xs rounded px-1.5 py-0.5 truncate cursor-pointer font-medium text-white relative ${TYPE_COLORS[iv.interview_type]}`}>
              {iv.more_interviews_in_progress && <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-orange-400 rounded-full" />}
              {iv.interview_time ? iv.interview_time.slice(0, 5) + ' ' : ''}{iv._candidateName.split(' ')[0]}
            </div>
          ))}
          {interviews.length > 3 && (
            <div className="text-xs text-gray-500 font-medium px-1">+{interviews.length - 3} more</div>
          )}
        </div>
      </div>
    )
  }

  if (loading) return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
        <p className="text-gray-500 text-sm">Loading your interviews…</p>
      </div>
    </DashboardLayout>
  )

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-5 pb-8">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-xl p-6 text-white">
          <h1 className="text-3xl font-bold mb-1">🗓️ My Interviews</h1>
          <p className="text-teal-200">Your candidates · Schedule, manage & track</p>
        </div>

        {/* ── KPI Strip ── */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: 'Total',     value: kpis.total,    color: 'text-gray-900' },
            { label: 'Active',    value: kpis.active,   color: 'text-blue-700' },
            { label: 'Today',     value: kpis.today,    color: 'text-green-700' },
            { label: 'Tomorrow',  value: kpis.tomorrow, color: 'text-indigo-700' },
            { label: 'This Week', value: kpis.thisWeek, color: 'text-violet-700' },
            { label: 'Past',      value: kpis.past,     color: 'text-gray-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl p-4 shadow-sm text-center border border-gray-100">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="rejected">Rejected</option>
              <option value="no_show">No Show</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          {(statusFilter !== 'all' || dateFrom || dateTo) && (
            <button onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo('') }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              ✕ Clear
            </button>
          )}
          <div className="ml-auto text-sm text-gray-400">{filtered.length} interviews</div>
        </div>

        {/* ── Tabs + View Mode ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <button onClick={() => setTab('active')}
              className={`px-5 py-3 text-sm font-semibold transition flex items-center gap-2
                ${tab === 'active' ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              🟢 Active
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold
                ${tab === 'active' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-700'}`}>{kpis.active}</span>
            </button>
            <button onClick={() => setTab('past')}
              className={`px-5 py-3 text-sm font-semibold transition flex items-center gap-2 border-l border-gray-200
                ${tab === 'past' ? 'bg-gray-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              📁 Past
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold
                ${tab === 'past' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>{kpis.past}</span>
            </button>
          </div>

          <div className="flex bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {(['list', 'day', 'week', 'month'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-4 py-2.5 text-sm font-medium transition capitalize
                  ${viewMode === v ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}
                  ${v !== 'list' ? 'border-l border-gray-200' : ''}`}>
                {v === 'list' ? '☰ List' : v === 'day' ? '📅 Day' : v === 'week' ? '📆 Week' : '🗓️ Month'}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════════ LIST VIEW ══════════════════ */}
        {viewMode === 'list' && (
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                <div className="text-5xl mb-3">🗓️</div>
                <p className="text-gray-500 font-medium">No interviews found</p>
                <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              (() => {
                const grouped: Record<string, Interview[]> = {}
                filtered.forEach(iv => {
                  if (!grouped[iv.interview_date]) grouped[iv.interview_date] = []
                  grouped[iv.interview_date].push(iv)
                })
                return Object.entries(grouped)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, ivs]) => {
                    const d = new Date(date + 'T00:00:00')
                    const isToday    = date === todayStr
                    const isTomorrow = date === isoDate(new Date(Date.now() + 86400000))
                    const isPast     = date < todayStr
                    const label = isToday ? '🔵 Today' :
                      isTomorrow ? '🟢 Tomorrow' :
                      isPast ? '📁 ' + d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) :
                      d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                    return (
                      <div key={date}>
                        <div className="flex items-center gap-3 mb-2 mt-4">
                          <span className={`text-sm font-bold px-3 py-1 rounded-full
                            ${isToday ? 'bg-teal-600 text-white' : isTomorrow ? 'bg-green-100 text-green-800' : isPast ? 'bg-gray-100 text-gray-500' : 'bg-teal-50 text-teal-700'}`}>
                            {label}
                          </span>
                          <span className="text-xs text-gray-400">{ivs.length} interview{ivs.length !== 1 ? 's' : ''}</span>
                          <div className="flex-1 h-px bg-gray-100" />
                        </div>
                        <div className="space-y-2">
                          {ivs.sort((a, b) => (a.interview_time || '').localeCompare(b.interview_time || '')).map(iv => (
                            <div key={iv.id}
                              className={`bg-white rounded-xl border-l-4 border shadow-sm hover:shadow-md transition cursor-pointer p-4 flex items-start gap-4 flex-wrap
                                ${iv.interview_type === 'phone' ? 'border-l-sky-400' : iv.interview_type === 'video' ? 'border-l-violet-400' : 'border-l-emerald-400'}
                                ${iv.more_interviews_in_progress ? 'ring-1 ring-orange-200' : ''}
                                ${iv.client_hold ? 'ring-1 ring-amber-200' : ''}`}>

                              {/* Time */}
                              <div className="text-center min-w-[52px]">
                                <div className="text-sm font-bold text-gray-800">{iv.interview_time ? iv.interview_time.slice(0, 5) : '—'}</div>
                                <div className={`text-xs mt-0.5 px-1.5 py-0.5 rounded font-medium ${TYPE_LIGHT[iv.interview_type]}`}>
                                  {TYPE_ICONS[iv.interview_type]} {TYPE_LABELS[iv.interview_type]}
                                </div>
                              </div>
                              <div className="w-px self-stretch bg-gray-100 hidden sm:block" />

                              {/* Main info */}
                              <div className="flex-1 min-w-0" onClick={() => setSelectedInterview(iv)}>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-bold text-gray-900">{iv._candidateName}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[iv.status] || 'bg-gray-100 text-gray-600'}`}>
                                    {iv.status.replace(/_/g, ' ').toUpperCase()}
                                  </span>
                                  {tab === 'past' && iv._candidateStage && (
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STAGE_COLORS[iv._candidateStage] || 'bg-gray-100 text-gray-600'}`}>
                                      📍 {STAGE_LABELS[iv._candidateStage] || iv._candidateStage.replace(/_/g, ' ')}
                                    </span>
                                  )}
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Round {iv.interview_round}</span>
                                  {iv.more_interviews_in_progress && <MIPBadge />}
                                  {iv.client_hold && <ClientHoldBadge />}
                                </div>
                                <div className="text-sm text-gray-600">💼 {iv._jobTitle}{iv._jobCode ? ` (${iv._jobCode})` : ''}</div>
                                <div className="text-sm text-gray-500">🏢 {iv._clientName}</div>
                                {iv.cancel_reason && (
                                  <div className="text-xs text-red-600 mt-1">
                                    {iv.status === 'rejected' ? '❌ Rejected: ' : '❌ Cancelled: '}{iv.cancel_reason}
                                  </div>
                                )}
                                {iv.reschedule_reason && (
                                  <div className="text-xs text-yellow-700 mt-1">🔄 Rescheduled: {iv.reschedule_reason}</div>
                                )}
                                {iv.hold_notes && (
                                  <div className="text-xs text-orange-700 mt-1">⏸️ {iv.hold_notes}</div>
                                )}
                              </div>

                              {/* Right — action button */}
                              <div className="text-right text-sm min-w-[120px] flex flex-col gap-2 items-end">
                                {iv.interviewer_name && (
                                  <div className="text-xs text-gray-400">Int: {iv.interviewer_name}</div>
                                )}
                                {!['cancelled', 'completed', 'no_show', 'rejected'].includes(iv.status) && tab === 'active' && (
                                  <button
                                    onClick={e => { e.stopPropagation(); setSchedulerInterview(iv) }}
                                    className="text-xs px-2 py-1 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 font-medium transition">
                                    ⚙️ Manage
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })
              })()
            )}
          </div>
        )}

        {/* ══════════════════ CALENDAR VIEWS ══════════════════ */}
        {viewMode !== 'list' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <button onClick={() => navCalendar(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition font-bold text-lg">‹</button>
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-gray-900">{calTitle()}</h2>
                <button onClick={() => setCalDate(new Date())}
                  className="px-3 py-1 text-xs bg-teal-50 text-teal-700 rounded-full font-semibold hover:bg-teal-100 transition">Today</button>
              </div>
              <button onClick={() => navCalendar(1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition font-bold text-lg">›</button>
            </div>

            {viewMode === 'month' && (
              <div className="p-4">
                <div className="grid grid-cols-7 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="text-center text-xs font-bold text-gray-400 uppercase py-2">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {monthDays.map((date, idx) => (
                    <CalendarDayCell key={idx} date={date} interviews={date ? (interviewsByDate[isoDate(date)] || []) : []} />
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                  {Object.entries(TYPE_COLORS).map(([type, cls]) => (
                    <span key={type} className="flex items-center gap-1">
                      <span className={`w-3 h-3 rounded-sm ${cls}`} />
                      {TYPE_ICONS[type]} {TYPE_LABELS[type]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {viewMode === 'week' && (
              <div className="p-4">
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map(date => {
                    const ds = isoDate(date)
                    const isToday = ds === todayStr
                    const ivs = interviewsByDate[ds] || []
                    return (
                      <div key={ds}>
                        <div className={`text-center py-2 mb-2 rounded-lg text-sm font-bold ${isToday ? 'bg-teal-600 text-white' : 'text-gray-600'}`}>
                          <div className="text-xs font-medium opacity-75">{date.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                          <div className="text-lg">{date.getDate()}</div>
                          {ivs.length > 0 && (
                            <div className={`text-xs mt-0.5 ${isToday ? 'text-teal-100' : 'text-gray-400'}`}>
                              {ivs.length} interview{ivs.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5 min-h-[200px]">
                          {ivs.length === 0 ? (
                            <div className="text-center text-xs text-gray-300 pt-6">—</div>
                          ) : ivs.map(iv => (
                            <div key={iv.id} onClick={() => setSelectedInterview(iv)}
                              className={`rounded-lg p-2 cursor-pointer hover:opacity-90 transition text-white text-xs relative ${TYPE_COLORS[iv.interview_type]}`}>
                              {iv.more_interviews_in_progress && <span className="absolute top-1 right-1 w-2 h-2 bg-orange-300 rounded-full border border-white" />}
                              <div className="font-bold truncate">{iv._candidateName.split(' ')[0]}</div>
                              <div className="opacity-80 truncate">{iv.interview_time ? iv.interview_time.slice(0, 5) : ''}</div>
                              <div className="opacity-75 truncate text-[10px]">{iv._clientName}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {viewMode === 'day' && (
              <div className="p-4">
                <div className="text-center mb-4">
                  <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold
                    ${isoDate(calDate) === todayStr ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                    {calDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                </div>
                {(() => {
                  const ds = isoDate(calDate)
                  const ivs = interviewsByDate[ds] || []
                  if (ivs.length === 0) return (
                    <div className="text-center py-16 text-gray-400">
                      <div className="text-5xl mb-3">📭</div>
                      <p className="font-medium">No interviews on this day</p>
                    </div>
                  )
                  return (
                    <div className="space-y-3 max-w-2xl mx-auto">
                      {ivs.sort((a, b) => (a.interview_time || '').localeCompare(b.interview_time || '')).map(iv => (
                        <div key={iv.id} onClick={() => setSelectedInterview(iv)}
                          className={`rounded-xl border-l-4 border shadow-sm p-4 cursor-pointer hover:shadow-md transition flex items-start gap-4
                            ${iv.interview_type === 'phone' ? 'border-l-sky-400 bg-sky-50' : iv.interview_type === 'video' ? 'border-l-violet-400 bg-violet-50' : 'border-l-emerald-400 bg-emerald-50'}`}>
                          <div className="text-3xl">{TYPE_ICONS[iv.interview_type]}</div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-bold text-gray-900 text-base">{iv._candidateName}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[iv.status]}`}>
                                {iv.status.replace(/_/g, ' ').toUpperCase()}
                              </span>
                              {iv.more_interviews_in_progress && <MIPBadge />}
                              {iv.client_hold && <ClientHoldBadge />}
                            </div>
                            <div className="text-sm text-gray-700">⏰ {iv.interview_time || '—'} · {TYPE_LABELS[iv.interview_type]} · Round {iv.interview_round}</div>
                            <div className="text-sm text-gray-600 mt-1">💼 {iv._jobTitle} · 🏢 {iv._clientName}</div>
                            {iv.hold_notes && <div className="text-xs text-orange-700 mt-1">⏸️ {iv.hold_notes}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════════ DETAIL MODAL ════════════════ */}
      {selectedInterview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedInterview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className={`p-5 rounded-t-2xl text-white
              ${selectedInterview.interview_type === 'phone' ? 'bg-sky-600' :
                selectedInterview.interview_type === 'video' ? 'bg-violet-600' : 'bg-emerald-600'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{TYPE_ICONS[selectedInterview.interview_type]}</span>
                  <div>
                    <h2 className="text-xl font-bold">{selectedInterview._candidateName}</h2>
                    <p className="text-sm opacity-80">{TYPE_LABELS[selectedInterview.interview_type]} · Round {selectedInterview.interview_round}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedInterview(null)} className="text-white/70 hover:text-white text-2xl">✕</button>
              </div>
              {(selectedInterview.more_interviews_in_progress || selectedInterview.client_hold) && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {selectedInterview.more_interviews_in_progress && (
                    <span className="px-2 py-1 bg-orange-400/30 border border-orange-300/50 text-white text-xs rounded-full font-bold">
                      👥 More Interviews in Progress
                    </span>
                  )}
                  {selectedInterview.client_hold && (
                    <span className="px-2 py-1 bg-amber-400/30 border border-amber-300/50 text-white text-xs rounded-full font-bold">
                      ⏸️ Client Hold
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Date & Time</div>
                  <div className="font-semibold text-gray-800">
                    {new Date(selectedInterview.interview_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <div className="text-gray-600">{selectedInterview.interview_time || '—'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Status</div>
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[selectedInterview.status] || 'bg-gray-100 text-gray-600'}`}>
                    {selectedInterview.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  {selectedInterview._candidateStage && (
                    <div className="mt-1.5">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${STAGE_COLORS[selectedInterview._candidateStage] || 'bg-gray-100 text-gray-600'}`}>
                        📍 {STAGE_LABELS[selectedInterview._candidateStage] || selectedInterview._candidateStage.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Job</div>
                  <div className="font-medium text-gray-800">{selectedInterview._jobTitle}</div>
                  {selectedInterview._jobCode && <div className="text-xs text-gray-500">{selectedInterview._jobCode}</div>}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Client</div>
                  <div className="font-medium text-gray-800">{selectedInterview._clientName}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                  <div className="text-xs text-gray-400 uppercase font-semibold mb-1">Interviewer</div>
                  <div className="font-medium text-gray-800">{selectedInterview.interviewer_name || '—'}</div>
                  {selectedInterview.interviewer_email && (
                    <div className="text-xs text-gray-500">{selectedInterview.interviewer_email}</div>
                  )}
                </div>
              </div>

              {selectedInterview.hold_notes && (
                <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                  <div className="text-xs text-orange-700 font-semibold uppercase mb-1">⏸️ Hold Notes</div>
                  <p className="text-sm text-gray-700">{selectedInterview.hold_notes}</p>
                </div>
              )}
              {selectedInterview.cancel_reason && (
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <div className="text-xs text-red-700 font-semibold uppercase mb-1">
                    {selectedInterview.status === 'rejected' ? '❌ Rejection Reason' : '❌ Cancellation Reason'}
                  </div>
                  <p className="text-sm text-gray-700">{selectedInterview.cancel_reason}</p>
                </div>
              )}
              {selectedInterview.reschedule_reason && (
                <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                  <div className="text-xs text-yellow-700 font-semibold uppercase mb-1">🔄 Reschedule Reason</div>
                  <p className="text-sm text-gray-700">{selectedInterview.reschedule_reason}</p>
                </div>
              )}
              {selectedInterview.notes && (
                <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                  <div className="text-xs text-yellow-700 font-semibold uppercase mb-1">Notes</div>
                  <p className="text-sm text-gray-700">{selectedInterview.notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { router.push(`/recruiter/candidates/${selectedInterview.candidate_id}`); setSelectedInterview(null) }}
                  className="flex-1 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition">
                  View Candidate Profile →
                </button>
                {!['cancelled', 'completed', 'no_show', 'rejected'].includes(selectedInterview.status) && (
                  <button
                    onClick={() => { setSchedulerInterview(selectedInterview); setSelectedInterview(null) }}
                    className="px-4 py-2.5 bg-teal-50 border border-teal-300 text-teal-700 rounded-lg text-sm font-semibold hover:bg-teal-100 transition">
                    ⚙️ Manage
                  </button>
                )}
                <button onClick={() => setSelectedInterview(null)}
                  className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ MANAGE MODAL ════════════════ */}
      {schedulerInterview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSchedulerInterview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <InterviewScheduler
                candidateId={schedulerInterview.candidate_id}
                candidateName={schedulerInterview._candidateName}
                jobId={schedulerInterview._jobId}
                existingInterview={schedulerInterview}
                onScheduled={() => { setSchedulerInterview(null); loadAll() }}
                onCancel={() => setSchedulerInterview(null)}
              />
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  )
}