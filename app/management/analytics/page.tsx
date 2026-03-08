// app/management/analytics/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase as supabaseAdmin } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import * as XLSX from 'xlsx'

interface RecruiterProgress {
  recruiter_id: string
  recruiter_name: string
  jobs_assigned: number
  cv_submitted: number
  interview_scheduled: number
  interview_completed: number
  rejected: number
  offer_extended: number
  offer_accepted: number
  joined: number
  renege_dropped: number
  conversion_rate: number
}

interface ClientProgress {
  client_id: string
  client_name: string
  new_jobs_added: number
  cv_submitted: number
  interview_scheduled: number
  interview_completed: number
  rejected: number
  offer_extended: number
  offer_accepted: number
  joined: number
  renege_dropped: number
  conversion_rate: number
}

interface JobProgress {
  job_id: string
  job_code: string
  job_title: string
  client_name: string
  positions: number
  cv_submitted: number
  interview_scheduled: number
  interview_completed: number
  rejected: number
  offer_extended: number
  offer_accepted: number
  joined: number
  renege_dropped: number
  filled_rate: number
}

interface CandidateHighlight {
  id: string
  full_name: string
  current_stage: string
  job_title: string
  client_name: string
  recruiter_name: string
  last_activity_date: string
  days_in_stage: number
}

const PIPELINE_COLS = [
  { key: 'cv_submitted',        label: 'CV Submitted',        color: 'text-blue-600',   bg: 'bg-blue-100',   text: 'text-blue-800'   },
  { key: 'interview_scheduled', label: 'Interview Scheduled', color: 'text-indigo-600', bg: 'bg-indigo-100', text: 'text-indigo-800' },
  { key: 'interview_completed', label: 'Interview Completed', color: 'text-purple-600', bg: 'bg-purple-100', text: 'text-purple-800' },
  { key: 'rejected',            label: 'Rejected',            color: 'text-red-600',    bg: 'bg-red-100',    text: 'text-red-800'    },
  { key: 'offer_extended',      label: 'Offer Extended',      color: 'text-orange-600', bg: 'bg-orange-100', text: 'text-orange-800' },
  { key: 'offer_accepted',      label: 'Offer Accepted',      color: 'text-green-600',  bg: 'bg-green-100',  text: 'text-green-800'  },
  { key: 'joined',              label: 'Joined',              color: 'text-emerald-600',bg: 'bg-emerald-100',text: 'text-emerald-800'},
  { key: 'renege_dropped',      label: 'Renege/Dropped',      color: 'text-yellow-600', bg: 'bg-yellow-100', text: 'text-yellow-800' },
]

