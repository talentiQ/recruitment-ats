// app/management/jobs/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import { getStageBadge, getStageLabel } from '@/lib/pipelineStages'

// ─── Types ────────────────────────────────────────────────────────────────────

type JobStatus   = 'open' | 'in_progress' | 'on_hold' | 'closed'
type PipelineCat = 'not_started' | 'screening' | 'interview' | 'documentation' | 'offer' | 'filled'

interface StageCounts { [stage: string]: number }

interface JobWithStats {
  id: string
  job_code: string
  job_title: string
  department: string
  location: string
  experience_min: number
  experience_max: number
  min_ctc: number
  max_ctc: number
  positions: number
  positions_filled: number
  status: JobStatus
  priority: string
  created_at: string
  assigned_team_id: string | null
  client_id: string
  _clientName: string
  _teamName: string
  _srTlName: string
  _srTlId: string           // ← NEW: for Sr. TL filter
  _recruiterCount: number
  _daysOpen: number
  _candidateCount: number
  _activePipeline: number
  _stageCounts: StageCounts
  _pipelineCat: PipelineCat
  _revenueAtRisk: number
  _confirmedRevenue: number // offers accepted, reneges EXCLUDED
  _lastActivity: string | null
}

interface CandidateRow {
  id: string
  full_name: string
  phone: string
  current_stage: string
  expected_ctc: number
  assigned_to_name: string
  date_sourced: string | null
  last_activity_date: string | null
}

// ─── Stage funnel config ──────────────────────────────────────────────────────

const FUNNEL_STAGES = [
  { key: 'sourced',             label: 'CV Sourced',        color: 'bg-gray-400',    text: 'text-gray-700'   },
  { key: 'screening',           label: 'Sent to Client',    color: 'bg-yellow-400',  text: 'text-yellow-800' },
  { key: 'interview_scheduled', label: 'Interview Sched.',  color: 'bg-orange-400',  text: 'text-orange-800' },
  { key: 'interview_completed', label: 'Interview Done',    color: 'bg-orange-500',  text: 'text-orange-900' },
  { key: 'documentation',       label: 'Documentation',     color: 'bg-lime-500',    text: 'text-lime-900'   },
  { key: 'offer_extended',      label: 'Offer Extended',    color: 'bg-yellow-600',  text: 'text-yellow-900' },
  { key: 'offer_accepted',      label: 'Offer Accepted',    color: 'bg-green-500',   text: 'text-green-900'  },
  { key: 'joined',              label: 'Joined / Filled',   color: 'bg-green-700',   text: 'text-white'      },
]

const REJECTED_STAGES = ['screening_rejected','interview_rejected','offer_rejected','renege']

// ─── Pipeline category logic ──────────────────────────────────────────────────

function getPipelineCat(sc: StageCounts): PipelineCat {
  if ((sc['joined']                                              || 0) > 0) return 'filled'
  if ((sc['offer_extended']     || 0) + (sc['offer_accepted']   || 0) > 0) return 'offer'
  if ((sc['documentation']                                       || 0) > 0) return 'documentation'
  if ((sc['interview_scheduled']|| 0) + (sc['interview_completed']||0) > 0) return 'interview'
  if ((sc['screening']                                           || 0) > 0) return 'screening'
  return 'not_started'
}

// ─── KPI config ───────────────────────────────────────────────────────────────

const KPI_CONFIG: Record<PipelineCat | 'all' | 'filled_pos', {
  label: string; sub: string; bg: string; border: string; value_cls: string
}> = {
  all:          { label: 'Open Position Slots',  sub: 'sum of positions on open jobs', bg: 'bg-white',      border: 'border-gray-200',    value_cls: 'text-gray-900'  },
  not_started:  { label: '0 CV — Not Started',   sub: 'no candidates yet',             bg: 'bg-red-50',     border: 'border-red-400',     value_cls: 'text-red-700'   },
  screening:    { label: 'Screening Stage',       sub: 'CV sent to client',             bg: 'bg-yellow-50',  border: 'border-yellow-400',  value_cls: 'text-yellow-700'},
  interview:    { label: 'Interview Stage',       sub: 'active interviews',             bg: 'bg-orange-50',  border: 'border-orange-400',  value_cls: 'text-orange-700'},
  documentation:{ label: 'Documentation',         sub: 'pre-offer docs',                bg: 'bg-lime-50',    border: 'border-lime-400',    value_cls: 'text-lime-700'  },
  offer:        { label: 'Offer Stage',           sub: 'extended / accepted',           bg: 'bg-[#6b7c3d]/10',border:'border-[#6b7c3d]', value_cls: 'text-[#4a5729]' },
  filled:       { label: 'Filled',                sub: 'positions joined',              bg: 'bg-green-50',   border: 'border-green-600',   value_cls: 'text-green-800' },
  filled_pos:   { label: 'Filled',                sub: 'positions joined',              bg: 'bg-green-50',   border: 'border-green-600',   value_cls: 'text-green-800' },
}

