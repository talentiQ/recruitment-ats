// app/sr-tl/jobs/page.tsx
'use client'
import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CandidateLite {
  id: string
  current_stage: string
  assigned_to: string
  revenue_earned: number | null
  expected_ctc: number | null
  full_name: string
  date_sourced: string | null
  last_activity_date: string | null
}

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
  clients: { company_name: string }
  recruiter_count: number
  recruiter_allocations: { id: string; name: string; positions: number }[]
  _candidates: CandidateLite[]
  _stageCounts: StageCounts
  _daysOpen: number
  _revenueAtRisk: number
  _confirmedRevenue: number
}

type StageCounts = { [stage: string]: number }
type PipelineCat = 'not_started' | 'screening' | 'interview' | 'documentation' | 'offer' | 'filled'

interface RecruiterBreakdownRow {
  recruiterId: string
  recruiterName: string
  total: number
  active: number
  joined: number
  stageCounts: StageCounts
}

const IN_PROGRESS_STAGES = [
  'sourced', 'screening', 'interview_scheduled', 'interview_completed',
  'documentation', 'offer_extended', 'offer_accepted', 'on_hold',
]

const TERMINAL_STAGES = ['joined', 'screening_rejected', 'interview_rejected', 'offer_rejected', 'renege']
const REJECTED_STAGES = ['screening_rejected', 'interview_rejected', 'offer_rejected', 'renege']

const JOB_STATUS_OPTIONS = [
  { value: 'open',        label: 'Open',        color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'in_progress', label: 'In Progress',  color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'on_hold',     label: 'On Hold',      color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'closed',      label: 'Closed',       color: 'bg-blue-100 text-blue-800 border-blue-300' },
]

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

