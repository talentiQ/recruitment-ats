// app/sr-tl/jobs/page.tsx
'use client'
import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Job {
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
  candidate_count: number
  in_progress_count: number
  status: string
  priority: string
  created_at: string
  assigned_team_id: string | null
  clients: { company_name: string }
  recruiter_count: number
  recruiter_allocations: { id: string; name: string; positions: number }[]
  // enriched for analytics
  _stageCounts: Record<string, number>
  _revenueAtRisk: number
  _confirmedRevenue: number
  _daysOpen: number
}

interface CandidateDetail {
  id: string
  job_id: string
  current_stage: string
  assigned_to: string
  revenue_earned: number
  date_sourced: string | null
  last_activity_date: string | null
}

interface RecruiterStat {
  id: string
  name: string
  role: string
  // pipeline counts
  sourced: number
  screening: number
  interview: number
  documentation: number
  offer: number
  joined: number
  rejected: number
  renege: number
  onHold: number
  total: number
  active: number
  stale: number          // active candidates > 30 days since last activity
  // revenue
  revenueAtRisk: number
  confirmedRevenue: number
  // jobs
  jobsCount: number
}

type TabKey = 'jobs' | 'analytics'
type PipelineCat = 'not_started' | 'screening' | 'interview' | 'documentation' | 'offer' | 'filled'

const IN_PROGRESS_STAGES = [
  'sourced','screening','interview_scheduled','interview_completed',
  'documentation','offer_extended','offer_accepted','on_hold',
]

const TERMINAL_STAGES = ['joined','screening_rejected','interview_rejected','offer_rejected','renege']

const FUNNEL_STAGES = [
  { key: 'sourced',              label: 'CV Sourced',       color: '#94a3b8' },
  { key: 'screening',            label: 'Sent to Client',   color: '#f59e0b' },
  { key: 'interview_scheduled',  label: 'Interview Sched.', color: '#f97316' },
  { key: 'interview_completed',  label: 'Interview Done',   color: '#ea580c' },
  { key: 'documentation',        label: 'Documentation',    color: '#84cc16' },
  { key: 'offer_extended',       label: 'Offer Extended',   color: '#ca8a04' },
  { key: 'offer_accepted',       label: 'Offer Accepted',   color: '#22c55e' },
  { key: 'joined',               label: 'Joined',           color: '#16a34a' },
]

const REJECTED_STAGES = ['screening_rejected','interview_rejected','offer_rejected','renege']

const JOB_STATUS_OPTIONS = [
  { value: 'open',        label: 'Open',        color: 'bg-green-100 text-green-800 border-green-300'   },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-800 border-yellow-300'},
  { value: 'on_hold',     label: 'On Hold',     color: 'bg-gray-100 text-gray-700 border-gray-300'     },
  { value: 'closed',      label: 'Closed',      color: 'bg-blue-100 text-blue-800 border-blue-300'     },
]