export default function PipelineAnalytics() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState('today')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  const [recruiterProgress, setRecruiterProgress] = useState<RecruiterProgress[]>([])
  const [clientProgress, setClientProgress] = useState<ClientProgress[]>([])
  const [jobProgress, setJobProgress] = useState<JobProgress[]>([])
  const [highlights, setHighlights] = useState<CandidateHighlight[]>([])
  const [activeTab, setActiveTab] = useState<'recruiter' | 'client' | 'job'>('recruiter')

  const [totals, setTotals] = useState({
    total_cv_submitted: 0,
    total_interview_scheduled: 0,
    total_interview_completed: 0,
    total_rejected: 0,
    total_offer_extended: 0,
    total_offer_accepted: 0,
    total_joined: 0,
    total_renege_dropped: 0,
    overall_conversion: 0,
  })

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      if (!['ceo', 'ops_head', 'finance_head', 'system_admin'].includes(parsedUser.role)) {
        alert('Access denied. Management only.')
        router.push('/')
        return
      }
      const range = getDateRange()
      loadAllData(range)
    }
  }, [selectedPeriod, customStartDate, customEndDate, router])

  const getDateRange = () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (selectedPeriod === 'custom' && customStartDate && customEndDate) {
      return {
        start: new Date(customStartDate).toISOString(),
        end: new Date(customEndDate + 'T23:59:59').toISOString(),
      }
    }
    if (selectedPeriod === 'previous_day') {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return {
        start: yesterday.toISOString(),
        end: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59).toISOString(),
      }
    }
    if (selectedPeriod === 'today') {
      return {
        start: today.toISOString(),
        end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString(),
      }
    }
    if (selectedPeriod === 'week') {
      const weekStart = new Date(today)
      weekStart.setDate(weekStart.getDate() - 7)
      return {
        start: weekStart.toISOString(),
        end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString(),
      }
    }
    if (selectedPeriod === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      return {
        start: monthStart.toISOString(),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString(),
      }
    }
    return { start: today.toISOString(), end: new Date().toISOString() }
  }

  const getPeriodLabel = () => {
    if (selectedPeriod === 'custom' && customStartDate && customEndDate)
      return `${customStartDate} to ${customEndDate}`
    if (selectedPeriod === 'previous_day') return 'Previous Day'
    if (selectedPeriod === 'today') return 'Today'
    if (selectedPeriod === 'week') return 'Last 7 Days'
    if (selectedPeriod === 'month') return 'This Month'
    return ''
  }

  const getStageFromTimeline = (
    activityType: string,
    metadata: any,
    activityDescription?: string
  ): string | null => {
    switch (activityType) {
      case 'candidate_created':   return 'sourced'
      case 'interview_scheduled': return 'interview_scheduled'
      case 'offer_extended':      return 'offer_extended'
      case 'offer_accepted':      return 'offer_accepted'
      case 'candidate_joined':    return 'joined'
      case 'renege':              return 'renege_dropped'
    }
    if (activityType === 'stage_change' || activityType === 'status_change') {
      const metaStage = metadata?.new_stage || metadata?.to_stage || metadata?.stage
      if (metaStage) return metaStage.toLowerCase().replace(/\s+/g, '_')
      if (activityDescription) {
        const match = activityDescription.match(/stage changed to:\s*(.+)/i)
        if (match?.[1]) return match[1].trim().toLowerCase().replace(/\s+/g, '_')
      }
    }
    return null
  }

  const countStages = (timelineData: any[]) => {
    let cv_submitted = 0, interview_scheduled = 0, interview_completed = 0
    let rejected = 0, offer_extended = 0, offer_accepted = 0
    let joined = 0, renege_dropped = 0

    timelineData.forEach((activity: any) => {
      const stage = getStageFromTimeline(
        activity.activity_type,
        activity.metadata,
        activity.activity_description
      )
      if (stage === 'sourced')              cv_submitted++
      if (stage === 'interview_scheduled')  interview_scheduled++
      if (stage === 'interview_completed')  interview_completed++
      if (stage === 'rejected')             rejected++
      if (stage === 'offer_extended')       offer_extended++
      if (stage === 'offer_accepted')       offer_accepted++
      if (stage === 'joined')               joined++
      if (stage === 'renege_dropped')       renege_dropped++
    })

    return { cv_submitted, interview_scheduled, interview_completed, rejected, offer_extended, offer_accepted, joined, renege_dropped }
  }

  const loadAllData = async (range: { start: string; end: string }) => {
    setLoading(true)
    try {
      await Promise.all([
        loadRecruiterProgress(range),
        loadClientProgress(range),
        loadJobProgress(range),
        loadHighlights(),
        loadTotals(range),
      ])
    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTotals = async (range: { start: string; end: string }) => {
    const { start, end } = range
    const { data: timelineData, error } = await supabaseAdmin
      .from('candidate_timeline')
      .select('activity_type, metadata, activity_description, created_at')
      .gte('created_at', start)
      .lte('created_at', end)

    if (error || !timelineData) return

    const counts = countStages(timelineData)
    const overall_conversion = counts.cv_submitted > 0
      ? Math.round((counts.joined / counts.cv_submitted) * 100) : 0

    setTotals({
      total_cv_submitted:        counts.cv_submitted,
      total_interview_scheduled: counts.interview_scheduled,
      total_interview_completed: counts.interview_completed,
      total_rejected:            counts.rejected,
      total_offer_extended:      counts.offer_extended,
      total_offer_accepted:      counts.offer_accepted,
      total_joined:              counts.joined,
      total_renege_dropped:      counts.renege_dropped,
      overall_conversion,
    })
  }

  const loadRecruiterProgress = async (range: { start: string; end: string }) => {
    const { start, end } = range
    const { data: recruiters } = await supabaseAdmin
      .from('users').select('id, full_name').in('role', ['recruiter', 'team_leader'])

    if (!recruiters || recruiters.length === 0) { setRecruiterProgress([]); return }

    const progress = await Promise.all(
      recruiters.map(async (recruiter: any) => {
        const { count: jobs_assigned } = await supabaseAdmin
          .from('job_recruiter_assignments').select('*', { count: 'exact', head: true })
          .eq('recruiter_id', recruiter.id)

        const { data: candidateIds } = await supabaseAdmin
          .from('candidates').select('id').eq('assigned_to', recruiter.id)

        const candidateIdList = candidateIds?.map((c: any) => c.id) || []
        const empty = { recruiter_id: recruiter.id, recruiter_name: recruiter.full_name, jobs_assigned: jobs_assigned || 0, cv_submitted: 0, interview_scheduled: 0, interview_completed: 0, rejected: 0, offer_extended: 0, offer_accepted: 0, joined: 0, renege_dropped: 0, conversion_rate: 0 }
        if (candidateIdList.length === 0) return empty

        const { data: timelineData } = await supabaseAdmin
          .from('candidate_timeline')
          .select('activity_type, metadata, activity_description, created_at')
          .in('candidate_id', candidateIdList)
          .gte('created_at', start).lte('created_at', end)

        const counts = countStages(timelineData || [])
        return {
          recruiter_id: recruiter.id, recruiter_name: recruiter.full_name,
          jobs_assigned: jobs_assigned || 0, ...counts,
          conversion_rate: counts.cv_submitted > 0 ? Math.round((counts.joined / counts.cv_submitted) * 100) : 0,
        }
      })
    )
    setRecruiterProgress(progress.sort((a: any, b: any) => b.cv_submitted - a.cv_submitted))
  }

  const loadClientProgress = async (range: { start: string; end: string }) => {
    const { start, end } = range
    const { data: clients } = await supabaseAdmin.from('clients').select('id, company_name')
    if (!clients || clients.length === 0) { setClientProgress([]); return }

    const progress = await Promise.all(
      clients.map(async (client: any) => {
        const { count: new_jobs_added } = await supabaseAdmin
          .from('jobs').select('*', { count: 'exact', head: true })
          .eq('client_id', client.id).gte('created_at', start).lte('created_at', end)

        const { data: jobIds } = await supabaseAdmin.from('jobs').select('id').eq('client_id', client.id)
        const jobIdList = jobIds?.map((j: any) => j.id) || []
        const empty = { client_id: client.id, client_name: client.company_name, new_jobs_added: new_jobs_added || 0, cv_submitted: 0, interview_scheduled: 0, interview_completed: 0, rejected: 0, offer_extended: 0, offer_accepted: 0, joined: 0, renege_dropped: 0, conversion_rate: 0 }
        if (jobIdList.length === 0) return empty

        const { data: candidateIds } = await supabaseAdmin.from('candidates').select('id').in('job_id', jobIdList)
        const candidateIdList = candidateIds?.map((c: any) => c.id) || []
        if (candidateIdList.length === 0) return empty

        const { data: timelineData } = await supabaseAdmin
          .from('candidate_timeline')
          .select('activity_type, metadata, activity_description, created_at')
          .in('candidate_id', candidateIdList)
          .gte('created_at', start).lte('created_at', end)

        const counts = countStages(timelineData || [])
        return {
          client_id: client.id, client_name: client.company_name,
          new_jobs_added: new_jobs_added || 0, ...counts,
          conversion_rate: counts.cv_submitted > 0 ? Math.round((counts.joined / counts.cv_submitted) * 100) : 0,
        }
      })
    )
    setClientProgress(progress.sort((a: any, b: any) => b.cv_submitted - a.cv_submitted))
  }

  const loadJobProgress = async (range: { start: string; end: string }) => {
    const { start, end } = range
    const { data: jobs } = await supabaseAdmin
      .from('jobs').select(`id, job_code, job_title, positions, clients!inner(company_name)`).eq('status', 'open')

    if (!jobs) return

    const progress = await Promise.all(
      jobs.map(async (job: any) => {
        const { data: candidateIds } = await supabaseAdmin.from('candidates').select('id').eq('job_id', job.id)
        const candidateIdList = candidateIds?.map((c: any) => c.id) || []
        const empty = { job_id: job.id, job_code: job.job_code, job_title: job.job_title, client_name: job.clients.company_name, positions: job.positions, cv_submitted: 0, interview_scheduled: 0, interview_completed: 0, rejected: 0, offer_extended: 0, offer_accepted: 0, joined: 0, renege_dropped: 0, filled_rate: 0 }
        if (candidateIdList.length === 0) return empty

        const { data: timelineData } = await supabaseAdmin
          .from('candidate_timeline')
          .select('activity_type, metadata, activity_description, created_at')
          .in('candidate_id', candidateIdList)
          .gte('created_at', start).lte('created_at', end)

        const counts = countStages(timelineData || [])
        return {
          job_id: job.id, job_code: job.job_code, job_title: job.job_title,
          client_name: job.clients.company_name, positions: job.positions, ...counts,
          filled_rate: job.positions > 0 ? Math.round((counts.joined / job.positions) * 100) : 0,
        }
      })
    )
    setJobProgress(progress.sort((a: any, b: any) => b.cv_submitted - a.cv_submitted))
  }

  const loadHighlights = async () => {
    const { data } = await supabaseAdmin
      .from('candidates')
      .select(`id, full_name, current_stage, last_activity_date, jobs!inner(job_title, clients!inner(company_name)), assigned_user:assigned_to(full_name)`)
      .in('current_stage', ['interview_scheduled', 'interview_completed', 'offer_extended', 'offer_accepted', 'joined'])
      .order('last_activity_date', { ascending: false })
      .limit(50)

    if (!data) return
    const now = new Date()
    setHighlights(data.map((c: any) => ({
      id: c.id, full_name: c.full_name, current_stage: c.current_stage,
      job_title: c.jobs?.job_title || 'N/A',
      client_name: c.jobs?.clients?.company_name || 'N/A',
      recruiter_name: c.assigned_user?.full_name || 'N/A',
      last_activity_date: c.last_activity_date,
      days_in_stage: Math.floor((now.getTime() - new Date(c.last_activity_date).getTime()) / (1000 * 60 * 60 * 24)),
    })))
  }

  // ── Excel Export ───────────────────────────────────────────────────────────
  const exportToExcel = () => {
    setExporting(true)
    try {
      const wb = XLSX.utils.book_new()
      const period = getPeriodLabel()

      // ── Sheet 1: Overall Summary ──
      const summaryData = [
        [`Pipeline Analytics Report — ${period}`],
        [`Generated on: ${new Date().toLocaleString()}`],
        [],
        ['Metric', 'Count'],
        ['CV Submitted',        totals.total_cv_submitted],
        ['Interview Scheduled', totals.total_interview_scheduled],
        ['Interview Completed', totals.total_interview_completed],
        ['Rejected',            totals.total_rejected],
        ['Offer Extended',      totals.total_offer_extended],
        ['Offer Accepted',      totals.total_offer_accepted],
        ['Joined',              totals.total_joined],
        ['Renege / Dropped',    totals.total_renege_dropped],
        ['Overall Conversion %', `${totals.overall_conversion}%`],
      ]
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
      wsSummary['!cols'] = [{ wch: 28 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Overall Summary')

      // ── Sheet 2: Recruiter Progress ──
      const recHeaders = [
        'Recruiter', 'Jobs Assigned',
        'CV Submitted', 'Interview Scheduled', 'Interview Completed',
        'Rejected', 'Offer Extended', 'Offer Accepted',
        'Joined', 'Renege/Dropped', 'Conversion %',
      ]
      const recRows = recruiterProgress.map(r => [
        r.recruiter_name, r.jobs_assigned,
        r.cv_submitted, r.interview_scheduled, r.interview_completed,
        r.rejected, r.offer_extended, r.offer_accepted,
        r.joined, r.renege_dropped, `${r.conversion_rate}%`,
      ])
      // Totals row
      const recTotals = recruiterProgress.reduce(
        (acc, r) => ({
          jobs: acc.jobs + r.jobs_assigned, cv: acc.cv + r.cv_submitted,
          is: acc.is + r.interview_scheduled, ic: acc.ic + r.interview_completed,
          rej: acc.rej + r.rejected, oe: acc.oe + r.offer_extended,
          oa: acc.oa + r.offer_accepted, j: acc.j + r.joined, rd: acc.rd + r.renege_dropped,
        }),
        { jobs: 0, cv: 0, is: 0, ic: 0, rej: 0, oe: 0, oa: 0, j: 0, rd: 0 }
      )
      recRows.push([
        'TOTAL', recTotals.jobs, recTotals.cv, recTotals.is, recTotals.ic,
        recTotals.rej, recTotals.oe, recTotals.oa, recTotals.j, recTotals.rd,
        recTotals.cv > 0 ? `${Math.round((recTotals.j / recTotals.cv) * 100)}%` : '0%',
      ])
      const wsRec = XLSX.utils.aoa_to_sheet([recHeaders, ...recRows])
      wsRec['!cols'] = [{ wch: 22 }, ...Array(10).fill({ wch: 20 })]
      XLSX.utils.book_append_sheet(wb, wsRec, 'Recruiter Progress')

      // ── Sheet 3: Client Progress ──
      const clientHeaders = [
        'Client', 'New Jobs Added',
        'CV Submitted', 'Interview Scheduled', 'Interview Completed',
        'Rejected', 'Offer Extended', 'Offer Accepted',
        'Joined', 'Renege/Dropped', 'Conversion %',
      ]
      const clientRows = clientProgress.map(c => [
        c.client_name, c.new_jobs_added,
        c.cv_submitted, c.interview_scheduled, c.interview_completed,
        c.rejected, c.offer_extended, c.offer_accepted,
        c.joined, c.renege_dropped, `${c.conversion_rate}%`,
      ])
      const cTotals = clientProgress.reduce(
        (acc, c) => ({
          nj: acc.nj + c.new_jobs_added, cv: acc.cv + c.cv_submitted,
          is: acc.is + c.interview_scheduled, ic: acc.ic + c.interview_completed,
          rej: acc.rej + c.rejected, oe: acc.oe + c.offer_extended,
          oa: acc.oa + c.offer_accepted, j: acc.j + c.joined, rd: acc.rd + c.renege_dropped,
        }),
        { nj: 0, cv: 0, is: 0, ic: 0, rej: 0, oe: 0, oa: 0, j: 0, rd: 0 }
      )
      clientRows.push([
        'TOTAL', cTotals.nj, cTotals.cv, cTotals.is, cTotals.ic,
        cTotals.rej, cTotals.oe, cTotals.oa, cTotals.j, cTotals.rd,
        cTotals.cv > 0 ? `${Math.round((cTotals.j / cTotals.cv) * 100)}%` : '0%',
      ])
      const wsClient = XLSX.utils.aoa_to_sheet([clientHeaders, ...clientRows])
      wsClient['!cols'] = [{ wch: 28 }, ...Array(10).fill({ wch: 20 })]
      XLSX.utils.book_append_sheet(wb, wsClient, 'Client Progress')

      // ── Sheet 4: Job Progress ──
      const jobHeaders = [
        'Job Code', 'Job Title', 'Client', 'Positions',
        'CV Submitted', 'Interview Scheduled', 'Interview Completed',
        'Rejected', 'Offer Extended', 'Offer Accepted',
        'Joined', 'Renege/Dropped', 'Filled %',
      ]
      const jobRows = jobProgress.map(j => [
        j.job_code, j.job_title, j.client_name, j.positions,
        j.cv_submitted, j.interview_scheduled, j.interview_completed,
        j.rejected, j.offer_extended, j.offer_accepted,
        j.joined, j.renege_dropped, `${j.filled_rate}%`,
      ])
      const jTotals = jobProgress.reduce(
        (acc, j) => ({
          pos: acc.pos + j.positions, cv: acc.cv + j.cv_submitted,
          is: acc.is + j.interview_scheduled, ic: acc.ic + j.interview_completed,
          rej: acc.rej + j.rejected, oe: acc.oe + j.offer_extended,
          oa: acc.oa + j.offer_accepted, jo: acc.jo + j.joined, rd: acc.rd + j.renege_dropped,
        }),
        { pos: 0, cv: 0, is: 0, ic: 0, rej: 0, oe: 0, oa: 0, jo: 0, rd: 0 }
      )
      jobRows.push([
        'TOTAL', '', '', jTotals.pos,
        jTotals.cv, jTotals.is, jTotals.ic,
        jTotals.rej, jTotals.oe, jTotals.oa,
        jTotals.jo, jTotals.rd,
        jTotals.pos > 0 ? `${Math.round((jTotals.jo / jTotals.pos) * 100)}%` : '0%',
      ])
      const wsJob = XLSX.utils.aoa_to_sheet([jobHeaders, ...jobRows])
      wsJob['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 24 }, ...Array(10).fill({ wch: 20 })]
      XLSX.utils.book_append_sheet(wb, wsJob, 'Job Progress')

      // ── Sheet 5: Active Candidates ──
      const highlightHeaders = [
        'Candidate Name', 'Current Stage', 'Job Title', 'Client', 'Recruiter', 'Days in Stage', 'Last Activity',
      ]
      const highlightRows = highlights.map(h => [
        h.full_name,
        h.current_stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        h.job_title, h.client_name, h.recruiter_name, h.days_in_stage,
        new Date(h.last_activity_date).toLocaleDateString(),
      ])
      const wsHighlights = XLSX.utils.aoa_to_sheet([highlightHeaders, ...highlightRows])
      wsHighlights['!cols'] = [{ wch: 24 }, { wch: 22 }, { wch: 28 }, { wch: 24 }, { wch: 20 }, { wch: 14 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, wsHighlights, 'Active Candidates')

      // ── Download ──
      const fileName = `Pipeline_Analytics_${period.replace(/\s+/g, '_').replace(/\//g, '-')}_${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(wb, fileName)
    } catch (err) {
      console.error('Export error:', err)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // ── Totals row calculators ─────────────────────────────────────────────────
  const recruiterTotals = recruiterProgress.reduce(
    (acc, r) => ({ jobs_assigned: acc.jobs_assigned + r.jobs_assigned, cv_submitted: acc.cv_submitted + r.cv_submitted, interview_scheduled: acc.interview_scheduled + r.interview_scheduled, interview_completed: acc.interview_completed + r.interview_completed, rejected: acc.rejected + r.rejected, offer_extended: acc.offer_extended + r.offer_extended, offer_accepted: acc.offer_accepted + r.offer_accepted, joined: acc.joined + r.joined, renege_dropped: acc.renege_dropped + r.renege_dropped }),
    { jobs_assigned: 0, cv_submitted: 0, interview_scheduled: 0, interview_completed: 0, rejected: 0, offer_extended: 0, offer_accepted: 0, joined: 0, renege_dropped: 0 }
  )

  const clientTotals = clientProgress.reduce(
    (acc, c) => ({ new_jobs_added: acc.new_jobs_added + c.new_jobs_added, cv_submitted: acc.cv_submitted + c.cv_submitted, interview_scheduled: acc.interview_scheduled + c.interview_scheduled, interview_completed: acc.interview_completed + c.interview_completed, rejected: acc.rejected + c.rejected, offer_extended: acc.offer_extended + c.offer_extended, offer_accepted: acc.offer_accepted + c.offer_accepted, joined: acc.joined + c.joined, renege_dropped: acc.renege_dropped + c.renege_dropped }),
    { new_jobs_added: 0, cv_submitted: 0, interview_scheduled: 0, interview_completed: 0, rejected: 0, offer_extended: 0, offer_accepted: 0, joined: 0, renege_dropped: 0 }
  )

  const jobTotals = jobProgress.reduce(
    (acc, j) => ({ positions: acc.positions + j.positions, cv_submitted: acc.cv_submitted + j.cv_submitted, interview_scheduled: acc.interview_scheduled + j.interview_scheduled, interview_completed: acc.interview_completed + j.interview_completed, rejected: acc.rejected + j.rejected, offer_extended: acc.offer_extended + j.offer_extended, offer_accepted: acc.offer_accepted + j.offer_accepted, joined: acc.joined + j.joined, renege_dropped: acc.renege_dropped + j.renege_dropped }),
    { positions: 0, cv_submitted: 0, interview_scheduled: 0, interview_completed: 0, rejected: 0, offer_extended: 0, offer_accepted: 0, joined: 0, renege_dropped: 0 }
  )

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'interview_scheduled': return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'interview_completed': return 'bg-purple-100 text-purple-800 border-purple-300'
      case 'offer_extended':      return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'offer_accepted':      return 'bg-green-100 text-green-800 border-green-300'
      case 'joined':              return 'bg-emerald-100 text-emerald-800 border-emerald-300'
      default:                    return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStageLabel = (stage: string) =>
    stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

  const groupedHighlights = {
    interview_scheduled: highlights.filter(h => h.current_stage === 'interview_scheduled'),
    interview_completed: highlights.filter(h => h.current_stage === 'interview_completed'),
    offer_extended:      highlights.filter(h => h.current_stage === 'offer_extended'),
    offer_accepted:      highlights.filter(h => h.current_stage === 'offer_accepted'),
    joined:              highlights.filter(h => h.current_stage === 'joined'),
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  const PipelineCell = ({ value, colKey }: { value: number; colKey: string }) => {
    const col = PIPELINE_COLS.find(c => c.key === colKey)!
    return (
      <td className="px-4 py-3 text-center">
        <span className={`px-2 py-1 rounded font-semibold text-xs ${col.bg} ${col.text}`}>{value}</span>
      </td>
    )
  }

  const TotalCell = ({ value, colKey }: { value: number; colKey: string }) => {
    const col = PIPELINE_COLS.find(c => c.key === colKey)!
    return (
      <td className="px-4 py-3 text-center">
        <span className={`px-2 py-1 rounded font-bold text-xs border-2 ${col.bg} ${col.text}`}>{value}</span>
      </td>
    )
  }

  const ConversionCell = ({ rate }: { rate: number }) => (
    <td className="px-4 py-3 text-center">
      <span className={`px-2 py-1 rounded font-bold text-xs ${
        rate >= 20 ? 'bg-green-100 text-green-800' :
        rate >= 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
      }`}>{rate}%</span>
    </td>
  )

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 pb-8">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg p-6 text-white">
          <h1 className="text-3xl font-bold mb-2">📊 Pipeline Analytics</h1>
          <p className="text-blue-100">Real-time recruitment pipeline tracking and insights</p>
        </div>

        {/* Period Selector */}
        <div className="bg-white rounded-lg p-4 shadow">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex gap-2">
              {[
                { key: 'previous_day', label: 'Previous Day' },
                { key: 'today',        label: 'Today' },
                { key: 'week',         label: 'Last 7 Days' },
                { key: 'month',        label: 'This Month' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setSelectedPeriod(key)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    selectedPeriod === key ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-end">
              <div>
                <label className="block text-xs text-gray-600 mb-1">From</label>
                <input type="date" value={customStartDate}
                  onChange={(e) => { setCustomStartDate(e.target.value); setSelectedPeriod('custom') }}
                  className="px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">To</label>
                <input type="date" value={customEndDate}
                  onChange={(e) => { setCustomEndDate(e.target.value); setSelectedPeriod('custom') }}
                  className="px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            {/* ── Export Button ── */}
            <button
              onClick={exportToExcel}
              disabled={exporting}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium ml-auto flex items-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Exporting...
                </>
              ) : (
                <>📥 Export Excel</>
              )}
            </button>
          </div>
        </div>

        {/* Overall Pipeline */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 border-2 border-purple-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">📈 Overall Pipeline Progress</h2>
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
            {PIPELINE_COLS.map(({ key, label, color }) => (
              <div key={key} className="bg-white rounded-lg p-3 text-center shadow">
                <div className="text-xs text-gray-500 mb-1 leading-tight">{label}</div>
                <div className={`text-2xl font-bold ${color}`}>
                  {(totals as any)[`total_${key}`] ?? 0}
                </div>
              </div>
            ))}
            <div className="bg-white rounded-lg p-3 text-center shadow border-2 border-green-300">
              <div className="text-xs text-gray-500 mb-1 leading-tight">Conversion %</div>
              <div className="text-2xl font-bold text-green-700">{totals.overall_conversion}%</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[
                { key: 'recruiter', label: `👨‍💼 Recruiter Progress (${recruiterProgress.length})` },
                { key: 'client',    label: `🏢 Client Progress (${clientProgress.length})` },
                { key: 'job',       label: `💼 Job Progress (${jobProgress.length})` },
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

          <div className="p-6">
            {/* Recruiter Table */}
            {activeTab === 'recruiter' && (
              <div className="overflow-x-auto">
                {recruiterProgress.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No recruiter data found for selected period</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50">Recruiter</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Jobs Assigned</th>
                        {PIPELINE_COLS.map(c => (
                          <th key={c.key} className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">{c.label}</th>
                        ))}
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Conversion %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {recruiterProgress.map((rec) => (
                        <tr key={rec.recruiter_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium sticky left-0 bg-white">{rec.recruiter_name}</td>
                          <td className="px-4 py-3 text-center">{rec.jobs_assigned}</td>
                          {PIPELINE_COLS.map(c => <PipelineCell key={c.key} colKey={c.key} value={(rec as any)[c.key]} />)}
                          <ConversionCell rate={rec.conversion_rate} />
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td className="px-4 py-3 text-gray-900 sticky left-0 bg-gray-100">Total</td>
                        <td className="px-4 py-3 text-center text-gray-900">{recruiterTotals.jobs_assigned}</td>
                        {PIPELINE_COLS.map(c => <TotalCell key={c.key} colKey={c.key} value={(recruiterTotals as any)[c.key]} />)}
                        <ConversionCell rate={recruiterTotals.cv_submitted > 0 ? Math.round((recruiterTotals.joined / recruiterTotals.cv_submitted) * 100) : 0} />
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Client Table */}
            {activeTab === 'client' && (
              <div className="overflow-x-auto">
                {clientProgress.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No client data found for selected period</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50">Client</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">New Jobs</th>
                        {PIPELINE_COLS.map(c => (
                          <th key={c.key} className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">{c.label}</th>
                        ))}
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Conversion %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {clientProgress.map((client) => (
                        <tr key={client.client_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium sticky left-0 bg-white">{client.client_name}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded font-semibold text-xs">{client.new_jobs_added}</span>
                          </td>
                          {PIPELINE_COLS.map(c => <PipelineCell key={c.key} colKey={c.key} value={(client as any)[c.key]} />)}
                          <ConversionCell rate={client.conversion_rate} />
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td className="px-4 py-3 text-gray-900 sticky left-0 bg-gray-100">Total</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded font-bold text-xs border-2">{clientTotals.new_jobs_added}</span>
                        </td>
                        {PIPELINE_COLS.map(c => <TotalCell key={c.key} colKey={c.key} value={(clientTotals as any)[c.key]} />)}
                        <ConversionCell rate={clientTotals.cv_submitted > 0 ? Math.round((clientTotals.joined / clientTotals.cv_submitted) * 100) : 0} />
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Job Table */}
            {activeTab === 'job' && (
              <div className="overflow-x-auto">
                {jobProgress.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No job data found for selected period</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50">Job Code</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Job Title</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Client</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Positions</th>
                        {PIPELINE_COLS.map(c => (
                          <th key={c.key} className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">{c.label}</th>
                        ))}
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Filled %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {jobProgress.map((job) => (
                        <tr key={job.job_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-blue-600 sticky left-0 bg-white">{job.job_code}</td>
                          <td className="px-4 py-3">{job.job_title}</td>
                          <td className="px-4 py-3 text-gray-600">{job.client_name}</td>
                          <td className="px-4 py-3 text-center">{job.positions}</td>
                          {PIPELINE_COLS.map(c => <PipelineCell key={c.key} colKey={c.key} value={(job as any)[c.key]} />)}
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div className={`h-2 rounded-full ${job.filled_rate >= 80 ? 'bg-green-500' : job.filled_rate >= 50 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                                  style={{ width: `${Math.min(job.filled_rate, 100)}%` }} />
                              </div>
                              <span className="text-xs font-semibold w-8">{job.filled_rate}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td className="px-4 py-3 text-gray-900 sticky left-0 bg-gray-100">Total</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-center text-gray-900">{jobTotals.positions}</td>
                        {PIPELINE_COLS.map(c => <TotalCell key={c.key} colKey={c.key} value={(jobTotals as any)[c.key]} />)}
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-bold text-gray-700">
                            {jobTotals.positions > 0 ? Math.round((jobTotals.joined / jobTotals.positions) * 100) : 0}%
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Candidate Highlights */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">🎯 Active Candidates Highlight</h2>
          <div className="space-y-6">
            {Object.entries(groupedHighlights).map(([stage, candidates]) => {
              if (candidates.length === 0) return null
              return (
                <div key={stage} className="border-l-4 border-blue-500 pl-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">
                    <span className={`px-3 py-1 rounded-full text-sm border-2 ${getStageColor(stage)}`}>
                      {getStageLabel(stage)} ({candidates.length})
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {candidates.slice(0, 9).map((candidate) => (
                      <div key={candidate.id} className="border rounded-lg p-4 hover:shadow-lg transition bg-gradient-to-r from-white to-gray-50">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-bold text-gray-900">{candidate.full_name}</h4>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            candidate.days_in_stage <= 3 ? 'bg-green-100 text-green-800' :
                            candidate.days_in_stage <= 7 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                          }`}>{candidate.days_in_stage}d</span>
                        </div>
                        <div className="text-sm space-y-1">
                          <p className="text-gray-700"><span className="font-medium">Job:</span> {candidate.job_title}</p>
                          <p className="text-gray-600"><span className="font-medium">Client:</span> {candidate.client_name}</p>
                          <p className="text-gray-600"><span className="font-medium">Recruiter:</span> {candidate.recruiter_name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {candidates.length > 9 && (
                    <div className="mt-4 text-center text-sm text-gray-600">
                      +{candidates.length - 9} more candidates in this stage
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}