function getPipelineCat(sc: StageCounts): PipelineCat {
  if ((sc['joined'] || 0) > 0) return 'filled'
  if ((sc['offer_extended'] || 0) + (sc['offer_accepted'] || 0) > 0) return 'offer'
  if ((sc['documentation'] || 0) > 0) return 'documentation'
  if ((sc['interview_scheduled'] || 0) + (sc['interview_completed'] || 0) > 0) return 'interview'
  if ((sc['screening'] || 0) > 0) return 'screening'
  return 'not_started'
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

export default function SrTLJobsPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [user, setUser] = useState<any>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ jobId: string; jobTitle: string; newStatus: string } | null>(null)

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'jobs' | 'analytics'>('jobs')

  // ── Analytics tab state ───────────────────────────────────────────────────
  const [analyticsStatusFilter, setAnalyticsStatusFilter] = useState('open')
  const [analyticsCatFilter, setAnalyticsCatFilter] = useState<PipelineCat | 'all'>('all')
  const [analyticsSearch, setAnalyticsSearch] = useState('')
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadJobs(parsedUser)
    }
  }, [])

  const loadJobs = async (currentUser: any) => {
    setLoading(true)
    try {
      // ── Step 1: Get all TLs who report directly to this Sr.TL ──────────────
      const { data: tlsUnder } = await supabase
        .from('users')
        .select('id, team_id')
        .eq('reports_to', currentUser.id)
        .eq('role', 'team_leader')
        .eq('is_active', true)

      // ── Step 2: Collect all team_ids — Sr.TL's own + all TLs under them ────
      const allTeamIds = [
        currentUser.team_id,
        ...(tlsUnder || []).map((t: any) => t.team_id),
      ].filter(Boolean)

      if (allTeamIds.length === 0) {
        setJobs([])
        setLoading(false)
        return
      }

      // ── Step 3: Fetch jobs across all those team_ids ────────────────────────
      // NOTE: candidate select expanded to include fields needed for analytics tab
      // (assigned_to, revenue_earned, expected_ctc, full_name, dates) without
      // touching the existing job-management columns above.
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select(`
          *,
          clients (company_name),
          candidates (
            id, current_stage, assigned_to, revenue_earned, expected_ctc,
            full_name, date_sourced, last_activity_date
          )
        `)
        .in('assigned_team_id', allTeamIds)
        .order('created_at', { ascending: false })

      if (jobsError) throw jobsError

      const jobIds = jobsData?.map(j => j.id) || []

      // ── Step 4: Fetch recruiter assignments for those jobs ─────────────────
      const { data: assignments } = await supabase
        .from('job_recruiter_assignments')
        .select(`
          job_id,
          positions_allocated,
          users:recruiter_id (id, full_name)
        `)
        .in('job_id', jobIds)
        .eq('is_active', true)

      const assignmentsByJob: { [key: string]: any[] } = {}
      assignments?.forEach(a => {
        if (!assignmentsByJob[a.job_id]) assignmentsByJob[a.job_id] = []
        const u = Array.isArray(a.users) ? a.users[0] : a.users
        assignmentsByJob[a.job_id].push({ id: u.id, name: u.full_name, positions: a.positions_allocated })
      })

      // ── Step 5: Fetch offers for revenue at risk / confirmed (analytics) ───
      const { data: offers } = await supabase
        .from('offers')
        .select(`
          candidate_id, status, expected_revenue, fixed_ctc, revenue_percentage,
          candidates!inner(job_id, current_stage)
        `)
        .in('candidates.job_id', jobIds.length > 0 ? jobIds : ['__none__'])
        .in('status', ['extended', 'accepted', 'joined'])

      const offersByJob: Record<string, any[]> = {}
      ;(offers || []).forEach((o: any) => {
        const jid = (o.candidates as any)?.job_id
        if (!jid) return
        if (!offersByJob[jid]) offersByJob[jid] = []
        offersByJob[jid].push(o)
      })

      const now = Date.now()

      // ── Step 6: Enrich jobs with candidate counts + allocations + analytics ─
      const jobsWithAllocations = (jobsData || []).map(job => {
        const candidates: CandidateLite[] = job.candidates || []
        const inProgressCount = candidates.filter((c: any) =>
          IN_PROGRESS_STAGES.includes(c.current_stage)
        ).length

        const stageCounts: StageCounts = {}
        candidates.forEach((c: any) => {
          stageCounts[c.current_stage] = (stageCounts[c.current_stage] || 0) + 1
        })

        const jOffers = offersByJob[job.id] || []
        const revenueAtRisk = jOffers
          .filter((o: any) => o.status === 'extended')
          .reduce((s: number, o: any) =>
            s + (o.expected_revenue || ((o.fixed_ctc || 0) * (o.revenue_percentage || 8.33) / 100)), 0)

        const confirmedRevenue = jOffers
          .filter((o: any) =>
            ['accepted', 'joined'].includes(o.status) &&
            (o.candidates as any)?.current_stage !== 'renege'
          )
          .reduce((s: number, o: any) =>
            s + (o.expected_revenue || ((o.fixed_ctc || 0) * (o.revenue_percentage || 8.33) / 100)), 0)

        const daysOpen = Math.floor((now - new Date(job.created_at).getTime()) / 86400000)

        return {
          ...job,
          candidate_count: candidates.length,
          in_progress_count: inProgressCount,
          recruiter_count: assignmentsByJob[job.id]?.length || 0,
          recruiter_allocations: assignmentsByJob[job.id] || [],
          _candidates: candidates,
          _stageCounts: stageCounts,
          _daysOpen: daysOpen,
          _revenueAtRisk: revenueAtRisk,
          _confirmedRevenue: confirmedRevenue,
        } as Job
      })

      setJobs(jobsWithAllocations)
    } catch (error) {
      console.error('Error loading jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = (jobId: string, jobTitle: string, newStatus: string) => {
    if (newStatus === 'closed') {
      setConfirmModal({ jobId, jobTitle, newStatus })
    } else {
      applyStatusChange(jobId, newStatus)
    }
  }

  const applyStatusChange = async (jobId: string, newStatus: string) => {
    setConfirmModal(null)
    setUpdatingStatus(jobId)
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', jobId)

      if (error) throw error

      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
    } catch (error) {
      console.error('Error updating job status:', error)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdatingStatus(null)
    }
  }

  // ── Search + status filter applied together (Jobs tab) ──
  const filteredJobs = jobs.filter(j => {
    const matchesStatus = statusFilter === 'all' || j.status === statusFilter
    const q = searchQuery.toLowerCase().trim()
    const matchesSearch = !q || (
      j.job_title?.toLowerCase().includes(q) ||
      j.location?.toLowerCase().includes(q) ||
      j.clients?.company_name?.toLowerCase().includes(q) ||
      j.job_code?.toLowerCase().includes(q)
    )
    return matchesStatus && matchesSearch
  })

  const getStatusBadge = (status: string) => {
    const opt = JOB_STATUS_OPTIONS.find(o => o.value === status)
    return opt?.color || 'bg-gray-100 text-gray-700 border-gray-300'
  }

  const getPriorityBadge = (priority: string) => {
    const badges: { [key: string]: string } = {
      high:   'badge-danger',
      medium: 'badge-warning',
      low:    'bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-semibold'
    }
    return badges[priority] || 'badge-warning'
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── ANALYTICS TAB LOGIC (job-first) ───────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════

  const jobsWithCat = useMemo(() =>
    jobs.map(j => ({ ...j, _pipelineCat: getPipelineCat(j._stageCounts) })),
    [jobs]
  )

  const analyticsFiltered = useMemo(() => {
    let r = [...jobsWithCat]
    if (analyticsStatusFilter !== 'all') r = r.filter(j => j.status === analyticsStatusFilter)
    if (analyticsCatFilter !== 'all')    r = r.filter(j => (j as any)._pipelineCat === analyticsCatFilter)
    if (analyticsSearch.trim()) {
      const q = analyticsSearch.toLowerCase()
      r = r.filter(j =>
        j.job_title.toLowerCase().includes(q) ||
        j.job_code.toLowerCase().includes(q) ||
        j.clients?.company_name?.toLowerCase().includes(q)
      )
    }
    return r
  }, [jobsWithCat, analyticsStatusFilter, analyticsCatFilter, analyticsSearch])

  // KPI cards — scoped to team's OPEN jobs only
  const openJobsForKpi = jobsWithCat.filter(j => j.status === 'open')
  const analyticsKpi = {
    totalPositionSlots: openJobsForKpi.reduce((s, j) => s + (j.positions || 0), 0),
    openJobCount:       openJobsForKpi.length,
    not_started:        openJobsForKpi.filter(j => (j as any)._pipelineCat === 'not_started').length,
    screening:          openJobsForKpi.filter(j => (j as any)._pipelineCat === 'screening').length,
    interview:          openJobsForKpi.filter(j => (j as any)._pipelineCat === 'interview').length,
    documentation:      openJobsForKpi.filter(j => (j as any)._pipelineCat === 'documentation').length,
    offer:              openJobsForKpi.filter(j => (j as any)._pipelineCat === 'offer').length,
    filledPositions:    openJobsForKpi.reduce((s, j) => s + (j.positions_filled || 0), 0),
    totalRevenueAtRisk: openJobsForKpi.reduce((s, j) => s + j._revenueAtRisk, 0),
    confirmedRevenue:   jobsWithCat.reduce((s, j) => s + j._confirmedRevenue, 0),
  }

  const toggleJobExpand = (jobId: string) => {
    setExpandedJobs(prev => {
      const n = new Set(prev)
      n.has(jobId) ? n.delete(jobId) : n.add(jobId)
      return n
    })
  }

  // Build recruiter-wise breakdown for a single job (job-first drill-down)
  const getRecruiterBreakdown = (job: Job): RecruiterBreakdownRow[] => {
    const byRecruiter: Record<string, RecruiterBreakdownRow> = {}
    job._candidates.forEach((c: any) => {
      const rid = c.assigned_to
      if (!rid) return
      if (!byRecruiter[rid]) {
        // Try to find name from recruiter_allocations, else fallback
        const alloc = job.recruiter_allocations.find(a => a.id === rid)
        byRecruiter[rid] = {
          recruiterId: rid,
          recruiterName: alloc?.name || 'Unknown',
          total: 0, active: 0, joined: 0, stageCounts: {},
        }
      }
      const row = byRecruiter[rid]
      row.total++
      row.stageCounts[c.current_stage] = (row.stageCounts[c.current_stage] || 0) + 1
      if (!TERMINAL_STAGES.includes(c.current_stage)) row.active++
      if (c.current_stage === 'joined') row.joined++
    })
    return Object.values(byRecruiter).sort((a, b) => b.joined - a.joined || b.active - a.active)
  }

  const catDot: Record<PipelineCat, string> = {
    not_started: 'bg-red-500', screening: 'bg-yellow-400',
    interview: 'bg-orange-400', documentation: 'bg-lime-500',
    offer: 'bg-[#6b7c3d]', filled: 'bg-green-600',
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">

        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Team Jobs</h2>
            <p className="text-gray-600">Manage job assignments, track progress, and analyse recruiter performance</p>
          </div>
          {activeTab === 'jobs' && (
            <button onClick={() => router.push('/sr-tl/jobs/add')} className="btn-primary">
              + Add New Job
            </button>
          )}
        </div>

        {/* ── Tab switcher ── */}
        <div className="bg-white rounded-lg shadow border border-gray-100">
          <div className="flex border-b border-gray-200">
            {[
              { key: 'jobs',      label: `📋 Jobs (${jobs.length})` },
              { key: 'analytics', label: '📊 Pipeline Analytics' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key as any)}
                className={`px-6 py-4 font-medium border-b-2 transition ${
                  activeTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            TAB 1: JOBS (existing — unchanged)
        ════════════════════════════════════════════════════════════════ */}
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
                <div className="kpi-value">{jobs.reduce((sum, j) => sum + (j.in_progress_count || 0), 0)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-title">Total Candidates</div>
                <div className="kpi-value">{jobs.reduce((sum, j) => sum + (j.candidate_count || 0), 0)}</div>
              </div>
            </div>

            {/* ── Search + Filter ── */}
            <div className="card">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">🔍</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by job title, location, client or job code…"
                    className="input w-full pl-9"
                  />
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

            {loading ? (
              <div className="card text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-gray-500 text-lg mb-1">No jobs found</p>
                {(searchQuery || statusFilter !== 'all') && (
                  <p className="text-sm text-gray-400 mb-4">Try clearing your search or filter</p>
                )}
                {!searchQuery && statusFilter === 'all' && (
                  <button onClick={() => router.push('/sr-tl/jobs/add')} className="mt-4 btn-primary">
                    Create First Job
                  </button>
                )}
                {(searchQuery || statusFilter !== 'all') && (
                  <button onClick={() => { setSearchQuery(''); setStatusFilter('all') }}
                    className="mt-2 text-sm text-blue-600 hover:underline">
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="card overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Job Code</th>
                      <th>Job Title</th>
                      <th>Client</th>
                      <th>Location</th>
                      <th>Experience</th>
                      <th>CTC Range</th>
                      <th>Positions</th>
                      <th>Candidates</th>
                      <th>In Progress</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Recruiters</th>
                      <th>Actions</th>
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
                          <button onClick={() => router.push(`/sr-tl/jobs/${job.id}/candidates`)}
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
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>Saving…
                            </div>
                          ) : (
                            <select value={job.status} onChange={e => handleStatusChange(job.id, job.job_title, e.target.value)}
                              className={`px-2 py-1 rounded-lg text-xs font-semibold border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${getStatusBadge(job.status)}`}>
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
                                {job.recruiter_allocations.map((alloc: any) => (
                                  <div key={alloc.id}>{alloc.name}: {alloc.positions}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <button onClick={() => router.push(`/sr-tl/jobs/${job.id}`)} className="text-blue-600 hover:text-blue-900 font-medium text-sm">View</button>
                            <button onClick={() => router.push(`/sr-tl/jobs/${job.id}/add-candidate`)} className="text-green-600 hover:text-green-900 font-medium text-sm">+ Add</button>
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

        {/* ════════════════════════════════════════════════════════════════
            TAB 2: PIPELINE ANALYTICS (new, job-first)
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'analytics' && (
          <>
            {/* Revenue summary banner */}
            <div className="bg-gradient-to-r from-indigo-700 to-blue-700 rounded-xl p-5 text-white flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-bold text-lg">📊 Team Pipeline Health</div>
                <div className="text-indigo-200 text-sm">Scoped to your team's jobs · {analyticsKpi.openJobCount} open jobs</div>
              </div>
              <div className="flex gap-4 text-right">
                
              </div>
            </div>

            {/* KPI Strip — 7 cards, same scheme as management */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div onClick={() => { setAnalyticsStatusFilter('open'); setAnalyticsCatFilter('all') }}
                className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md bg-white border-gray-200 ${analyticsCatFilter === 'all' ? 'ring-2 ring-blue-400' : ''}`}>
                <div className="text-xs font-semibold text-gray-500 mb-1 leading-tight">Open Position Slots</div>
                <div className="text-3xl font-black text-gray-900">{analyticsKpi.totalPositionSlots}</div>
                <div className="text-xs text-gray-400 mt-1">{analyticsKpi.openJobCount} open jobs</div>
              </div>

              <div onClick={() => { setAnalyticsStatusFilter('open'); setAnalyticsCatFilter('not_started') }}
                className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md bg-red-50 border-red-400 ${analyticsCatFilter === 'not_started' ? 'ring-2 ring-red-400' : ''}`}>
                <div className="text-xs font-semibold text-red-600 mb-1 leading-tight">🔴 No CVs Yet</div>
                <div className="text-3xl font-black text-red-700">{analyticsKpi.not_started}</div>
                <div className="text-xs text-red-400 mt-1">jobs not started</div>
              </div>

              <div onClick={() => { setAnalyticsStatusFilter('open'); setAnalyticsCatFilter('screening') }}
                className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md bg-yellow-50 border-yellow-400 ${analyticsCatFilter === 'screening' ? 'ring-2 ring-yellow-400' : ''}`}>
                <div className="text-xs font-semibold text-yellow-700 mb-1 leading-tight">🟡 Screening</div>
                <div className="text-3xl font-black text-yellow-700">{analyticsKpi.screening}</div>
                <div className="text-xs text-yellow-500 mt-1">CVs sent to client</div>
              </div>

              <div onClick={() => { setAnalyticsStatusFilter('open'); setAnalyticsCatFilter('interview') }}
                className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md bg-orange-50 border-orange-400 ${analyticsCatFilter === 'interview' ? 'ring-2 ring-orange-400' : ''}`}>
                <div className="text-xs font-semibold text-orange-700 mb-1 leading-tight">🟠 Interview</div>
                <div className="text-3xl font-black text-orange-700">{analyticsKpi.interview}</div>
                <div className="text-xs text-orange-400 mt-1">active interviews</div>
              </div>

              <div onClick={() => { setAnalyticsStatusFilter('open'); setAnalyticsCatFilter('documentation') }}
                className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md bg-lime-50 border-lime-400 ${analyticsCatFilter === 'documentation' ? 'ring-2 ring-lime-400' : ''}`}>
                <div className="text-xs font-semibold text-lime-700 mb-1 leading-tight">🟢 Docs</div>
                <div className="text-3xl font-black text-lime-700">{analyticsKpi.documentation}</div>
                <div className="text-xs text-lime-500 mt-1">pre-offer docs</div>
              </div>

              <div onClick={() => { setAnalyticsStatusFilter('open'); setAnalyticsCatFilter('offer') }}
                className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md bg-[#6b7c3d]/10 border-[#6b7c3d] ${analyticsCatFilter === 'offer' ? 'ring-2 ring-[#6b7c3d]' : ''}`}>
                <div className="text-xs font-semibold text-[#4a5729] mb-1 leading-tight">🫒 Offer Stage</div>
                <div className="text-3xl font-black text-[#4a5729]">{analyticsKpi.offer}</div>
                <div className="text-xs text-[#6b7c3d] mt-1">extended / accepted</div>
              </div>

              <div onClick={() => { setAnalyticsStatusFilter('all'); setAnalyticsCatFilter('filled') }}
                className={`rounded-xl border-2 p-4 text-center cursor-pointer transition hover:shadow-md bg-green-50 border-green-600 ${analyticsCatFilter === 'filled' ? 'ring-2 ring-green-600' : ''}`}>
                <div className="text-xs font-semibold text-green-700 mb-1 leading-tight">✅ Filled</div>
                <div className="text-3xl font-black text-green-800">{analyticsKpi.filledPositions}</div>
                <div className="text-xs text-green-500 mt-1">positions joined</div>
              </div>
            </div>

            {/* Filters */}
            <div className="card">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Search</label>
                  <input type="text" value={analyticsSearch} onChange={e => setAnalyticsSearch(e.target.value)}
                    placeholder="Job title, code, client…" className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
                  <select value={analyticsStatusFilter} onChange={e => setAnalyticsStatusFilter(e.target.value)} className="input w-full">
                    <option value="all">All Statuses</option>
                    {JOB_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Pipeline Stage</label>
                  <select value={analyticsCatFilter} onChange={e => setAnalyticsCatFilter(e.target.value as any)} className="input w-full">
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
                <span className="text-sm text-gray-500">Showing <strong>{analyticsFiltered.length}</strong> jobs</span>
                {(analyticsSearch || analyticsStatusFilter !== 'open' || analyticsCatFilter !== 'all') && (
                  <button onClick={() => { setAnalyticsSearch(''); setAnalyticsStatusFilter('open'); setAnalyticsCatFilter('all') }}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium">✕ Clear filters</button>
                )}
              </div>
            </div>

            {/* Job-first list with expandable recruiter breakdown */}
            {loading ? (
              <div className="card text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : analyticsFiltered.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-gray-500">No jobs match your filters</p>
              </div>
            ) : (
              <div className="space-y-3">
                {analyticsFiltered.map(job => {
                  const cat = (job as any)._pipelineCat as PipelineCat
                  const isOpen = expandedJobs.has(job.id)
                  const recruiterRows = isOpen ? getRecruiterBreakdown(job) : []
                  const totalCands = Object.values(job._stageCounts).reduce((a, b) => a + b, 0)
                  const rejectedCount = REJECTED_STAGES.reduce((s, k) => s + (job._stageCounts[k] || 0), 0)
                  const maxStageCount = Math.max(...FUNNEL_STAGES.map(s => job._stageCounts[s.key] || 0), 1)

                  return (
                    <div key={job.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      {/* Row header — click to expand */}
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition"
                        onClick={() => toggleJobExpand(job.id)}>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-gray-400 flex-shrink-0">{isOpen ? '▼' : '▶'}</span>
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${catDot[cat]}`} />
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{job.job_title}</div>
                            <div className="text-xs text-gray-500">{job.job_code} · {job.clients?.company_name}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 flex-shrink-0">
                          <div className="text-center">
                            <div className="text-xs text-gray-400">Positions</div>
                            <div className="font-bold text-sm">{job.positions_filled}/{job.positions}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-400">Days Open</div>
                            <div className={`font-bold text-sm ${job._daysOpen > 90 ? 'text-red-600' : job._daysOpen > 60 ? 'text-orange-500' : 'text-gray-700'}`}>{job._daysOpen}d</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-400">Recruiters</div>
                            <div className="font-bold text-sm text-purple-700">{job.recruiter_count}</div>
                          </div>
                          {job._revenueAtRisk > 0 && (
                            <div className="text-center">
                              <div className="text-xs text-gray-400">At Risk</div>
                              <div className="font-bold text-sm text-orange-700">{fmt(job._revenueAtRisk)}</div>
                            </div>
                          )}
                          {job._confirmedRevenue > 0 && (
                            <div className="text-center">
                              <div className="text-xs text-gray-400">Confirmed</div>
                              <div className="font-bold text-sm text-green-700">{fmt(job._confirmedRevenue)}</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expanded: funnel + recruiter breakdown */}
                      {isOpen && (
                        <div className="border-t border-gray-100 p-5 bg-gray-50/50 space-y-5">

                          {/* Funnel */}
                          <div>
                            <h4 className="text-xs font-bold text-gray-700 uppercase mb-3">Candidate Funnel</h4>
                            <div className="space-y-1.5">
                              {FUNNEL_STAGES.map(s => {
                                const count = job._stageCounts[s.key] || 0
                                const pct = maxStageCount > 0 ? Math.max((count / maxStageCount) * 100, count > 0 ? 4 : 0) : 0
                                return (
                                  <div key={s.key} className="flex items-center gap-3">
                                    <div className="w-32 text-right text-xs font-medium text-gray-600 flex-shrink-0">{s.label}</div>
                                    <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                                      <div className={`h-full ${s.color} rounded-lg flex items-center px-3 transition-all duration-500`} style={{ width: `${pct}%` }}>
                                        {count > 0 && <span className={`text-xs font-bold ${s.text}`}>{count}</span>}
                                      </div>
                                      {count === 0 && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">0</span>}
                                    </div>
                                    <div className="w-10 text-right text-xs text-gray-400 flex-shrink-0">
                                      {totalCands > 0 ? `${Math.round((count / totalCands) * 100)}%` : '—'}
                                    </div>
                                  </div>
                                )
                              })}
                              {rejectedCount > 0 && (
                                <div className="flex items-center gap-3 pt-1 border-t border-gray-200">
                                  <div className="w-32 text-right text-xs font-medium text-red-500 flex-shrink-0">Rejected / Renege</div>
                                  <div className="flex-1 h-6 bg-red-50 rounded-lg flex items-center px-3">
                                    <span className="text-xs font-bold text-red-600">{rejectedCount}</span>
                                  </div>
                                  <div className="w-10 text-right text-xs text-red-400">
                                    {totalCands > 0 ? `${Math.round((rejectedCount / totalCands) * 100)}%` : '—'}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Recruiter breakdown table */}
                          <div>
                            <h4 className="text-xs font-bold text-gray-700 uppercase mb-3">Recruiter-wise Performance on this Job</h4>
                            {recruiterRows.length === 0 ? (
                              <div className="text-sm text-gray-400 bg-white rounded-lg p-4 text-center">No candidates sourced yet for this job</div>
                            ) : (
                              <div className="overflow-x-auto bg-white rounded-lg border border-gray-100">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Recruiter</th>
                                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Sourced</th>
                                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Screening</th>
                                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Interview</th>
                                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Offer</th>
                                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Joined</th>
                                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Active</th>
                                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {recruiterRows.map(r => {
                                      const interview = (r.stageCounts['interview_scheduled'] || 0) + (r.stageCounts['interview_completed'] || 0)
                                      const offer = (r.stageCounts['offer_extended'] || 0) + (r.stageCounts['offer_accepted'] || 0)
                                      return (
                                        <tr key={r.recruiterId} className="hover:bg-gray-50">
                                          <td className="px-3 py-2 font-medium text-gray-800">{r.recruiterName}</td>
                                          <td className="px-3 py-2 text-center text-gray-700">{r.stageCounts['sourced'] || 0}</td>
                                          <td className="px-3 py-2 text-center text-yellow-700">{r.stageCounts['screening'] || 0}</td>
                                          <td className="px-3 py-2 text-center text-orange-700">{interview}</td>
                                          <td className="px-3 py-2 text-center text-[#4a5729]">{offer}</td>
                                          <td className="px-3 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.joined > 0 ? 'bg-green-100 text-green-800' : 'text-gray-400'}`}>{r.joined}</span>
                                          </td>
                                          <td className="px-3 py-2 text-center text-blue-700 font-medium">{r.active}</td>
                                          <td className="px-3 py-2 text-center font-bold text-gray-900">{r.total}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
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
                <span className="font-semibold">{confirmModal.jobTitle}</span> will be marked as <span className="font-semibold text-blue-700">Closed</span>.
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