function getPipelineCat(sc: Record<string, number>): PipelineCat {
  if ((sc['joined'] || 0) > 0) return 'filled'
  if ((sc['offer_extended'] || 0) + (sc['offer_accepted'] || 0) > 0) return 'offer'
  if ((sc['documentation'] || 0) > 0) return 'documentation'
  if ((sc['interview_scheduled'] || 0) + (sc['interview_completed'] || 0) > 0) return 'interview'
  if ((sc['screening'] || 0) > 0) return 'screening'
  return 'not_started'
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SrTLJobsPage() {
  const router = useRouter()

  const [activeTab, setActiveTab]   = useState<TabKey>('jobs')
  const [jobs, setJobs]             = useState<Job[]>([])
  const [candidates, setCandidates] = useState<CandidateDetail[]>([])
  // map: userId → { name, role }
  const [memberMap, setMemberMap]   = useState<Record<string, { name: string; role: string }>>({})

  const [loading, setLoading]             = useState(true)
  const [statusFilter, setStatusFilter]   = useState('all')
  const [searchQuery, setSearchQuery]     = useState('')
  const [user, setUser]                   = useState<any>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [confirmModal, setConfirmModal]   = useState<{ jobId: string; jobTitle: string; newStatus: string } | null>(null)

  // Analytics state
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadAll(parsedUser)
    }
  }, [])

  // ── Load everything in one pass ─────────────────────────────────────────────
  const loadAll = async (currentUser: any) => {
    setLoading(true)
    try {
      // Step 1: TLs under this Sr. TL
      const { data: tlsUnder } = await supabase
        .from('users')
        .select('id, full_name, team_id, role')
        .eq('reports_to', currentUser.id)
        .eq('role', 'team_leader')
        .eq('is_active', true)

      // Step 2: Recruiters under those TLs
      const tlIds = (tlsUnder || []).map((t: any) => t.id)
      let recruiters: any[] = []
      if (tlIds.length > 0) {
        const { data: recs } = await supabase
          .from('users')
          .select('id, full_name, role')
          .in('reports_to', tlIds)
          .eq('role', 'recruiter')
          .eq('is_active', true)
        recruiters = recs || []
      }

      // Build member map (all members including Sr. TL themselves)
      const mMap: Record<string, { name: string; role: string }> = {
        [currentUser.id]: { name: currentUser.full_name, role: 'sr_team_leader' },
      }
      ;(tlsUnder || []).forEach((u: any) => { mMap[u.id] = { name: u.full_name, role: u.role } })
      recruiters.forEach((u: any) => { mMap[u.id] = { name: u.full_name, role: u.role } })
      setMemberMap(mMap)

      // Step 3: All team_ids
      const allTeamIds = [
        currentUser.team_id,
        ...(tlsUnder || []).map((t: any) => t.team_id),
      ].filter(Boolean)

      if (allTeamIds.length === 0) { setJobs([]); setLoading(false); return }

      // Step 4: Jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('*, clients(company_name), candidates(id, current_stage)')
        .in('assigned_team_id', allTeamIds)
        .order('created_at', { ascending: false })

      if (jobsError) throw jobsError

      const jobIds = jobsData?.map((j: any) => j.id) || []

      // Step 5: Full candidate details for analytics (stage + revenue + assigned_to + dates)
      const { data: candFull } = await supabase
        .from('candidates')
        .select('id, job_id, current_stage, assigned_to, revenue_earned, date_sourced, last_activity_date')
        .in('job_id', jobIds)

      setCandidates((candFull || []) as CandidateDetail[])

      // Step 6: Offers for revenue at risk / confirmed (excl. reneges)
      const { data: offers } = await supabase
        .from('offers')
        .select('candidate_id, status, expected_revenue, fixed_ctc, revenue_percentage, candidates!inner(job_id, current_stage)')
        .in('candidates.job_id', jobIds)
        .in('status', ['extended','accepted','joined'])

      // Build offer revenue by job
      const offerRevByJob: Record<string, { atRisk: number; confirmed: number }> = {}
      ;(offers || []).forEach((o: any) => {
        const jid = o.candidates?.job_id
        if (!jid) return
        if (!offerRevByJob[jid]) offerRevByJob[jid] = { atRisk: 0, confirmed: 0 }
        const rev = o.expected_revenue || ((o.fixed_ctc || 0) * (o.revenue_percentage || 8.33) / 100)
        if (o.status === 'extended') {
          offerRevByJob[jid].atRisk += rev
        } else if (['accepted','joined'].includes(o.status) && o.candidates?.current_stage !== 'renege') {
          offerRevByJob[jid].confirmed += rev
        }
      })

      // Step 7: Recruiter assignments
      const { data: assignments } = await supabase
        .from('job_recruiter_assignments')
        .select('job_id, positions_allocated, users:recruiter_id(id, full_name)')
        .in('job_id', jobIds)
        .eq('is_active', true)

      const assignmentsByJob: Record<string, any[]> = {}
      ;(assignments || []).forEach((a: any) => {
        if (!assignmentsByJob[a.job_id]) assignmentsByJob[a.job_id] = []
        const u = Array.isArray(a.users) ? a.users[0] : a.users
        assignmentsByJob[a.job_id].push({ id: u.id, name: u.full_name, positions: a.positions_allocated })
      })

      // Step 8: Build stage counts per job from full candidate list
      const stageCntByJob: Record<string, Record<string, number>> = {}
      ;(candFull || []).forEach((c: any) => {
        if (!stageCntByJob[c.job_id]) stageCntByJob[c.job_id] = {}
        stageCntByJob[c.job_id][c.current_stage] = (stageCntByJob[c.job_id][c.current_stage] || 0) + 1
      })

      const now = Date.now()

      const jobsEnriched: Job[] = (jobsData || []).map((job: any) => {
        const sc            = stageCntByJob[job.id] || {}
        const candidates    = job.candidates || []
        const inProgCount   = candidates.filter((c: any) => IN_PROGRESS_STAGES.includes(c.current_stage)).length
        const offerRev      = offerRevByJob[job.id] || { atRisk: 0, confirmed: 0 }
        const daysOpen      = Math.floor((now - new Date(job.created_at).getTime()) / 86400000)

        return {
          ...job,
          candidate_count:      candidates.length,
          in_progress_count:    inProgCount,
          recruiter_count:      assignmentsByJob[job.id]?.length || 0,
          recruiter_allocations: assignmentsByJob[job.id] || [],
          _stageCounts:         sc,
          _revenueAtRisk:       offerRev.atRisk,
          _confirmedRevenue:    offerRev.confirmed,
          _daysOpen:            daysOpen,
        }
      })

      setJobs(jobsEnriched)
    } catch (error) {
      console.error('Error loading jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  // ── Status change ─────────────────────────────────────────────────────────
  const handleStatusChange = (jobId: string, jobTitle: string, newStatus: string) => {
    if (newStatus === 'closed') { setConfirmModal({ jobId, jobTitle, newStatus }); return }
    applyStatusChange(jobId, newStatus)
  }

  const applyStatusChange = async (jobId: string, newStatus: string) => {
    setConfirmModal(null)
    setUpdatingStatus(jobId)
    try {
      await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId)
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
    } catch {
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdatingStatus(null)
    }
  }

  // ── Filtered jobs (Jobs tab) ──────────────────────────────────────────────
  const filteredJobs = useMemo(() => jobs.filter(j => {
    const matchesStatus = statusFilter === 'all' || j.status === statusFilter
    const q = searchQuery.toLowerCase().trim()
    const matchesSearch = !q || (
      j.job_title?.toLowerCase().includes(q) ||
      j.location?.toLowerCase().includes(q) ||
      j.clients?.company_name?.toLowerCase().includes(q) ||
      j.job_code?.toLowerCase().includes(q)
    )
    return matchesStatus && matchesSearch
  }), [jobs, statusFilter, searchQuery])

  // ── Analytics computations ────────────────────────────────────────────────

  // KPI counts for open jobs only
  const openJobs = useMemo(() => jobs.filter(j => j.status === 'open'), [jobs])

  const analyticsKPI = useMemo(() => ({
    openJobCount:       openJobs.length,
    positionSlots:      openJobs.reduce((s, j) => s + (j.positions || 0), 0),
    not_started:        openJobs.filter(j => getPipelineCat(j._stageCounts) === 'not_started').length,
    screening:          openJobs.filter(j => getPipelineCat(j._stageCounts) === 'screening').length,
    interview:          openJobs.filter(j => getPipelineCat(j._stageCounts) === 'interview').length,
    documentation:      openJobs.filter(j => getPipelineCat(j._stageCounts) === 'documentation').length,
    offer:              openJobs.filter(j => getPipelineCat(j._stageCounts) === 'offer').length,
    filled:             openJobs.filter(j => getPipelineCat(j._stageCounts) === 'filled').length,
    totalRevenueAtRisk: openJobs.reduce((s, j) => s + j._revenueAtRisk, 0),
    confirmedRevenue:   jobs.reduce((s, j) => s + j._confirmedRevenue, 0),
  }), [openJobs, jobs])

  // Per-member stats from candidates
  const recruiterStats = useMemo((): RecruiterStat[] => {
    const now = Date.now()
    const statsMap: Record<string, RecruiterStat> = {}

    const ensure = (uid: string) => {
      if (!statsMap[uid]) {
        const m = memberMap[uid]
        statsMap[uid] = {
          id: uid, name: m?.name || 'Unknown', role: m?.role || 'recruiter',
          sourced:0, screening:0, interview:0, documentation:0,
          offer:0, joined:0, rejected:0, renege:0, onHold:0,
          total:0, active:0, stale:0,
          revenueAtRisk:0, confirmedRevenue:0, jobsCount:0,
        }
      }
    }

    // Count pipeline stages
    candidates.forEach(c => {
      const uid = c.assigned_to
      if (!uid || !memberMap[uid]) return
      ensure(uid)
      const s = statsMap[uid]
      s.total++
      const stage = c.current_stage

      if (stage === 'sourced')                               s.sourced++
      else if (stage === 'screening')                        s.screening++
      else if (['interview_scheduled','interview_completed'].includes(stage)) s.interview++
      else if (stage === 'documentation')                    s.documentation++
      else if (['offer_extended','offer_accepted'].includes(stage)) s.offer++
      else if (stage === 'joined')                           s.joined++
      else if (['screening_rejected','interview_rejected','offer_rejected'].includes(stage)) s.rejected++
      else if (stage === 'renege')                           s.renege++
      else if (stage === 'on_hold')                          s.onHold++

      if (!TERMINAL_STAGES.includes(stage)) {
        s.active++
        const lastAct = c.last_activity_date || c.date_sourced
        if (lastAct && Math.floor((now - new Date(lastAct).getTime()) / 86400000) > 30) {
          s.stale++
        }
      }
    })

    // Revenue from offers — for each job, split credit by recruiter assignments
    // Simpler: sum revenue from candidate.assigned_to
    // (revenue_earned on candidates = actual revenue, not offers)
    candidates.forEach(c => {
      const uid = c.assigned_to
      if (!uid || !memberMap[uid]) return
      ensure(uid)
      if (c.current_stage === 'offer_extended') {
        // approximate from revenue_earned if set
      }
    })

    // Revenue from offers table is job-level; assign to recruiters by job assignment
    jobs.forEach(job => {
      if (job._revenueAtRisk > 0 || job._confirmedRevenue > 0) {
        const allocs = job.recruiter_allocations
        if (allocs.length === 0) return
        // Split evenly across assigned recruiters
        const perRec = {
          atRisk:    job._revenueAtRisk    / allocs.length,
          confirmed: job._confirmedRevenue / allocs.length,
        }
        allocs.forEach(a => {
          if (!memberMap[a.id]) return
          ensure(a.id)
          statsMap[a.id].revenueAtRisk    += perRec.atRisk
          statsMap[a.id].confirmedRevenue += perRec.confirmed
        })
      }
      // Job count per assigned recruiter
      ;(job.recruiter_allocations || []).forEach(a => {
        if (!memberMap[a.id]) return
        ensure(a.id)
        statsMap[a.id].jobsCount++
      })
    })

    return Object.values(statsMap).sort((a, b) => b.joined - a.joined || b.active - a.active)
  }, [candidates, memberMap, jobs])

  // Selected job funnel data
  const selectedJob = useMemo(
    () => jobs.find(j => j.id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  )

  // UI helpers
  const getStatusBadge = (status: string) =>
    JOB_STATUS_OPTIONS.find(o => o.value === status)?.color || 'bg-gray-100 text-gray-700 border-gray-300'

  const getPriorityBadge = (priority: string) => ({
    high:   'badge-danger',
    medium: 'badge-warning',
    low:    'bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-semibold',
  }[priority] || 'badge-warning')

  const getRoleBadge = (role: string) => ({
    sr_team_leader: 'bg-red-100 text-red-800',
    team_leader:    'bg-purple-100 text-purple-800',
    recruiter:      'bg-blue-100 text-blue-800',
  }[role] || 'bg-gray-100 text-gray-700')

  const getRoleLabel = (role: string) => ({
    sr_team_leader: 'Sr. TL',
    team_leader:    'TL',
    recruiter:      'Recruiter',
  }[role] || role)

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {activeTab === 'jobs' ? 'All Team Jobs' : 'Pipeline Analytics'}
            </h2>
            <p className="text-gray-600">
              {activeTab === 'jobs'
                ? 'Manage job assignments and track progress'
                : 'Scoped to your team · job funnel + per-member breakdown'}
            </p>
          </div>
          {activeTab === 'jobs' && (
            <button onClick={() => router.push('/sr-tl/jobs/add')} className="btn-primary">
              + Add New Job
            </button>
          )}
        </div>

        {/* ── Tab Strip ── */}
        <div className="flex border-b border-gray-200 -mt-2">
          {([
            { key: 'jobs',      label: `💼 Jobs (${jobs.length})`         },
            { key: 'analytics', label: `📊 Pipeline Analytics`            },
          ] as { key: TabKey; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          </div>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════════════════
                TAB 1 — JOBS (unchanged from original)
            ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'jobs' && (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="kpi-card">
                    <div className="kpi-title">Total Jobs</div>
                    <div className="kpi-value">{jobs.length}</div>
                  </div>
                  <div className="kpi-card kpi-success">
                    <div className="kpi-title">Open</div>
                    <div className="kpi-value">{jobs.filter(j => j.status === 'open').length}</div>
                  </div>
                  <div className="kpi-card kpi-warning">
                    <div className="kpi-title">In Progress Candidates</div>
                    <div className="kpi-value">{jobs.reduce((s, j) => s + (j.in_progress_count || 0), 0)}</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-title">Total Candidates</div>
                    <div className="kpi-value">{jobs.reduce((s, j) => s + (j.candidate_count || 0), 0)}</div>
                  </div>
                </div>

                {/* Search + Filter */}
                <div className="card">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">🔍</span>
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by job title, location, client or job code…"
                        className="input w-full pl-9" />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery('')}
                          className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600">✕</button>
                      )}
                    </div>
                    <div className="sm:w-48">
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-full">
                        <option value="all">All Statuses</option>
                        {JOB_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {(searchQuery || statusFilter !== 'all') && (
                    <p className="text-xs text-gray-500 mt-2">
                      Showing <span className="font-semibold text-gray-700">{filteredJobs.length}</span> of {jobs.length} jobs
                      {searchQuery && <> matching "<span className="font-semibold">{searchQuery}</span>"</>}
                    </p>
                  )}
                </div>

                {/* Jobs Table */}
                {filteredJobs.length === 0 ? (
                  <div className="card text-center py-12">
                    <p className="text-gray-500 text-lg mb-1">No jobs found</p>
                    {(searchQuery || statusFilter !== 'all') && (
                      <button onClick={() => { setSearchQuery(''); setStatusFilter('all') }}
                        className="mt-2 text-sm text-blue-600 hover:underline">Clear filters</button>
                    )}
                    {!searchQuery && statusFilter === 'all' && (
                      <button onClick={() => router.push('/sr-tl/jobs/add')} className="mt-4 btn-primary">
                        Create First Job
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="card overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Job Code</th><th>Job Title</th><th>Client</th><th>Location</th>
                          <th>Experience</th><th>CTC Range</th><th>Positions</th>
                          <th>Candidates</th><th>In Progress</th><th>Priority</th>
                          <th>Status</th><th>Recruiters</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredJobs.map(job => (
                          <tr key={job.id}>
                            <td><span className="font-mono font-bold text-blue-600">{job.job_code}</span></td>
                            <td>
                              <div className="font-medium text-gray-900">{job.job_title}</div>
                              <div className="text-sm text-gray-500">{job.department}</div>
                            </td>
                            <td className="text-sm">{job.clients?.company_name}</td>
                            <td className="text-sm">{job.location}</td>
                            <td className="text-sm">{job.experience_min}-{job.experience_max} yrs</td>
                            <td className="text-sm">₹{job.min_ctc}-{job.max_ctc}L</td>
                            <td><span className="font-medium">{job.positions_filled}/{job.positions}</span></td>
                            <td>
                              <button
                                onClick={() => router.push(`/sr-tl/jobs/${job.id}/candidates`)}
                                className={`font-bold text-lg ${job.candidate_count > 0 ? 'text-blue-600 hover:text-blue-800 hover:underline' : 'text-gray-400'}`}>
                                {job.candidate_count || 0}
                              </button>
                            </td>
                            <td>
                              <span className={`font-medium ${job.in_progress_count > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                                {job.in_progress_count || 0}
                              </span>
                            </td>
                            <td><span className={getPriorityBadge(job.priority)}>{job.priority?.toUpperCase()}</span></td>
                            <td>
                              {updatingStatus === job.id ? (
                                <div className="flex items-center gap-1 text-sm text-gray-500">
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />Saving…
                                </div>
                              ) : (
                                <select value={job.status}
                                  onChange={e => handleStatusChange(job.id, job.job_title, e.target.value)}
                                  className={`px-2 py-1 rounded-lg text-xs font-semibold border cursor-pointer focus:outline-none ${getStatusBadge(job.status)}`}>
                                  {JOB_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              )}
                            </td>
                            <td>
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                                  👥 {job.recruiter_count || 0} recruiter{job.recruiter_count !== 1 ? 's' : ''}
                                </span>
                                {job.recruiter_allocations?.length > 0 && (
                                  <div className="text-xs text-gray-500">
                                    {job.recruiter_allocations.map((a: any) => (
                                      <div key={a.id}>{a.name}: {a.positions}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="flex gap-2">
                                <button onClick={() => router.push(`/sr-tl/jobs/${job.id}`)}
                                  className="text-blue-600 hover:text-blue-900 font-medium text-sm">View</button>
                                <button onClick={() => router.push(`/sr-tl/jobs/${job.id}/add-candidate`)}
                                  className="text-green-600 hover:text-green-900 font-medium text-sm">+ Add</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 2 — PIPELINE ANALYTICS (new)
            ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'analytics' && (
              <div className="space-y-6">

                {/* Revenue summary banner */}
                <div style={{
                  background:'linear-gradient(135deg,#1e3a5f 0%,#1e40af 100%)',
                  borderRadius:14, padding:'18px 24px',
                  display:'flex', gap:32, alignItems:'center', flexWrap:'wrap',
                }}>
                  {[
                    { label:'Revenue at Risk',   val: fmt(analyticsKPI.totalRevenueAtRisk), sub:'Offers extended, not yet joined', color:'#fbbf24' },
                    { label:'Confirmed Revenue', val: fmt(analyticsKPI.confirmedRevenue),   sub:'Offer accepted · reneges excluded', color:'#4ade80' },
                    { label:'Open Jobs',         val: String(analyticsKPI.openJobCount),    sub:`${analyticsKPI.positionSlots} position slots`, color:'#93c5fd' },
                    { label:'Stale CVs',         val: String(recruiterStats.reduce((s,r) => s+r.stale,0)), sub:'Active > 30 days no update', color:'#f87171' },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize:22, fontWeight:800, color:item.color, lineHeight:1 }}>{item.val}</div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:3 }}>{item.sub}</div>
                    </div>
                  ))}
                </div>

                {/* ── 7 KPI Cards (pipeline category distribution) ── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                    Open Jobs by Pipeline Stage
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    {[
                      { label:'Position Slots', value: analyticsKPI.positionSlots,  sub:`${analyticsKPI.openJobCount} open jobs`,  bg:'bg-white',      border:'border-gray-200',   val:'text-gray-900'   },
                      { label:'🔴 No CVs Yet',  value: analyticsKPI.not_started,    sub:'jobs not started',                         bg:'bg-red-50',     border:'border-red-400',    val:'text-red-700'    },
                      { label:'🟡 Screening',   value: analyticsKPI.screening,      sub:'CVs sent to client',                       bg:'bg-yellow-50',  border:'border-yellow-400', val:'text-yellow-700' },
                      { label:'🟠 Interview',   value: analyticsKPI.interview,      sub:'active interviews',                        bg:'bg-orange-50',  border:'border-orange-400', val:'text-orange-700' },
                      { label:'🟢 Docs',        value: analyticsKPI.documentation,  sub:'pre-offer docs',                           bg:'bg-lime-50',    border:'border-lime-400',   val:'text-lime-700'   },
                      { label:'🫒 Offer Stage', value: analyticsKPI.offer,          sub:'extended / accepted',                      bg:'bg-amber-50',   border:'border-amber-400',  val:'text-amber-800'  },
                      { label:'✅ Filled',       value: analyticsKPI.filled,         sub:'positions joined',                         bg:'bg-green-50',   border:'border-green-500',  val:'text-green-800'  },
                    ].map(card => (
                      <div key={card.label} className={`rounded-xl border-2 p-4 text-center ${card.bg} ${card.border}`}>
                        <div className="text-[11px] font-semibold text-gray-500 mb-1 leading-tight">{card.label}</div>
                        <div className={`text-2xl font-black ${card.val}`}>{card.value}</div>
                        <div className="text-[10px] text-gray-400 mt-1">{card.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Job Funnel Selector ── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                    Job Funnel — Click any job to see stage breakdown
                  </h3>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            {['Job','Client','Status','Positions','Active CVs',
                              'Screening','Interview','Docs','Offer','Joined','Stale','Rev. at Risk'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {jobs.map(job => {
                            const sc       = job._stageCounts
                            const active   = candidates.filter(c => c.job_id === job.id && !TERMINAL_STAGES.includes(c.current_stage)).length
                            const now      = Date.now()
                            const stale    = candidates.filter(c => {
                              if (c.job_id !== job.id || TERMINAL_STAGES.includes(c.current_stage)) return false
                              const la = c.last_activity_date || c.date_sourced
                              return la && Math.floor((now - new Date(la).getTime()) / 86400000) > 30
                            }).length
                            const isSelected = selectedJobId === job.id
                            return (
                              <tr key={job.id}
                                onClick={() => setSelectedJobId(isSelected ? null : job.id)}
                                className={`cursor-pointer transition ${isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-gray-50'}`}>
                                <td className="px-3 py-2.5">
                                  <div className="font-semibold text-blue-700 text-xs">{job.job_title}</div>
                                  <div className="text-[10px] text-gray-400 font-mono">{job.job_code}</div>
                                </td>
                                <td className="px-3 py-2.5 text-xs text-gray-600">{job.clients?.company_name}</td>
                                <td className="px-3 py-2.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getStatusBadge(job.status)}`}>
                                    {job.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-xs font-medium text-gray-700">
                                  {job.positions_filled}/{job.positions}
                                </td>
                                <td className="px-3 py-2.5 text-xs font-bold text-gray-800">{active}</td>
                                <td className="px-3 py-2.5 text-xs font-medium text-yellow-700">{sc['screening'] || 0}</td>
                                <td className="px-3 py-2.5 text-xs font-medium text-orange-700">
                                  {(sc['interview_scheduled'] || 0) + (sc['interview_completed'] || 0)}
                                </td>
                                <td className="px-3 py-2.5 text-xs font-medium text-lime-700">{sc['documentation'] || 0}</td>
                                <td className="px-3 py-2.5 text-xs font-medium text-amber-700">
                                  {(sc['offer_extended'] || 0) + (sc['offer_accepted'] || 0)}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className={`text-xs font-bold ${(sc['joined'] || 0) > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                                    {sc['joined'] || 0}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  {stale > 0
                                    ? <span className="text-xs font-bold text-red-600">⚠ {stale}</span>
                                    : <span className="text-xs text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-2.5">
                                  {job._revenueAtRisk > 0
                                    ? <span className="text-xs font-bold text-orange-700">{fmt(job._revenueAtRisk)}</span>
                                    : <span className="text-xs text-gray-300">—</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* ── Inline funnel for selected job ── */}
                    {selectedJob && (
                      <div style={{
                        borderTop:'2px solid #bfdbfe', background:'#eff6ff',
                        padding:'20px 24px',
                      }}>
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <span className="font-bold text-blue-900">{selectedJob.job_title}</span>
                            <span className="text-blue-500 text-sm ml-2">— {selectedJob.clients?.company_name}</span>
                          </div>
                          <button onClick={() => setSelectedJobId(null)}
                            className="text-blue-400 hover:text-blue-600 text-lg font-bold">✕</button>
                        </div>
                        {/* Funnel bars */}
                        {(() => {
                          const sc       = selectedJob._stageCounts
                          const total    = Object.values(sc).reduce((a, b) => a + b, 0)
                          const maxCount = Math.max(...FUNNEL_STAGES.map(s => sc[s.key] || 0), 1)
                          const rejected = REJECTED_STAGES.reduce((s, k) => s + (sc[k] || 0), 0)
                          return (
                            <div className="space-y-1.5">
                              {FUNNEL_STAGES.map(s => {
                                const count = sc[s.key] || 0
                                const pct   = Math.max((count / maxCount) * 100, count > 0 ? 5 : 0)
                                return (
                                  <div key={s.key} className="flex items-center gap-3">
                                    <div className="w-36 text-right text-xs font-medium text-gray-600 flex-shrink-0">{s.label}</div>
                                    <div className="flex-1 h-7 bg-blue-100 rounded-lg overflow-hidden relative">
                                      <div className="h-full rounded-lg flex items-center px-3 transition-all duration-500"
                                        style={{ width:`${pct}%`, background:s.color }}>
                                        {count > 0 && <span className="text-xs font-bold text-white whitespace-nowrap">{count}</span>}
                                      </div>
                                      {count === 0 && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-blue-300">0</span>}
                                    </div>
                                    <div className="w-10 text-right text-xs text-blue-400 flex-shrink-0">
                                      {total > 0 ? `${Math.round((count / total) * 100)}%` : '—'}
                                    </div>
                                  </div>
                                )
                              })}
                              {rejected > 0 && (
                                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-blue-200">
                                  <div className="w-36 text-right text-xs font-medium text-red-500 flex-shrink-0">Rejected / Renege</div>
                                  <div className="flex-1 h-6 bg-red-50 rounded-lg flex items-center px-3">
                                    <span className="text-xs font-bold text-red-600">{rejected}</span>
                                  </div>
                                  <div className="w-10 text-right text-xs text-red-400">
                                    {total > 0 ? `${Math.round((rejected / total) * 100)}%` : '—'}
                                  </div>
                                </div>
                              )}
                              <div className="text-xs text-blue-400 text-right mt-1">
                                {total} total CVs · Conversion {total > 0 ? Math.round(((sc['joined']||0)/total)*100) : 0}%
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Per Recruiter / TL Breakdown ── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                    Per Member Pipeline Breakdown
                  </h3>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          {['Member','Role','Jobs','Total CVs','Active','Sourced',
                            'Screening','Interview','Docs','Offer','Joined',
                            'Rejected','Renege','On Hold','Stale ⚠','Rev. at Risk','Confirmed Rev.'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {recruiterStats.map(r => (
                          <tr key={r.id} className="hover:bg-gray-50 transition">
                            <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getRoleBadge(r.role)}`}>
                                {getRoleLabel(r.role)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-600">{r.jobsCount}</td>
                            <td className="px-3 py-2.5 text-xs font-bold text-gray-800">{r.total}</td>
                            <td className="px-3 py-2.5 text-xs font-bold text-blue-700">{r.active}</td>
                            <td className="px-3 py-2.5 text-xs text-gray-500">{r.sourced}</td>
                            <td className="px-3 py-2.5 text-xs font-medium text-yellow-700">{r.screening}</td>
                            <td className="px-3 py-2.5 text-xs font-medium text-orange-700">{r.interview}</td>
                            <td className="px-3 py-2.5 text-xs font-medium text-lime-700">{r.documentation}</td>
                            <td className="px-3 py-2.5 text-xs font-medium text-amber-700">{r.offer}</td>
                            <td className="px-3 py-2.5">
                              <span className={`text-xs font-bold ${r.joined > 0 ? 'text-green-700' : 'text-gray-400'}`}>{r.joined}</span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-red-500">{r.rejected || '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-orange-500">{r.renege || '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-gray-500">{r.onHold || '—'}</td>
                            <td className="px-3 py-2.5">
                              {r.stale > 0
                                ? <span className="text-xs font-bold text-red-600">⚠ {r.stale}</span>
                                : <span className="text-xs text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-xs font-bold text-orange-700">
                              {r.revenueAtRisk > 0 ? fmt(r.revenueAtRisk) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-xs font-bold text-green-700">
                              {r.confirmedRevenue > 0 ? fmt(r.confirmedRevenue) : '—'}
                            </td>
                          </tr>
                        ))}

                        {/* Totals row */}
                        <tr className="bg-blue-50 font-bold border-t-2 border-blue-300 text-xs">
                          <td className="px-3 py-2.5 text-blue-900" colSpan={3}>TEAM TOTAL</td>
                          <td className="px-3 py-2.5 text-gray-900">{recruiterStats.reduce((s,r)=>s+r.total,0)}</td>
                          <td className="px-3 py-2.5 text-blue-700">{recruiterStats.reduce((s,r)=>s+r.active,0)}</td>
                          <td className="px-3 py-2.5 text-gray-500">{recruiterStats.reduce((s,r)=>s+r.sourced,0)}</td>
                          <td className="px-3 py-2.5 text-yellow-700">{recruiterStats.reduce((s,r)=>s+r.screening,0)}</td>
                          <td className="px-3 py-2.5 text-orange-700">{recruiterStats.reduce((s,r)=>s+r.interview,0)}</td>
                          <td className="px-3 py-2.5 text-lime-700">{recruiterStats.reduce((s,r)=>s+r.documentation,0)}</td>
                          <td className="px-3 py-2.5 text-amber-700">{recruiterStats.reduce((s,r)=>s+r.offer,0)}</td>
                          <td className="px-3 py-2.5 text-green-700">{recruiterStats.reduce((s,r)=>s+r.joined,0)}</td>
                          <td className="px-3 py-2.5 text-red-500">{recruiterStats.reduce((s,r)=>s+r.rejected,0) || '—'}</td>
                          <td className="px-3 py-2.5 text-orange-500">{recruiterStats.reduce((s,r)=>s+r.renege,0) || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500">{recruiterStats.reduce((s,r)=>s+r.onHold,0) || '—'}</td>
                          <td className="px-3 py-2.5 text-red-600">
                            {recruiterStats.reduce((s,r)=>s+r.stale,0) > 0
                              ? `⚠ ${recruiterStats.reduce((s,r)=>s+r.stale,0)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-orange-700">{fmt(recruiterStats.reduce((s,r)=>s+r.revenueAtRisk,0))}</td>
                          <td className="px-3 py-2.5 text-green-700">{fmt(recruiterStats.reduce((s,r)=>s+r.confirmedRevenue,0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Stale CVs alert section ── */}
                {recruiterStats.some(r => r.stale > 0) && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">⚠️</span>
                      <h3 className="text-sm font-bold text-red-800">Stale Candidates — Needs Attention</h3>
                      <span className="text-xs text-red-500">(active candidates with no update in 30+ days)</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {recruiterStats.filter(r => r.stale > 0).map(r => (
                        <div key={r.id} className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-3 py-2">
                          <span className="text-sm font-semibold text-gray-800">{r.name}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${getRoleBadge(r.role)}`}>{getRoleLabel(r.role)}</span>
                          <span className="text-sm font-black text-red-600">{r.stale}</span>
                          <span className="text-xs text-gray-400">stale</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
          </>
        )}
      </div>

      {/* ── Confirm Close Modal ── */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-center mb-4">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-lg font-bold text-gray-900">Close this job?</h3>
              <p className="text-sm text-gray-600 mt-2">
                <span className="font-semibold">{confirmModal.jobTitle}</span> will be marked as{' '}
                <span className="font-semibold text-blue-700">Closed</span>.
                Recruiters will no longer be able to add candidates to it.
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setConfirmModal(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition">
                Cancel
              </button>
              <button onClick={() => applyStatusChange(confirmModal.jobId, confirmModal.newStatus)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition">
                Yes, Close Job
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}