const STATUS_OPTIONS: { value: JobStatus; label: string; cls: string }[] = [
  { value: 'open',        label: 'Open',        cls: 'bg-green-100 text-green-800 border-green-300'   },
  { value: 'in_progress', label: 'In Progress', cls: 'bg-yellow-100 text-yellow-800 border-yellow-300'},
  { value: 'on_hold',     label: 'On Hold',     cls: 'bg-gray-100 text-gray-700 border-gray-300'     },
  { value: 'closed',      label: 'Closed',      cls: 'bg-blue-100 text-blue-800 border-blue-300'     },
]

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

// ─── Component ────────────────────────────────────────────────────────────────

export default function ManagementJobsPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs]       = useState<JobWithStats[]>([])

  // ── Sr. TL list for filter (replaces Team filter) ──────────────────────────
  const [srTLs, setSrTLs] = useState<{ id: string; name: string }[]>([])

  // Filters
  const [search, setSearch]               = useState('')
  const [srTLFilter, setSrTLFilter]       = useState('all')   // ← replaces teamFilter
  const [statusFilter, setStatusFilter]   = useState('open')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [catFilter, setCatFilter]         = useState<PipelineCat | 'all'>('all')

  // Status update
  const [updatingStatus, setUpdatingStatus]   = useState<string | null>(null)
  const [confirmClose, setConfirmClose]       = useState<{ id: string; title: string } | null>(null)

  // Job detail drawer
  const [selectedJob, setSelectedJob]         = useState<JobWithStats | null>(null)
  const [drawerCandidates, setDrawerCandidates] = useState<CandidateRow[]>([])
  const [drawerLoading, setDrawerLoading]     = useState(false)

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ud = localStorage.getItem('user')
    if (!ud) { router.push('/'); return }
    const u = JSON.parse(ud)
    if (!['ceo','ops_head','finance_head','system_admin','management'].includes(u.role)) {
      alert('Access denied.'); router.push('/'); return
    }
    setUser(u)
    loadAll()
  }, [])

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadAll = async () => {
    setLoading(true)
    try {
      // Sr. TLs
      const { data: srTLRaw } = await supabaseAdmin
        .from('users')
        .select('id, full_name, team_id')
        .eq('role', 'sr_team_leader')
        .eq('is_active', true)
        .order('full_name')

      setSrTLs((srTLRaw || []).map((u: any) => ({ id: u.id, name: u.full_name })))

      // Build: srTL.id → name, team_id → srTL.id & name
      const srTLById: Record<string, string>   = {}
      const srTLByTeam: Record<string, { id: string; name: string }> = {}
      ;(srTLRaw || []).forEach((u: any) => {
        srTLById[u.id] = u.full_name
        if (u.team_id) srTLByTeam[u.team_id] = { id: u.id, name: u.full_name }
      })

      // Teams name map
      const { data: teamsRaw } = await supabaseAdmin
        .from('teams').select('id, name').eq('is_active', true)
      const teamNameMap: Record<string, string> = {}
      ;(teamsRaw || []).forEach((t: any) => { teamNameMap[t.id] = t.name })

      // All jobs
      const { data: jobsRaw } = await supabaseAdmin
        .from('jobs')
        .select('*, clients(company_name)')
        .order('created_at', { ascending: false })

      if (!jobsRaw || jobsRaw.length === 0) { setJobs([]); setLoading(false); return }

      const jobIds = jobsRaw.map((j: any) => j.id)

      // Candidates for all jobs
      const { data: candidates } = await supabaseAdmin
        .from('candidates')
        .select('id, job_id, current_stage, revenue_earned, assigned_to, last_activity_date, date_sourced')
        .in('job_id', jobIds)

      // Offers for revenue — fetch with candidate's current_stage to filter reneges
      // BUG FIX: confirmed revenue must exclude reneges.
      // We join to candidates to check current_stage !== 'renege'.
      const { data: offers } = await supabaseAdmin
        .from('offers')
        .select(`
          candidate_id,
          status,
          expected_revenue,
          fixed_ctc,
          revenue_percentage,
          candidates!inner(job_id, current_stage)
        `)
        .in('candidates.job_id', jobIds)
        .in('status', ['extended','accepted','joined'])

      // Recruiter assignments
      const { data: assignments } = await supabaseAdmin
        .from('job_recruiter_assignments')
        .select('job_id, recruiter_id')
        .in('job_id', jobIds)
        .eq('is_active', true)

      // Aggregate candidates by job
      const candByJob: Record<string, any[]> = {}
      ;(candidates || []).forEach((c: any) => {
        if (!candByJob[c.job_id]) candByJob[c.job_id] = []
        candByJob[c.job_id].push(c)
      })

      // Aggregate offers by job
      const offersByJob: Record<string, any[]> = {}
      ;(offers || []).forEach((o: any) => {
        const jid = (o.candidates as any)?.job_id
        if (!jid) return
        if (!offersByJob[jid]) offersByJob[jid] = []
        offersByJob[jid].push(o)
      })

      // Assignment counts per job
      const assignByJob: Record<string, number> = {}
      ;(assignments || []).forEach((a: any) => {
        assignByJob[a.job_id] = (assignByJob[a.job_id] || 0) + 1
      })

      const now = Date.now()

      const mapped: JobWithStats[] = jobsRaw.map((j: any) => {
        const jCands  = candByJob[j.id] || []
        const jOffers = offersByJob[j.id] || []

        // Stage counts
        const stageCounts: StageCounts = {}
        jCands.forEach((c: any) => {
          stageCounts[c.current_stage] = (stageCounts[c.current_stage] || 0) + 1
        })

        const activeStages = ['sourced','screening','interview_scheduled','interview_completed','documentation','offer_extended','offer_accepted','on_hold']
        const activePipeline = jCands.filter((c: any) => activeStages.includes(c.current_stage)).length

        // ── Revenue at risk = offers extended (not yet accepted/joined) ──────
        const revenueAtRisk = jOffers
          .filter((o: any) => o.status === 'extended')
          .reduce((s: number, o: any) =>
            s + (o.expected_revenue || ((o.fixed_ctc || 0) * (o.revenue_percentage || 8.33) / 100)), 0)

        // ── Confirmed revenue = offers accepted/joined BUT candidate NOT reneged ──
        // BUG FIX: explicitly exclude candidates whose current_stage = 'renege'
        const confirmedRevenue = jOffers
          .filter((o: any) =>
            ['accepted','joined'].includes(o.status) &&
            (o.candidates as any)?.current_stage !== 'renege'
          )
          .reduce((s: number, o: any) =>
            s + (o.expected_revenue || ((o.fixed_ctc || 0) * (o.revenue_percentage || 8.33) / 100)), 0)

        // Last activity
        const activityDates = jCands.map((c: any) => c.last_activity_date || c.date_sourced).filter(Boolean)
        const lastActivity  = activityDates.length > 0 ? [...activityDates].sort().reverse()[0] : null

        const daysOpen = Math.floor((now - new Date(j.created_at).getTime()) / 86400000)

        const srTL = srTLByTeam[j.assigned_team_id] || { id: '', name: '—' }

        return {
          ...j,
          _clientName:       j.clients?.company_name || '—',
          _teamName:         teamNameMap[j.assigned_team_id] || '—',
          _srTlName:         srTL.name,
          _srTlId:           srTL.id,
          _recruiterCount:   assignByJob[j.id] || 0,
          _daysOpen:         daysOpen,
          _candidateCount:   jCands.length,
          _activePipeline:   activePipeline,
          _stageCounts:      stageCounts,
          _pipelineCat:      getPipelineCat(stageCounts),
          _revenueAtRisk:    revenueAtRisk,
          _confirmedRevenue: confirmedRevenue,
          _lastActivity:     lastActivity,
        } as JobWithStats
      })

      setJobs(mapped)
    } catch (err) {
      console.error('Error loading jobs:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Status change ─────────────────────────────────────────────────────────
  const handleStatusChange = (job: JobWithStats, newStatus: string) => {
    if (newStatus === 'closed') { setConfirmClose({ id: job.id, title: job.job_title }); return }
    applyStatusChange(job.id, newStatus as JobStatus)
  }

  const applyStatusChange = async (jobId: string, status: JobStatus) => {
    setConfirmClose(null)
    setUpdatingStatus(jobId)
    try {
      await supabaseAdmin.from('jobs').update({ status }).eq('id', jobId)
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status } : j))
      if (selectedJob?.id === jobId) setSelectedJob(prev => prev ? { ...prev, status } : prev)
    } catch {
      alert('Failed to update status.')
    } finally {
      setUpdatingStatus(null)
    }
  }

  // ── Open detail drawer ────────────────────────────────────────────────────
  const openDrawer = async (job: JobWithStats) => {
    setSelectedJob(job)
    setDrawerLoading(true)
    setDrawerCandidates([])
    try {
      const { data } = await supabaseAdmin
        .from('candidates')
        .select(`id, full_name, phone, current_stage, expected_ctc, date_sourced, last_activity_date,
          users:assigned_to(full_name)`)
        .eq('job_id', job.id)
        .order('current_stage')

      setDrawerCandidates((data || []).map((c: any) => ({
        id:               c.id,
        full_name:        c.full_name,
        phone:            c.phone,
        current_stage:    c.current_stage,
        expected_ctc:     c.expected_ctc || 0,
        assigned_to_name: c.users?.full_name || '—',
        date_sourced:     c.date_sourced,
        last_activity_date: c.last_activity_date,
      })))
    } catch (err) {
      console.error(err)
    } finally {
      setDrawerLoading(false)
    }
  }

  // ── Filtered jobs ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = [...jobs]
    if (statusFilter !== 'all')   r = r.filter(j => j.status === statusFilter)
    // ── Sr. TL filter (replaces team filter) ────────────────────────────────
    if (srTLFilter !== 'all')     r = r.filter(j => j._srTlId === srTLFilter)
    if (priorityFilter !== 'all') r = r.filter(j => j.priority === priorityFilter)
    if (catFilter !== 'all')      r = r.filter(j => j._pipelineCat === catFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(j =>
        j.job_title.toLowerCase().includes(q) ||
        j.job_code.toLowerCase().includes(q) ||
        j._clientName.toLowerCase().includes(q)
      )
    }
    return r
  }, [jobs, statusFilter, srTLFilter, priorityFilter, catFilter, search])

  // ── KPI counts — always based on ALL open jobs (ignore Sr. TL / cat filter) ─
  // BUG FIX: KPI strip shows org-wide open job position counts,
  // NOT the filtered row count. The "Showing X of Y" in filter bar
  // shows filtered job rows. These are intentionally different metrics.
  const openJobs = jobs.filter(j => j.status === 'open')
  const kpi = {
    // Sum of positions field across all open jobs (position slots, not job count)
    totalPositionSlots: openJobs.reduce((s, j) => s + (j.positions || 0), 0),
    // Job row counts per pipeline category
    not_started:        openJobs.filter(j => j._pipelineCat === 'not_started').length,
    screening:          openJobs.filter(j => j._pipelineCat === 'screening').length,
    interview:          openJobs.filter(j => j._pipelineCat === 'interview').length,
    documentation:      openJobs.filter(j => j._pipelineCat === 'documentation').length,
    offer:              openJobs.filter(j => j._pipelineCat === 'offer').length,
    filledPositions:    openJobs.reduce((s, j) => s + (j.positions_filled || 0), 0),
    totalRevenueAtRisk: openJobs.reduce((s, j) => s + j._revenueAtRisk, 0),
    // BUG FIX: confirmed revenue excludes reneges (already handled in data build)
    confirmedRevenue:   jobs.reduce((s, j) => s + j._confirmedRevenue, 0),
  }

  const getStatusCls = (status: string) =>
    STATUS_OPTIONS.find(o => o.value === status)?.cls || 'bg-gray-100 text-gray-700'

  const getPriorityBadge = (p: string) => {
    if (p === 'high')   return 'bg-red-100 text-red-800'
    if (p === 'medium') return 'bg-yellow-100 text-yellow-800'
    return 'bg-gray-100 text-gray-600'
  }

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    </DashboardLayout>
  )

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 pb-8">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 rounded-xl p-6 text-white flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">💼 Jobs — Organisation View</h1>
            <p className="text-blue-200">
              Pipeline health · Revenue at risk · Status management · {jobs.length} total jobs
            </p>
          </div>
          <div className="flex gap-3 text-right">
            <div>
              <div className="text-2xl font-black text-white">{fmt(kpi.totalRevenueAtRisk)}</div>
              <div className="text-xs text-blue-200">Revenue at risk (offers out)</div>
            </div>
            <div className="pl-3 border-l border-blue-500">
              <div className="text-2xl font-black text-green-300">{fmt(kpi.confirmedRevenue)}</div>
              <div className="text-xs text-blue-200">Confirmed revenue (offer accepted, no renege)</div>
            </div>
          </div>
        </div>

        {/* ── KPI Strip ── */}
        {/* NOTE: These counts are org-wide across ALL open jobs.
            "Showing X of Y" in filters reflects the filtered job rows table count — intentionally different. */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">

          {/* Open Position Slots — renamed for clarity */}
          <div
            onClick={() => { setStatusFilter('open'); setCatFilter('all') }}
            className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md ${catFilter === 'all' && statusFilter === 'open' ? 'ring-2 ring-blue-400' : ''} bg-white border-gray-200`}
          >
            <div className="text-xs font-semibold text-gray-500 mb-1 leading-tight">Open Position Slots</div>
            <div className="text-3xl font-black text-gray-900">{kpi.totalPositionSlots}</div>
            <div className="text-xs text-gray-400 mt-1">{openJobs.length} open jobs</div>
          </div>

          {/* 0 CV */}
          <div
            onClick={() => { setStatusFilter('open'); setCatFilter('not_started') }}
            className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md ${catFilter === 'not_started' ? 'ring-2 ring-red-400' : ''} bg-red-50 border-red-400`}
          >
            <div className="text-xs font-semibold text-red-600 mb-1 leading-tight">🔴 No CVs Yet</div>
            <div className="text-3xl font-black text-red-700">{kpi.not_started}</div>
            <div className="text-xs text-red-400 mt-1">jobs not started</div>
          </div>

          {/* Screening */}
          <div
            onClick={() => { setStatusFilter('open'); setCatFilter('screening') }}
            className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md ${catFilter === 'screening' ? 'ring-2 ring-yellow-400' : ''} bg-yellow-50 border-yellow-400`}
          >
            <div className="text-xs font-semibold text-yellow-700 mb-1 leading-tight">🟡 Screening</div>
            <div className="text-3xl font-black text-yellow-700">{kpi.screening}</div>
            <div className="text-xs text-yellow-500 mt-1">CVs sent to client</div>
          </div>

          {/* Interview */}
          <div
            onClick={() => { setStatusFilter('open'); setCatFilter('interview') }}
            className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md ${catFilter === 'interview' ? 'ring-2 ring-orange-400' : ''} bg-orange-50 border-orange-400`}
          >
            <div className="text-xs font-semibold text-orange-700 mb-1 leading-tight">🟠 Interview</div>
            <div className="text-3xl font-black text-orange-700">{kpi.interview}</div>
            <div className="text-xs text-orange-400 mt-1">active interviews</div>
          </div>

          {/* Documentation */}
          <div
            onClick={() => { setStatusFilter('open'); setCatFilter('documentation') }}
            className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md ${catFilter === 'documentation' ? 'ring-2 ring-lime-400' : ''} bg-lime-50 border-lime-400`}
          >
            <div className="text-xs font-semibold text-lime-700 mb-1 leading-tight">🟢 Docs</div>
            <div className="text-3xl font-black text-lime-700">{kpi.documentation}</div>
            <div className="text-xs text-lime-500 mt-1">pre-offer docs</div>
          </div>

          {/* Offer */}
          <div
            onClick={() => { setStatusFilter('open'); setCatFilter('offer') }}
            className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md ${catFilter === 'offer' ? 'ring-2 ring-[#6b7c3d]' : ''} bg-[#6b7c3d]/10 border-[#6b7c3d]`}
          >
            <div className="text-xs font-semibold text-[#4a5729] mb-1 leading-tight">🫒 Offer Stage</div>
            <div className="text-3xl font-black text-[#4a5729]">{kpi.offer}</div>
            <div className="text-xs text-[#6b7c3d] mt-1">extended / accepted</div>
          </div>

          {/* Filled */}
          <div
            onClick={() => { setStatusFilter('all'); setCatFilter('filled') }}
            className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md ${catFilter === 'filled' ? 'ring-2 ring-green-600' : ''} bg-green-50 border-green-600`}
          >
            <div className="text-xs font-semibold text-green-700 mb-1 leading-tight">✅ Filled</div>
            <div className="text-3xl font-black text-green-800">{kpi.filledPositions}</div>
            <div className="text-xs text-green-500 mt-1">positions joined</div>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

            {/* Search */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Search</label>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Job title, code, client…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* ── Sr. TL Filter (replaces Team filter) ── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Sr. Team Leader</label>
              <select value={srTLFilter} onChange={e => setSrTLFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="all">All Sr. TLs</option>
                {srTLs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Priority</label>
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="all">All Priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Pipeline Stage */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Pipeline Stage</label>
              <select value={catFilter} onChange={e => setCatFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="all">All Categories</option>
                <option value="not_started">🔴 No CVs Yet</option>
                <option value="screening">🟡 Screening</option>
                <option value="interview">🟠 Interview</option>
                <option value="documentation">🟢 Documentation</option>
                <option value="offer">🫒 Offer Stage</option>
                <option value="filled">✅ Filled</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3">
            <span className="text-sm text-gray-500">
              Showing <strong>{filtered.length}</strong> jobs
              {srTLFilter !== 'all' && (
                <span className="ml-1 text-blue-600 font-medium">
                  · {srTLs.find(t => t.id === srTLFilter)?.name}&apos;s team
                </span>
              )}
            </span>
            {(search || statusFilter !== 'open' || srTLFilter !== 'all' || priorityFilter !== 'all' || catFilter !== 'all') && (
              <button onClick={() => {
                setSearch(''); setStatusFilter('open')
                setSrTLFilter('all'); setPriorityFilter('all'); setCatFilter('all')
              }} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                ✕ Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ── Jobs Table ── */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <div className="text-5xl mb-3">💼</div>
            <p className="text-gray-500 font-medium">No jobs match your filters</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Job','Client','Sr. TL / Team','Priority','Status','Positions','Days Open','Pipeline','Revenue at Risk','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(job => {
                  const cat = job._pipelineCat
                  const catDot: Record<PipelineCat, string> = {
                    not_started: 'bg-red-500', screening: 'bg-yellow-400',
                    interview: 'bg-orange-400', documentation: 'bg-lime-500',
                    offer: 'bg-[#6b7c3d]', filled: 'bg-green-600',
                  }
                  return (
                    <tr key={job.id} className="hover:bg-blue-50/30 transition">
                      {/* Job */}
                      <td className="px-4 py-3">
                        <button onClick={() => openDrawer(job)} className="text-left group">
                          <div className="font-semibold text-blue-700 group-hover:underline">{job.job_title}</div>
                          <div className="text-xs text-gray-500 font-mono">{job.job_code}</div>
                          <div className="text-xs text-gray-400">{job.location} · {job.experience_min}–{job.experience_max} yrs</div>
                        </button>
                      </td>
                      {/* Client */}
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-800">{job._clientName}</div>
                        <div className="text-xs text-gray-400">₹{job.min_ctc}–{job.max_ctc}L</div>
                      </td>
                      {/* Sr. TL / Team (renamed from Team) */}
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold text-indigo-700">{job._srTlName}</div>
                        <div className="text-xs text-gray-500">{job._teamName}</div>
                        <div className="text-xs text-purple-600 mt-0.5">
                          {job._recruiterCount} recruiter{job._recruiterCount !== 1 ? 's' : ''}
                        </div>
                      </td>
                      {/* Priority */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getPriorityBadge(job.priority)}`}>
                          {job.priority?.toUpperCase()}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        {updatingStatus === job.id ? (
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />Saving…
                          </div>
                        ) : (
                          <select value={job.status}
                            onChange={e => handleStatusChange(job, e.target.value)}
                            className={`px-2 py-1 rounded-lg text-xs font-semibold border-2 cursor-pointer focus:outline-none ${getStatusCls(job.status)}`}>
                            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        )}
                      </td>
                      {/* Positions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-gray-900">{job.positions_filled}</span>
                          <span className="text-gray-400">/</span>
                          <span className="text-gray-600">{job.positions}</span>
                        </div>
                        <div className="mt-1 w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full"
                            style={{ width:`${job.positions > 0 ? Math.min((job.positions_filled / job.positions) * 100, 100) : 0}%` }} />
                        </div>
                      </td>
                      {/* Days Open */}
                      <td className="px-4 py-3">
                        <span className={`font-semibold text-sm ${job._daysOpen > 90 ? 'text-red-600' : job._daysOpen > 60 ? 'text-orange-500' : 'text-gray-700'}`}>
                          {job._daysOpen}d
                        </span>
                        {job._daysOpen > 90 && <div className="text-xs text-red-500">⚠️ Stale</div>}
                      </td>
                      {/* Pipeline */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${catDot[cat]}`} />
                          <span className="text-xs font-medium text-gray-700">{job._activePipeline} active</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{job._candidateCount} total CVs</div>
                        {job._stageCounts['joined'] > 0 && (
                          <div className="text-xs text-green-700 font-semibold mt-0.5">✅ {job._stageCounts['joined']} joined</div>
                        )}
                      </td>
                      {/* Revenue */}
                      <td className="px-4 py-3">
                        {job._revenueAtRisk > 0 && (
                          <div className="text-xs font-bold text-orange-700">
                            {fmt(job._revenueAtRisk)}
                            <div className="text-[10px] font-normal text-gray-400">at risk</div>
                          </div>
                        )}
                        {job._confirmedRevenue > 0 && (
                          <div className="text-xs font-bold text-green-700 mt-1">
                            {fmt(job._confirmedRevenue)}
                            <div className="text-[10px] font-normal text-gray-400">confirmed</div>
                          </div>
                        )}
                        {job._revenueAtRisk === 0 && job._confirmedRevenue === 0 && (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <button onClick={() => openDrawer(job)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-semibold whitespace-nowrap">
                          View Funnel →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Confirm Close Modal ── */}
      {confirmClose && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Close this job?</h3>
            <p className="text-sm text-gray-600 mb-6">
              <strong>{confirmClose.title}</strong> will be marked as Closed. Recruiters won't be able to add candidates.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmClose(null)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => applyStatusChange(confirmClose.id, 'closed')}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
                Yes, Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Job Detail Drawer ── */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setSelectedJob(null)} />
          <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">

            <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-4 flex items-start justify-between">
              <div className="text-white">
                <div className="font-bold text-lg leading-tight">{selectedJob.job_title}</div>
                <div className="text-blue-200 text-sm mt-0.5">{selectedJob._clientName} · {selectedJob.job_code}</div>
                <div className="flex gap-3 mt-2 text-xs text-blue-200">
                  <span>📍 {selectedJob.location}</span>
                  <span>💰 ₹{selectedJob.min_ctc}–{selectedJob.max_ctc}L</span>
                  <span>📅 {selectedJob._daysOpen}d open</span>
                  <span>👤 {selectedJob._srTlName}</span>
                  <span>👥 {selectedJob._recruiterCount} recruiters</span>
                </div>
              </div>
              <button onClick={() => setSelectedJob(null)} className="text-white/60 hover:text-white text-2xl ml-4">✕</button>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-b flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <select value={selectedJob.status}
                  onChange={e => handleStatusChange(selectedJob, e.target.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 cursor-pointer ${getStatusCls(selectedJob.status)}`}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${getPriorityBadge(selectedJob.priority)}`}>
                  {selectedJob.priority?.toUpperCase()} PRIORITY
                </span>
              </div>
              <div className="text-sm font-semibold text-gray-700">
                Positions: <span className="text-green-700">{selectedJob.positions_filled}</span> / {selectedJob.positions} filled
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <div className="text-xs text-orange-600 font-semibold mb-1">Revenue at Risk</div>
                  <div className="text-xl font-black text-orange-700">{fmt(selectedJob._revenueAtRisk)}</div>
                  <div className="text-xs text-gray-500 mt-1">Offers extended, not yet joined</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="text-xs text-green-600 font-semibold mb-1">Confirmed Revenue</div>
                  <div className="text-xl font-black text-green-700">{fmt(selectedJob._confirmedRevenue)}</div>
                  <div className="text-xs text-gray-500 mt-1">Offer accepted · reneges excluded</div>
                </div>
              </div>

              {/* Pipeline Funnel */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-3">📊 Candidate Pipeline Funnel</h4>
                {drawerLoading ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" /> Loading…
                  </div>
                ) : (() => {
                  const maxCount = Math.max(...FUNNEL_STAGES.map(s => selectedJob._stageCounts[s.key] || 0), 1)
                  const total    = Object.values(selectedJob._stageCounts).reduce((a, b) => a + b, 0)
                  const rejected = REJECTED_STAGES.reduce((s, k) => s + (selectedJob._stageCounts[k] || 0), 0)

                  return (
                    <div className="space-y-1.5">
                      {FUNNEL_STAGES.map((s) => {
                        const count = selectedJob._stageCounts[s.key] || 0
                        const pct   = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 4 : 0) : 0
                        return (
                          <div key={s.key} className="flex items-center gap-3">
                            <div className="w-36 text-right text-xs font-medium text-gray-600 flex-shrink-0">{s.label}</div>
                            <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                              <div className={`h-full ${s.color} rounded-lg flex items-center px-3 transition-all duration-500`}
                                style={{ width:`${pct}%` }}>
                                {count > 0 && <span className={`text-xs font-bold ${s.text} whitespace-nowrap`}>{count}</span>}
                              </div>
                              {count === 0 && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">0</span>}
                            </div>
                            <div className="w-12 text-right text-xs text-gray-400 flex-shrink-0">
                              {total > 0 ? `${Math.round((count / total) * 100)}%` : '—'}
                            </div>
                          </div>
                        )
                      })}
                      {rejected > 0 && (
                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                          <div className="w-36 text-right text-xs font-medium text-red-500 flex-shrink-0">Rejected / Renege</div>
                          <div className="flex-1 h-6 bg-red-50 rounded-lg flex items-center px-3">
                            <span className="text-xs font-bold text-red-600">{rejected}</span>
                          </div>
                          <div className="w-12 text-right text-xs text-red-400">{total > 0 ? `${Math.round((rejected / total) * 100)}%` : '—'}</div>
                        </div>
                      )}
                      {total > 0 && (
                        <div className="text-xs text-gray-400 mt-2 text-right">
                          Total CVs: {total} · Conversion: {Math.round(((selectedJob._stageCounts['joined'] || 0) / total) * 100)}%
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Candidate List */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-3">👤 Candidates ({drawerCandidates.length})</h4>
                {drawerLoading ? (
                  <div className="text-sm text-gray-400">Loading candidates…</div>
                ) : drawerCandidates.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-lg">No candidates for this job yet</div>
                ) : (
                  <div className="space-y-2">
                    {drawerCandidates.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 text-sm">{c.full_name}</div>
                          <div className="text-xs text-gray-500">{c.phone} · {c.assigned_to_name}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          {c.expected_ctc > 0 && <span className="text-xs text-gray-500">₹{c.expected_ctc}</span>}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStageBadge(c.current_stage)}`}>
                            {getStageLabel(c.current_stage)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}