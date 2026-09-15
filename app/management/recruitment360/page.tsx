'use client'
export const dynamic = 'force-dynamic'

/*
 ╔══════════════════════════════════════════════════════════════════╗
 ║  Recruitment360° · TalentIQ ATS                                 ║
 ║  Route: app/(your-path)/recruitment360/page.tsx                  ║
 ║                                                                  ║
 ║  Uses ONLY existing tables — no migrations required:             ║
 ║    candidates   (current_stage, assigned_to, revenue_earned …)  ║
 ║    jobs         (assigned_recruiters[], client_id …)            ║
 ║    offers       (expected_revenue, billable_ctc …)              ║
 ║    users        (id, full_name, role, reports_to …)             ║
 ║    clients      (id, company_name)                               ║
 ╚══════════════════════════════════════════════════════════════════╝
*/

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell, Legend,
} from 'recharts'

// ─── Types matching actual TalentIQ schema ────────────────────────────────────

type CandidateStage =
  | 'sourced' | 'screening' | 'screening_rejected'
  | 'interview_scheduled' | 'interview_completed' | 'interview_rejected'
  | 'documentation' | 'offer_extended' | 'offer_accepted' | 'offer_rejected'
  | 'joined' | 'renege' | 'on_hold'

interface Candidate {
  id: string
  full_name: string
  current_stage: CandidateStage
  assigned_to: string
  job_id: string
  date_sourced: string | null
  date_joined: string | null
  date_dropped: string | null
  current_ctc: number | null
  offered_fixed: number | null
  billable_ctc: number | null
  revenue_earned: number | null
  revenue_month: string | null
  revenue_year: number | null
  is_renege: boolean
  drop_off_stage: string | null
  // computed
  _srcMthIdx: number
  _jndMthIdx: number
}

interface Job {
  id: string
  job_title: string
  job_code: string | null
  status: string
  created_at: string
  positions: number
  positions_filled: number
  client: { id: string; company_name: string } | null
  _createdMthIdx: number
  candidates: Candidate[]
}

interface RecruiterUser {
  id: string; full_name: string; role: string
  monthly_target: number; quarterly_target: number; annual_target: number
}

// ─── Stage configuration (real candidate stage values) ────────────────────────

/** Rank a stage reached — used for cumulative funnel counting */
const STAGE_RANK: Record<string, number> = {
  sourced:              0,
  screening:            1,
  screening_rejected:   1,  // reached screening → rejected there
  interview_scheduled:  2,
  interview_completed:  3,
  interview_rejected:   3,  // reached interview → rejected there
  documentation:        4,
  offer_extended:       5,
  offer_accepted:       6,
  offer_rejected:       6,  // reached offer → rejected there
  joined:               7,
  renege:               7,  // reached joined → then reneged
  on_hold:             -1,  // paused — exclude from funnel
}

const STAGE_LABEL: Record<string, string> = {
  sourced:             'CV Sourced',         screening:           'Screening',
  screening_rejected:  'Screening Rejected', interview_scheduled: 'Interview Scheduled',
  interview_completed: 'Interview Done',     interview_rejected:  'Interview Rejected',
  documentation:       'Documentation',      offer_extended:      'Offer Extended',
  offer_accepted:      'Offer Accepted',     offer_rejected:      'Offer Rejected',
  joined:              'Joined',             renege:              'Renege',
  on_hold:             'On Hold',
}

const STAGE_COLOR: Record<string, string> = {
  sourced:'#3b82f6',            screening:'#6366f1',          screening_rejected:'#94a3b8',
  interview_scheduled:'#8b5cf6',interview_completed:'#f59e0b',interview_rejected:'#94a3b8',
  documentation:'#f97316',      offer_extended:'#22c55e',     offer_accepted:'#16a34a',
  offer_rejected:'#94a3b8',     joined:'#10b981',             renege:'#ef4444',
  on_hold:'#64748b',
}

/** 5 milestone funnel — maps your 13 stages to visible stages */
const FUNNEL = [
  { id:'sourced',    label:'Total CVs',      color:'#3b82f6', minRank:0 },  // ALL candidates in period
  { id:'screening',  label:'Screening',      color:'#8b5cf6', minRank:1 },
  { id:'interview',  label:'Interviewed',    color:'#f59e0b', minRank:2 },
  { id:'offer',      label:'Offer Extended', color:'#22c55e', minRank:5 },
  { id:'joined',     label:'Joined',         color:'#10b981', minRank:7 },
]

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS    = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const QUARTERS  = [
  { id:'q1', label:'Q1 · Apr–Jun', months:[0,1,2] },
  { id:'q2', label:'Q2 · Jul–Sep', months:[3,4,5] },
  { id:'q3', label:'Q3 · Oct–Dec', months:[6,7,8] },
  { id:'q4', label:'Q4 · Jan–Mar', months:[9,10,11] },
]
const FY_LIST        = ['2026-27', '2027-28', '2028-29']
const DEFAULT_TARGET = 300000  // fallback only if user has no target set in DB
const ALLOWED_ROLES  = ['team_leader','sr_team_leader','management','ops_head','ceo','system_admin']
const MGMT_ROLES     = ['management','ops_head','ceo','system_admin']

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fyYear    = (fy: string) => parseInt(fy.split('-')[0], 10)
const getFYRange = (fy: string) => {
  const y = fyYear(fy)
  return { start:`${y}-04-01`, end:`${y+1}-03-31`, startYear:y }
}
function toMthIdx(date: string | null, startYear: number): number {
  if (!date) return -1
  const d = new Date(date), y = d.getFullYear(), m = d.getMonth() + 1
  if (y === startYear     && m >= 4) return m - 4
  if (y === startYear + 1 && m <= 3) return m + 8
  return -1
}
const fmtL   = (v: number) => v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : `₹${(v/1000).toFixed(0)}K`
const fmtPct = (v: number) => `${Math.round(v)}%`
const tclr   = (p: number) => p >= 100 ? '#22c55e' : p >= 75 ? '#f59e0b' : '#ef4444'
const rank   = (s: string) => STAGE_RANK[s] ?? -1

// ─── Custom Tooltips ──────────────────────────────────────────────────────────

function BarTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const rev = payload.find((p: any) => p.dataKey === 'revenue')?.value ?? 0
  const tgt = payload.find((p: any) => p.dataKey === 'target')?.value ?? 0
  const pct = tgt > 0 ? ((rev / tgt) * 100).toFixed(0) : 0
  return (
    <div style={{ background:'#0f172a', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#fff' }}>
      <div style={{ fontWeight:700, marginBottom:6, fontSize:13 }}>{label}</div>
      <div style={{ color:'#4ade80' }}>Revenue · {fmtL(rev)}</div>
      <div style={{ color:'#93c5fd' }}>Target  · {fmtL(tgt)}</div>
      <div style={{ color:tclr(Number(pct)), fontWeight:700, marginTop:6 }}>{pct}% achieved</div>
      <div style={{ color:'rgba(255,255,255,0.35)', fontSize:10, marginTop:3 }}>Click bar to filter month</div>
    </div>
  )
}

function LineTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0f172a', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#fff' }}>
      <div style={{ fontWeight:700, marginBottom:6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color:p.color, marginTop:3 }}>{p.dataKey}: <strong>{p.value}</strong></div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Recruitment360Page() {
  const router = useRouter()
  const [authUser, setAuthUser]     = useState<any>(null)
  const [fy,       setFy]           = useState('2026-27')
  const [qtr,      setQtr]          = useState<string | null>(null)
  const [mth,      setMth]          = useState<number | null>(null)
  const [rid,      setRid]          = useState('all')
  const [fStage,   setFStage]       = useState<string | null>(null)
  const [jid,      setJid]          = useState<string | null>(null)
  const [recruiters,  setRecruiters]  = useState<RecruiterUser[]>([])
  const [candidates,  setCandidates]  = useState<Candidate[]>([])
  const [jobs,        setJobs]        = useState<Job[]>([])
  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const recsRef = useRef<RecruiterUser[]>([])

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ud = localStorage.getItem('user')
    if (!ud) { router.push('/'); return }
    const u = JSON.parse(ud)
    if (!ALLOWED_ROLES.includes(u.role)) { router.push('/'); return }
    setAuthUser(u)
    initLoad(u)
  }, [])

  async function initLoad(u: any) {
    await loadRecruiters(u)
    setAuthLoading(false)
  }

  // ── Load recruiter list ───────────────────────────────────────────────────
  async function loadRecruiters(u: any) {
    let data: RecruiterUser[] = []

    if (MGMT_ROLES.includes(u.role)) {
      const res = await supabase
        .from('users').select('id,full_name,role,monthly_target,quarterly_target,annual_target')
        .in('role', ['recruiter','team_leader','sr_team_leader'])
        .eq('is_active', true).order('full_name')
      data = res.data || []
    } else if (u.role === 'sr_team_leader') {
      const { data: tls } = await supabase.from('users').select('id').eq('reports_to', u.id).eq('is_active', true)
      const tlIds = (tls || []).map((t: any) => t.id)
      const { data: recs } = await supabase.from('users').select('id').in('reports_to', [u.id, ...tlIds]).eq('is_active', true)
      const allIds = [u.id, ...tlIds, ...(recs || []).map((r: any) => r.id)]
      const res = await supabase.from('users').select('id,full_name,role,monthly_target,quarterly_target,annual_target').in('id', allIds).eq('is_active', true).order('full_name')
      data = res.data || []
    } else {
      const { data: recs } = await supabase.from('users').select('id').eq('reports_to', u.id).eq('is_active', true)
      const allIds = [u.id, ...(recs || []).map((r: any) => r.id)]
      const res = await supabase.from('users').select('id,full_name,role,monthly_target,quarterly_target,annual_target').in('id', allIds).eq('is_active', true).order('full_name')
      data = res.data || []
    }

    recsRef.current = data
    setRecruiters(data)
    await loadData(fy, rid, data)
  }

  // ── Load data: candidates + jobs ─────────────────────────────────────────
  async function loadData(currentFy: string, currentRid: string, recs: RecruiterUser[]) {
    if (!recs.length) return
    setDataLoading(true)
    const { start, end, startYear } = getFYRange(currentFy)
    const recIds = currentRid === 'all' ? recs.map(r => r.id) : [currentRid]

    // ── Query A: Candidates sourced this FY (pipeline view)
    let pipeQ = supabase
      .from('candidates')
      .select(`
        id, full_name, current_stage, assigned_to, job_id,
        date_sourced, date_joined, date_dropped,
        current_ctc, offered_fixed, billable_ctc,
        revenue_earned, revenue_month, revenue_year,
        is_renege, drop_off_stage
      `)
      .gte('date_sourced', start)
      .lte('date_sourced', end)
      .in('assigned_to', recIds)

    // ── Query B: Candidates who JOINED this FY (revenue view — may be sourced in prior FY)
    let revQ = supabase
      .from('candidates')
      .select(`
        id, full_name, current_stage, assigned_to, job_id,
        date_sourced, date_joined, current_ctc, billable_ctc,
        revenue_earned, revenue_month, revenue_year, is_renege
      `)
      .gte('date_joined', start)
      .lte('date_joined', end)
      .in('assigned_to', recIds)
      .in('current_stage', ['joined', 'renege'])

    // ── Query C: Jobs allocated to recruiter (via assigned_recruiters array)
    let jobQ = supabase
      .from('jobs')
      .select(`
        id, job_title, job_code, status, created_at,
        positions, positions_filled,
        client:clients!client_id (id, company_name)
      `)
      .eq('is_active', true)

    if (currentRid !== 'all') {
      // Filter jobs assigned to this specific recruiter
      jobQ = jobQ.contains('assigned_recruiters', [currentRid])
    } else {
      // For "all", use created_at in FY range to limit scope
      jobQ = jobQ.gte('created_at', start).lte('created_at', end)
    }

    const [pipeRes, revRes, jobsRes] = await Promise.all([pipeQ, revQ, jobQ])

    // Merge pipeline + revenue candidates (dedup by id)
    const candMap = new Map<string, any>()
    ;(pipeRes.data || []).forEach(c => candMap.set(c.id, c))
    ;(revRes.data  || []).forEach(c => { if (!candMap.has(c.id)) candMap.set(c.id, c) })
    const allCandRaw = Array.from(candMap.values())

    // Enrich candidates
    const enrichedCands: Candidate[] = allCandRaw.map(c => ({
      ...c,
      _srcMthIdx: toMthIdx(c.date_sourced, startYear),
      _jndMthIdx: toMthIdx(c.date_joined,  startYear),
    }))

    // Build job→candidate map
    const jobCandMap = new Map<string, Candidate[]>()
    enrichedCands.forEach(c => {
      const arr = jobCandMap.get(c.job_id) ?? []
      arr.push(c)
      jobCandMap.set(c.job_id, arr)
    })

    // Enrich allocated jobs
    const rawJobs = jobsRes.data || []
    const enrichedJobs: Job[] = rawJobs.map((j: any) => ({
      id: j.id, job_title: j.job_title, job_code: j.job_code,
      status: j.status, created_at: j.created_at,
      positions: j.positions ?? 1, positions_filled: j.positions_filled ?? 0,
      client: j.client ?? null,
      _createdMthIdx: toMthIdx(j.created_at, startYear),
      candidates: jobCandMap.get(j.id) ?? [],
    }))

    // Add jobs that have candidates but weren't in the allocated list
    const allocatedIds = new Set(rawJobs.map((j: any) => j.id))
    const extraIds = [...new Set(enrichedCands.map(c => c.job_id).filter(id => !allocatedIds.has(id)))]

    if (extraIds.length > 0) {
      const { data: extraJobs } = await supabase
        .from('jobs')
        .select('id, job_title, job_code, status, created_at, positions, positions_filled, client:clients!client_id(id, company_name)')
        .in('id', extraIds)

      ;(extraJobs || []).forEach((j: any) => {
        enrichedJobs.push({
          id: j.id, job_title: j.job_title, job_code: j.job_code,
          status: j.status, created_at: j.created_at,
          positions: j.positions ?? 1, positions_filled: j.positions_filled ?? 0,
          client: j.client ?? null,
          _createdMthIdx: toMthIdx(j.created_at, startYear),
          candidates: jobCandMap.get(j.id) ?? [],
        })
      })
    }

    setCandidates(enrichedCands)
    setJobs(enrichedJobs)
    setDataLoading(false)
  }

  // Reload when FY or recruiter changes
  useEffect(() => {
    if (!authUser || !recsRef.current.length) return
    loadData(fy, rid, recsRef.current)
  }, [fy, rid])

  // ── Active months from quarter / month filter ─────────────────────────────
  const activeMths = useMemo(() => {
    if (mth !== null) return [mth]
    if (qtr) return QUARTERS.find(q => q.id === qtr)?.months ?? MONTHS.map((_, i) => i)
    return MONTHS.map((_, i) => i)
  }, [mth, qtr])

  // ── Aggregated dashboard data ─────────────────────────────────────────────
  const D = useMemo(() => {
    // Pipeline candidates = sourced in active months
    const pipelineCands = candidates.filter(c => activeMths.includes(c._srcMthIdx))

    // Revenue candidates = joined in FY (any month or filtered months)
    const revenueCands = candidates.filter(c =>
      c._jndMthIdx >= 0 &&
      activeMths.includes(c._jndMthIdx) &&
      ['joined','renege'].includes(c.current_stage) &&
      (c.revenue_earned ?? 0) > 0
    )

    // Jobs with candidates filtered to active months
    const filtJobs = jobs.map(j => ({
      ...j,
      candidates: j.candidates.filter(c => activeMths.includes(c._srcMthIdx)),
    }))

    // Funnel: cumulative "at or beyond each milestone"
    // Total CVs (minRank 0) → include on_hold (they ARE in the pipeline)
    // Milestones (minRank > 0) → on_hold rank -1 auto-excludes them — no extra check needed
    const funnelData = FUNNEL.map(ms => ({
      ...ms,
      count: pipelineCands.filter(c =>
        ms.minRank === 0 ? true : rank(c.current_stage) >= ms.minRank
      ).length,
    }))

    // Monthly revenue (from joined candidates, by join month)
    const monthlyRevenue = MONTHS.map((_, mi) =>
      candidates
        .filter(c => c._jndMthIdx === mi && ['joined','renege'].includes(c.current_stage) && (c.revenue_earned ?? 0) > 0)
        .reduce((s, c) => s + (c.revenue_earned ?? 0), 0)
    )

    // ── Targets from users.monthly_target / quarterly_target / annual_target ──
    const activeRecs    = rid === 'all' ? recruiters : recruiters.filter(r => r.id === rid)
    const sumMonthly    = activeRecs.reduce((s, r) => s + (r.monthly_target   ?? 0), 0) || DEFAULT_TARGET
    const sumQuarterly  = activeRecs.reduce((s, r) => s + (r.quarterly_target ?? 0), 0) || sumMonthly * 3
    const sumAnnual     = activeRecs.reduce((s, r) => s + (r.annual_target    ?? 0), 0) || sumMonthly * 12

    // Chart bars always use monthly_target per month
    const monthlyTarget = MONTHS.map(() => sumMonthly)

    // Period-appropriate total target for KPIs and pct
    const totalTarget =
      mth !== null ? sumMonthly   :
      qtr !== null ? sumQuarterly :
                     sumAnnual

    // KPIs
    const totalRevenue = activeMths.reduce((s, mi) => s + monthlyRevenue[mi], 0)
    const pct          = totalTarget > 0 ? (totalRevenue / totalTarget) * 100 : 0

    // Chart data (all 12 months, non-active greyed)
    const chartData = MONTHS.map((m, mi) => ({
      month: m, revenue: monthlyRevenue[mi], target: monthlyTarget[mi], inFilter: activeMths.includes(mi),
    }))

    // Trend data (by sourced month)
    const trendData = MONTHS.map((m, mi) => {
      const mc = candidates.filter(c => c._srcMthIdx === mi)
      return {
        month: m,
        'Total CVs':   mc.length,
        'Screening':   mc.filter(c => rank(c.current_stage) >= 1 && c.current_stage !== 'on_hold').length,
        'Interviewed': mc.filter(c => rank(c.current_stage) >= 2 && c.current_stage !== 'on_hold').length,
        'Joined':      mc.filter(c => ['joined','renege'].includes(c.current_stage)).length,
      }
    })

    // Job coverage — volume signal: 5+ CVs; quality signal: 3+ candidates at interview stage
    const j0  = filtJobs.filter(j => j.candidates.length === 0).length
    const j5p = filtJobs.filter(j => j.candidates.length >= 5).length
    const j3i = filtJobs.filter(j =>
      j.candidates.filter(c => rank(c.current_stage) >= 2).length >= 3   // 3+ reached interview or beyond
    ).length

    // Summary counts
    const cvs    = funnelData[0]?.count ?? 0
    const sl     = funnelData[1]?.count ?? 0
    const iv     = funnelData[2]?.count ?? 0
    const ofr    = funnelData[3]?.count ?? 0
    const jnd             = pipelineCands.filter(c => ['joined','renege'].includes(c.current_stage)).length
    const effectiveJoined = pipelineCands.filter(c => c.current_stage === 'joined').length   // excludes renege
    const onHold          = pipelineCands.filter(c => c.current_stage === 'on_hold').length
    const renege          = pipelineCands.filter(c => c.current_stage === 'renege').length

    return {
      pipelineCands, revenueCands, filtJobs,
      totalRevenue, totalTarget, pct,
      funnelData, chartData, trendData,
      jobsAlloc: filtJobs.length,
      jobsWorked: filtJobs.filter(j => j.candidates.length > 0).length,
      j0, j5p, j3i, cvs, sl, iv, ofr, jnd, effectiveJoined, onHold, renege,
    }
  }, [candidates, jobs, activeMths, fy, rid, recruiters, mth, qtr])

  // ── Candidate drill-down ──────────────────────────────────────────────────
  const drillCands = useMemo(() => {
    const flat = D.filtJobs.flatMap(j =>
      j.candidates.map(c => ({ ...c, jobTitle: j.job_title, jobClient: j.client?.company_name ?? '—', jobId: j.id }))
    )
    let list = flat
    if (jid)    list = list.filter(c => c.jobId === jid)
    if (fStage) {
      const ms = FUNNEL.find(m => m.id === fStage)
      if (ms) list = list.filter(c =>
        ms.minRank === 0 ? true : rank(c.current_stage) >= ms.minRank
      )
    }
    return list
  }, [D.filtJobs, jid, fStage])

  // ── Auto-insights (using real stage data) ─────────────────────────────────
  const insights = useMemo(() => {
    const out: { t:'success'|'warning'|'danger'; msg:string }[] = []
    const { pct, cvs, sl, iv, ofr, jnd, effectiveJoined, j0, j5p, j3i, filtJobs, renege, onHold } = D

    if (pct >= 100) out.push({ t:'success', msg:`Revenue target met — ${fmtPct(pct)} achieved` })
    else if (pct >= 75) out.push({ t:'warning', msg:`${fmtPct(pct)} of target — on track, needs push` })
    else out.push({ t:'danger', msg:`Below target — only ${fmtPct(pct)} of revenue goal met` })

    // Interview Selection Rate (Interview → Offer) — key quality signal
    if (iv > 0) {
      const isr = Math.round((ofr / iv) * 100)
      if (isr < 15) out.push({ t:'danger',  msg:`Low interview selection rate ${isr}% — review candidate fitment or JD alignment` })
      else if (isr >= 40) out.push({ t:'success', msg:`Strong interview selection rate ${isr}% — quality pipeline` })
      else out.push({ t:'warning', msg:`Interview selection rate ${isr}% — room to improve candidate quality` })
    } else if (sl > 0) {
      out.push({ t:'warning', msg:`${sl} in screening, none interviewed yet — push for client interviews` })
    }

    if (j0 > 0) out.push({ t:'danger', msg:`${j0} job${j0>1?'s':''} with 0 CVs — immediate attention needed` })

    // Offer → Effective Join (excludes reneges)
    if (ofr > 0) {
      const joinRate = Math.round((effectiveJoined / ofr) * 100)
      if (joinRate < 60) out.push({ t:'warning', msg:`Offer-to-join rate ${joinRate}% — check offer quality or candidate expectations` })
    }

    if (renege > 0) out.push({ t:'danger', msg:`${renege} renege case${renege>1?'s':''} — review guarantee period follow-ups` })
    if (onHold > 0) out.push({ t:'warning', msg:`${onHold} candidate${onHold>1?'s':''} on hold — action needed` })
    if (filtJobs.length && j3i > 0) out.push({ t:'success', msg:`${j3i} job${j3i>1?'s':''} with 3+ candidates at interview — strong pipeline depth` })
    else if (filtJobs.length && j5p > 0) out.push({ t:'success', msg:`${j5p} job${j5p>1?'s':''} with 5+ CVs — good sourcing volume` })

    return out.slice(0, 5)
  }, [D])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const clearAll  = () => { setQtr(null); setMth(null); setFStage(null); setJid(null) }
  const hasFilter = !!(qtr || mth !== null || fStage || jid)
  const onQtr      = (q: string) => { setQtr(qtr===q?null:q); setMth(null) }
  const onMth      = (m: number | null) => { setMth(m); setQtr(null) }
  const onRec      = (v: string) => { setRid(v); setJid(null); setFStage(null) }
  const onFunnel   = (sid: string) => { setFStage(fStage===sid?null:sid); setJid(null) }
  const onJob      = (id: string) => setJid(jid===id?null:id)
  const onBarClick = (data: any) => {
    if (!data?.activeLabel) return
    const m = MONTHS.indexOf(data.activeLabel)
    if (m >= 0) onMth(mth === m ? null : m)
  }

  const recName     = rid==='all' ? 'All Recruiters' : (recruiters.find(r=>r.id===rid)?.full_name ?? '')
  const periodLabel = qtr ? QUARTERS.find(q=>q.id===qtr)?.label : mth!==null ? MONTHS[mth] : 'Full Year'

  // ── Style tokens ──────────────────────────────────────────────────────────
  const card = { background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }
  const pill = (on: boolean, c='#3b82f6') => ({
    padding:'6px 13px', borderRadius:100, fontSize:12, fontWeight:600 as const, cursor:'pointer' as const,
    border:`1px solid ${on?c:'#e2e8f0'}`, background:on?c:'#fff', color:on?'#fff':'#64748b',
    whiteSpace:'nowrap' as const, transition:'all 0.15s',
  })
  const tH = {
    padding:'10px 14px', fontSize:11, fontWeight:700 as const, color:'#94a3b8',
    textTransform:'uppercase' as const, letterSpacing:'0.05em', textAlign:'left' as const,
    background:'#f8fafc', borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap' as const,
  }
  const tC = (x={}) => ({ padding:'11px 14px', fontSize:13, color:'#334155', borderBottom:'1px solid #f1f5f9', ...x })
  const lbl = { fontSize:10, fontWeight:700 as const, color:'#94a3b8', letterSpacing:'0.06em', marginBottom:6, display:'block' as const }

  // ─────────────────────────────────────────────────────────────────────────
  if (authLoading) return (
    <DashboardLayout>
      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:300 }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    </DashboardLayout>
  )

  return (
    <DashboardLayout>
      <div style={{ maxWidth:1240, margin:'0 auto', paddingBottom:60, fontFamily:"'Inter','Segoe UI',sans-serif" }}>

        {/* ── Title ───────────────────────────────────────────────────────── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:8, marginBottom:20 }}>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#0f172a', letterSpacing:'-0.03em' }}>
              Recruitment<span style={{ color:'#3b82f6' }}>360°</span>
            </h1>
            <p style={{ margin:'3px 0 0', fontSize:13, color:'#64748b' }}>Performance Intelligence · TalentIQ ATS</p>
          </div>
          {hasFilter && (
            <button onClick={clearAll} style={{ padding:'7px 14px', background:'#fef2f2', color:'#ef4444', border:'1px solid #fecaca', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              ✕ Clear All Filters
            </button>
          )}
        </div>

        {/* ── Filter Bar ──────────────────────────────────────────────────── */}
        <div style={{ ...card, padding:'16px 20px', marginBottom:18 }}>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-end' }}>

            <div>
              <span style={lbl}>FINANCIAL YEAR</span>
              <div style={{ display:'flex', gap:5 }}>
                {FY_LIST.map(f => (
                  <button key={f} style={pill(fy===f)} onClick={()=>{ setFy(f); clearAll() }}>{f}</button>
                ))}
              </div>
            </div>

            <div>
              <span style={lbl}>QUARTER</span>
              <div style={{ display:'flex', gap:5 }}>
                {QUARTERS.map(q => (
                  <button key={q.id} style={pill(qtr===q.id)} onClick={()=>onQtr(q.id)}>{q.label}</button>
                ))}
              </div>
            </div>

            <div>
              <span style={lbl}>MONTH</span>
              <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                {MONTHS.map((m, i) => (
                  <button key={m} style={{...pill(mth===i), padding:'4px 8px', fontSize:11}} onClick={()=>onMth(i)}>{m}</button>
                ))}
              </div>
            </div>

            <div style={{ marginLeft:'auto' }}>
              <span style={lbl}>RECRUITER</span>
              <select value={rid} onChange={e=>onRec(e.target.value)}
                style={{ border:'2px solid #3b82f6', borderRadius:8, padding:'7px 14px', fontSize:14, fontFamily:'inherit', outline:'none', cursor:'pointer', fontWeight:700, color:'#1e293b', background:'#fff', minWidth:200 }}>
                <option value="all">👥 All Recruiters</option>
                {recruiters.map(r => <option key={r.id} value={r.id}>👤 {r.full_name}</option>)}
              </select>
            </div>

          </div>
        </div>

        {/* ── KPI Header ──────────────────────────────────────────────────── */}
        <div style={{ background:'linear-gradient(135deg,#0f172a 0%,#1e3a5f 65%,#0f2744 100%)', borderRadius:16, padding:'24px 28px', color:'#fff', marginBottom:18 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:20 }}>

            <div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:3 }}>
                FY {fy} · {periodLabel} · {rid==='all'?`${recruiters.length} Recruiters`:'Individual'}
                <span style={{ marginLeft:8, padding:'1px 7px', borderRadius:100, fontSize:10, background:'rgba(74,222,128,0.15)', color:'#4ade80', fontWeight:600 }}>
                  ● Active only
                </span>
              </div>
              <div style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.02em' }}>
                {dataLoading ? 'Loading…' : recName}
              </div>
              <div style={{ display:'flex', gap:10, marginTop:12, flexWrap:'wrap' }}>
                {[
                  [fmtL(D.totalRevenue), 'Revenue Achieved', tclr(D.pct)],
                  [fmtPct(D.pct),        'Target Achieved',  tclr(D.pct)],
                  [fmtL(D.totalTarget),  'Total Target',     '#7dd3fc'],
                ].map(([v, l, c]) => (
                  <div key={l} style={{ background:'rgba(255,255,255,0.08)', borderRadius:10, padding:'9px 16px', border:'0.5px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontSize:22, fontWeight:800, color:c as string, lineHeight:1 }}>{v}</div>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.38)', marginTop:2 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', gap:18, flexWrap:'wrap', alignItems:'flex-start' }}>
              {([
                ['Total CVs',      D.cvs,              '#93c5fd'],
                ['Screening',      D.sl,               '#c4b5fd'],
                ['Interviewed',    D.iv,               '#fbbf24'],
                ['Offer Extended', D.ofr,              '#86efac'],
                ['Joined',         D.effectiveJoined,  '#34d399'],
                ['Renege',         D.renege,            '#fca5a5'],
                ['On Hold',        D.onHold,            '#e9d5ff'],
                ['Jobs Alloc.',    D.jobsAlloc,         '#7dd3fc'],
                ['Jobs Worked',    D.jobsWorked,        '#60a5fa'],
              ] as [string,number,string][]).map(([l,v,c]) => (
                <div key={l} style={{ textAlign:'center', minWidth:62 }}>
                  <div style={{ fontSize:24, fontWeight:800, color:c, lineHeight:1 }}>{v}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.38)', marginTop:3, lineHeight:1.3 }}>{l}</div>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* ── Revenue Chart + Insights ─────────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 290px', gap:18, marginBottom:18 }}>

          {/* Bar Chart */}
          <div style={{ ...card, padding:'20px 24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#1e293b' }}>Revenue vs Target</div>
                <div style={{ fontSize:12, color:'#94a3b8' }}>Based on date_joined · April → March · click bar to filter</div>
              </div>
              {mth !== null && (
                <button onClick={()=>setMth(null)} style={{ fontSize:11, color:'#ef4444', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'4px 10px', cursor:'pointer', fontWeight:600 }}>
                  {MONTHS[mth]} only ✕
                </button>
              )}
            </div>

            {dataLoading
              ? <div style={{ height:260, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>Loading…</div>
              : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={D.chartData} barGap={3} barCategoryGap="30%" onClick={onBarClick} style={{ cursor:'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtL} tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<BarTip />} cursor={{ fill:'rgba(59,130,246,0.05)' }} />
                    <Bar dataKey="target" name="Target" radius={[3,3,0,0]}>
                      {D.chartData.map((_, i) => <Cell key={i} fill={mth===i?'#bfdbfe':'#e2e8f0'} />)}
                    </Bar>
                    <Bar dataKey="revenue" name="Revenue" radius={[3,3,0,0]}>
                      {D.chartData.map((e, i) => (
                        <Cell key={i} fill={
                          mth===i       ? '#1d4ed8' :
                          !e.inFilter   ? '#cbd5e1' :
                          e.revenue >= e.target        ? '#22c55e' :
                          e.revenue >= e.target * 0.75 ? '#f59e0b' : '#ef4444'
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            }
            <div style={{ display:'flex', gap:14, marginTop:8, justifyContent:'center' }}>
              {[['Target','#e2e8f0'],['Met','#22c55e'],['≥75%','#f59e0b'],['Below','#ef4444']].map(([l,c])=>(
                <span key={l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#64748b' }}>
                  <span style={{ width:10, height:10, borderRadius:2, background:c, display:'inline-block' }} />{l}
                </span>
              ))}
            </div>
          </div>

          {/* Insights + Conversion Rates */}
          <div style={{ ...card, padding:'18px', display:'flex', flexDirection:'column' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#1e293b', marginBottom:12 }}>Key Insights</div>
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {insights.map((ins, i) => {
                const cfg = {
                  success:{ bg:'#f0fdf4', bd:'#bbf7d0', cl:'#15803d', dot:'#22c55e' },
                  warning:{ bg:'#fefce8', bd:'#fde68a', cl:'#92400e', dot:'#f59e0b' },
                  danger: { bg:'#fef2f2', bd:'#fecaca', cl:'#dc2626', dot:'#ef4444' },
                }[ins.t]
                return (
                  <div key={i} style={{ background:cfg.bg, border:`1px solid ${cfg.bd}`, borderRadius:9, padding:'9px 11px', display:'flex', gap:7, alignItems:'flex-start' }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:cfg.dot, marginTop:3, flexShrink:0 }} />
                    <div style={{ fontSize:11, color:cfg.cl, fontWeight:600, lineHeight:1.5 }}>{ins.msg}</div>
                  </div>
                )
              })}
              {!insights.length && <div style={{ fontSize:12, color:'#94a3b8', textAlign:'center', padding:16 }}>No data for period</div>}
            </div>

            <div style={{ marginTop:'auto', paddingTop:14, borderTop:'1px solid #f1f5f9' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#64748b', letterSpacing:'0.04em', marginBottom:9 }}>CONVERSION RATES</div>
              {([
                ['CV → Screening',         D.sl,               D.cvs,  false],
                ['Screening → Interview',  D.iv,               D.sl,   false],
                ['Interview → Offer ★',    D.ofr,              D.iv,   true ],
                ['Offer → Joined (net)',    D.effectiveJoined,  D.ofr,  false],
              ] as [string, number, number, boolean][]).map(([l, n, d2, star]) => {
                const p = d2 > 0 ? Math.round(((n as number) / (d2 as number)) * 100) : 0
                const c = p > 50 ? '#22c55e' : p > 30 ? '#f59e0b' : '#ef4444'
                return (
                  <div key={l as string} style={{ marginBottom:9 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:11, color: star ? '#1e293b' : '#64748b', fontWeight: star ? 700 : 400 }}>{l as string}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:c }}>{p}%</span>
                    </div>
                    <div style={{ height: star ? 5 : 3, background:'#f1f5f9', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${Math.min(p,100)}%`, background:c, borderRadius:2, transition:'width 0.4s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Recruitment Funnel (5 milestones) ───────────────────────────── */}
        <div style={{ ...card, padding:'20px 24px', marginBottom:18 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#1e293b' }}>Recruitment Funnel</div>
              <div style={{ fontSize:12, color:'#94a3b8' }}>
                <strong style={{ color:'#3b82f6' }}>Total CVs</strong> = all candidates in period regardless of stage · each bar = candidates who reached or crossed that milestone · click to filter
              </div>
            </div>
            {fStage && (
              <button onClick={()=>setFStage(null)} style={{ fontSize:11, color:'#3b82f6', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'5px 11px', cursor:'pointer', fontWeight:600 }}>
                ✕ Clear stage filter
              </button>
            )}
          </div>

          {dataLoading
            ? <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>Loading…</div>
            : (
              <div style={{ display:'flex', alignItems:'flex-end', gap:6, overflowX:'auto', paddingBottom:4 }}>
                {D.funnelData.map((st, idx) => {
                  const maxC = D.funnelData[0]?.count || 1
                  const barH = Math.max(24, Math.round((st.count / maxC) * 140))
                  const isAc = fStage === st.id
                  const prev = idx > 0 ? D.funnelData[idx-1].count : 0
                  const drop = prev > 0 ? Math.round(((prev-st.count)/prev)*100) : 0
                  return (
                    <div key={st.id} style={{ flex:1, minWidth:110, display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer' }}
                      onClick={()=>onFunnel(st.id)}>
                      <div style={{ fontSize:9, fontWeight:700, color:'#ef4444', height:13 }}>
                        {idx>0&&drop>0?`▼ ${drop}%`:''}
                      </div>
                      <div style={{ fontSize:22, fontWeight:800, color:isAc?st.color:'#1e293b', lineHeight:1, marginBottom:4 }}>
                        {st.count}
                      </div>
                      <div style={{ width:'88%', height:barH, borderRadius:'5px 5px 0 0', background:isAc?st.color:`${st.color}44`, border:`2px solid ${isAc?st.color:'transparent'}`, transition:'all 0.2s' }} />
                      <div style={{ width:'88%', padding:'7px 5px', background:isAc?`${st.color}14`:'#f8fafc', borderRadius:'0 0 8px 8px', border:`1px solid ${isAc?st.color:'#f1f5f9'}`, borderTop:'none', textAlign:'center' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:isAc?st.color:'#64748b', lineHeight:1.3 }}>{st.label}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>

        {/* ── Jobs Coverage ────────────────────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:14, marginBottom:18 }}>
          {([
            ['Jobs Allocated', D.jobsAlloc,  '#3b82f6','#eff6ff','#bfdbfe','Total assigned to recruiter'],
            ['0 CVs',          D.j0,          '#ef4444','#fef2f2','#fecaca','No CVs yet — urgent'],
            ['Jobs Worked On', D.jobsWorked, '#8b5cf6','#f5f3ff','#ddd6fe','≥ 1 CV sourced'],
            ['5+ CVs',         D.j5p,         '#f59e0b','#fffbeb','#fde68a','Good sourcing volume'],
            ['3+ Interviewed',  D.j3i,         '#10b981','#f0fdf4','#bbf7d0','Quality signal ★'],
          ] as [string,number,string,string,string,string][]).map(([l,v,c,bg,bd,d]) => (
            <div key={l} style={{ ...card, padding:'16px 18px', background:bg, border:`1px solid ${bd}` }}>
              <div style={{ fontSize:32, fontWeight:800, color:c, lineHeight:1 }}>{v}</div>
              <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', marginTop:6 }}>{l}</div>
              <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{d}</div>
            </div>
          ))}
        </div>

        {/* ── Jobs Table ───────────────────────────────────────────────────── */}
        <div style={{ ...card, overflow:'hidden', marginBottom:18 }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#1e293b' }}>Job-wise Performance</div>
              <div style={{ fontSize:12, color:'#94a3b8' }}>Click a row to drill into candidates · counts based on date_sourced in selected period</div>
            </div>
            <span style={{ fontSize:13, color:'#64748b', fontWeight:600 }}>{D.filtJobs.length} jobs</span>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:1040 }}>
              <thead>
                <tr>
                  {['Job Code','Title','Client','Created','Status','Positions','CVs Sourced',
                    'Screening','Interviewed','Offer Extended','Joined','Last Update'].map(h => (
                    <th key={h} style={tH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {D.filtJobs.map((job, i) => {
                  const cds   = job.candidates
                  const isSel = jid === job.id
                  const cnt   = (minR: number) => cds.filter(c => rank(c.current_stage) >= minR && c.current_stage !== 'on_hold').length
                  const sc    = {
                    closed:      { c:'#15803d', bg:'#f0fdf4', l:'Closed' },
                    in_progress: { c:'#2563eb', bg:'#eff6ff', l:'In Progress' },
                    open:        { c:'#92400e', bg:'#fffbeb', l:'Open' },
                  }[job.status] ?? { c:'#64748b', bg:'#f8fafc', l:job.status }

                  return (
                    <tr key={job.id} onClick={()=>onJob(job.id)}
                      style={{ cursor:'pointer', background:isSel?'#eff6ff':i%2===0?'#fff':'#fafafa', boxShadow:isSel?'inset 3px 0 0 #3b82f6':'none', transition:'background 0.1s' }}>
                      <td style={tC({ fontWeight:700, color:'#3b82f6', fontSize:12 })}>{job.job_code || job.id.slice(0,8).toUpperCase()}</td>
                      <td style={tC({ fontWeight:600, maxWidth:180 })}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{job.job_title}</div>
                      </td>
                      <td style={tC({ color:'#64748b', fontSize:12 })}>{job.client?.company_name || '—'}</td>
                      <td style={tC({ color:'#64748b', whiteSpace:'nowrap', fontSize:12 })}>
                        {new Date(job.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'})}
                      </td>
                      <td style={tC()}>
                        <span style={{ padding:'2px 9px', borderRadius:100, fontSize:11, fontWeight:700, background:sc.bg, color:sc.c }}>{sc.l}</span>
                      </td>
                      <td style={tC({ textAlign:'center', color:'#64748b' })}>
                        {job.positions_filled}/{job.positions}
                      </td>
                      <td style={tC({ textAlign:'center', fontWeight:800, color:'#3b82f6', fontSize:15 })}>{cds.length}</td>
                      <td style={tC({ textAlign:'center', fontWeight:700, color:'#6366f1' })}>{cnt(1)}</td>
                      <td style={tC({ textAlign:'center', fontWeight:700, color:'#f59e0b' })}>{cnt(2)}</td>
                      <td style={tC({ textAlign:'center', fontWeight:700, color:'#22c55e' })}>{cnt(5)}</td>
                      <td style={tC({ textAlign:'center', fontWeight:700, color:'#10b981' })}>{cds.filter(c=>['joined','renege'].includes(c.current_stage)).length}</td>
                      <td style={tC({ color:'#64748b', whiteSpace:'nowrap', fontSize:12 })}>
                        {cds.length > 0
                          ? new Date(Math.max(...cds.map(c => new Date(c.date_sourced||0).getTime()))).toLocaleDateString('en-IN',{day:'numeric',month:'short'})
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
                {!D.filtJobs.length && (
                  <tr><td colSpan={12} style={{ padding:48, textAlign:'center', color:'#9ca3af' }}>
                    {dataLoading ? 'Loading jobs…' : 'No jobs found for the selected period'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Candidate Drill-down ─────────────────────────────────────────── */}
        {(jid || fStage) && (
          <div style={{ ...card, overflow:'hidden', border:'2px solid #3b82f6', marginBottom:18 }}>
            <div style={{ padding:'14px 20px', background:'#eff6ff', borderBottom:'1px solid #bfdbfe', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#1e293b' }}>
                  {jid && !fStage
                    ? `Candidates — ${D.filtJobs.find(j=>j.id===jid)?.job_title ?? 'Job'}`
                    : fStage && !jid
                    ? `Candidates — "${FUNNEL.find(m=>m.id===fStage)?.label}" milestone and beyond`
                    : `"${FUNNEL.find(m=>m.id===fStage)?.label}" in ${D.filtJobs.find(j=>j.id===jid)?.job_title ?? ''}`}
                </div>
                <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{drillCands.length} candidates</div>
              </div>
              <button onClick={()=>{ setJid(null); setFStage(null) }}
                style={{ background:'none', border:'1px solid #bfdbfe', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:600, color:'#3b82f6', fontFamily:'inherit' }}>
                ✕ Close
              </button>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['Candidate','Current Stage','Job','Client','Date Sourced','Date Joined','Current CTC','Revenue Earned'].map(h=>(
                      <th key={h} style={tH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drillCands.map((c: any, i) => {
                    const sc = STAGE_COLOR[c.current_stage] ?? '#64748b'
                    const sl = STAGE_LABEL[c.current_stage] ?? c.current_stage
                    return (
                      <tr key={c.id} style={{ background:i%2===0?'#fff':'#fafafa' }}>
                        <td style={tC({ fontWeight:600 })}>{c.full_name}</td>
                        <td style={tC()}>
                          <span style={{ padding:'2px 10px', borderRadius:100, fontSize:11, fontWeight:700, background:`${sc}18`, color:sc }}>
                            {sl}
                          </span>
                        </td>
                        <td style={tC({ color:'#64748b', fontSize:12 })}>{c.jobTitle}</td>
                        <td style={tC({ color:'#64748b', fontSize:12 })}>{c.jobClient}</td>
                        <td style={tC({ color:'#64748b', fontSize:12, whiteSpace:'nowrap' })}>
                          {c.date_sourced ? new Date(c.date_sourced).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}) : '—'}
                        </td>
                        <td style={tC({ color:'#64748b', fontSize:12, whiteSpace:'nowrap' })}>
                          {c.date_joined ? new Date(c.date_joined).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}) : '—'}
                        </td>
                        <td style={tC()}>{c.current_ctc ? fmtL(c.current_ctc) : '—'}</td>
                        <td style={tC({ fontWeight:700, color:(c.revenue_earned??0)>0?'#15803d':'#94a3b8' })}>
                          {(c.revenue_earned ?? 0) > 0
                            ? fmtL(c.revenue_earned)
                            : c.billable_ctc ? `~${fmtL(Math.round(c.billable_ctc*0.0833))}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {!drillCands.length && (
                    <tr><td colSpan={8} style={{ padding:36, textAlign:'center', color:'#9ca3af' }}>No candidates match this filter</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Monthly Activity Trend ────────────────────────────────────────── */}
        <div style={{ ...card, padding:'20px 24px' }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#1e293b', marginBottom:3 }}>Monthly Activity Trend</div>
          <div style={{ fontSize:12, color:'#94a3b8', marginBottom:14 }}>
            Based on date_sourced · tracks candidate pipeline activity month by month
          </div>
          {dataLoading
            ? <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>Loading…</div>
            : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={D.trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<LineTip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:12 }} />
                  <Line type="monotone" dataKey="Total CVs"  stroke="#3b82f6" strokeWidth={2.5} dot={{ r:4, fill:'#3b82f6',  strokeWidth:0 }} activeDot={{ r:5 }} />
                  <Line type="monotone" dataKey="Screening"  stroke="#8b5cf6" strokeWidth={2.5} dot={{ r:4, fill:'#8b5cf6',  strokeWidth:0 }} activeDot={{ r:5 }} />
                  <Line type="monotone" dataKey="Interviewed"stroke="#f59e0b" strokeWidth={2.5} dot={{ r:4, fill:'#f59e0b',  strokeWidth:0 }} activeDot={{ r:5 }} />
                  <Line type="monotone" dataKey="Joined"     stroke="#10b981" strokeWidth={2.5} dot={{ r:4, fill:'#10b981',  strokeWidth:0 }} activeDot={{ r:5 }} />
                </LineChart>
              </ResponsiveContainer>
            )
          }
        </div>

      </div>
    </DashboardLayout>
  )
}