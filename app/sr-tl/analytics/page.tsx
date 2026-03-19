// app/sr-tl/analytics/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

interface MemberProgress {
  member_id: string
  member_name: string
  role: 'team_leader' | 'recruiter'
  reports_to_name: string
  jobs_assigned: number
  cv_submitted: number
  interview_scheduled: number
  interview_completed: number
  interview_rejected: number
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
  interview_rejected: number
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
  interview_rejected: number
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
  { key: 'interview_rejected',  label: 'Interview Rejected',  color: 'text-red-600',    bg: 'bg-red-100',    text: 'text-red-800'    },
  { key: 'offer_extended',      label: 'Offer Extended',      color: 'text-orange-600', bg: 'bg-orange-100', text: 'text-orange-800' },
  { key: 'offer_accepted',      label: 'Offer Accepted',      color: 'text-green-600',  bg: 'bg-green-100',  text: 'text-green-800'  },
  { key: 'joined',              label: 'Joined',              color: 'text-emerald-600',bg: 'bg-emerald-100',text: 'text-emerald-800'},
  { key: 'renege_dropped',      label: 'Renege/Dropped',      color: 'text-yellow-600', bg: 'bg-yellow-100', text: 'text-yellow-800' },
]

function countFromCandidates(candidates: any[], start: string, end: string) {
  const startTs = new Date(start).getTime()
  const endTs   = new Date(end).getTime()
  let cv_submitted = 0, interview_scheduled = 0, interview_completed = 0
  let interview_rejected = 0, offer_extended = 0, offer_accepted = 0
  let joined = 0, renege_dropped = 0
  candidates.forEach((c: any) => {
    const createdTs      = c.created_at        ? new Date(c.created_at).getTime()        : 0
    const lastActivityTs = c.last_activity_date ? new Date(c.last_activity_date).getTime() : 0
    const stage          = c.current_stage || ''
    if (createdTs >= startTs && createdTs <= endTs) cv_submitted++
    if (lastActivityTs >= startTs && lastActivityTs <= endTs) {
      if (stage === 'interview_scheduled') interview_scheduled++
      if (stage === 'interview_completed') interview_completed++
      if (stage === 'interview_rejected')  interview_rejected++
      if (stage === 'offer_extended')      offer_extended++
      if (stage === 'offer_accepted')      offer_accepted++
      if (stage === 'joined')              joined++
      if (stage === 'renege')              renege_dropped++
    }
  })
  return { cv_submitted, interview_scheduled, interview_completed, interview_rejected, offer_extended, offer_accepted, joined, renege_dropped }
}

export default function SrTLAnalytics() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState('month')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [activeTab, setActiveTab] = useState<'member' | 'client' | 'job'>('member')

  const [memberProgress, setMemberProgress] = useState<MemberProgress[]>([])
  const [clientProgress, setClientProgress] = useState<ClientProgress[]>([])
  const [jobProgress, setJobProgress]       = useState<JobProgress[]>([])
  const [highlights, setHighlights]         = useState<CandidateHighlight[]>([])

  const [totals, setTotals] = useState({
    total_cv_submitted: 0, total_interview_scheduled: 0, total_interview_completed: 0,
    total_interview_rejected: 0, total_offer_extended: 0, total_offer_accepted: 0,
    total_joined: 0, total_renege_dropped: 0, overall_conversion: 0,
  })

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/'); return }
    const parsedUser = JSON.parse(userData)
    if (parsedUser.role !== 'sr_team_leader') {
      alert('Access denied. Sr. Team Leader only.'); router.push('/'); return
    }
    setUser(parsedUser)
  }, [])

  useEffect(() => {
    if (!user) return
    bootstrapTeam(user, getDateRange())
  }, [user, selectedPeriod, customStartDate, customEndDate])

  const getDateRange = () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (selectedPeriod === 'custom' && customStartDate && customEndDate)
      return { start: new Date(customStartDate).toISOString(), end: new Date(customEndDate + 'T23:59:59').toISOString() }
    if (selectedPeriod === 'previous_day') {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      return { start: y.toISOString(), end: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59).toISOString() }
    }
    if (selectedPeriod === 'today')
      return { start: today.toISOString(), end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString() }
    if (selectedPeriod === 'week') {
      const ws = new Date(today); ws.setDate(ws.getDate() - 7)
      return { start: ws.toISOString(), end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString() }
    }
    if (selectedPeriod === 'month')
      return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString() }
    return { start: today.toISOString(), end: new Date().toISOString() }
  }

  const getPeriodLabel = () => {
    if (selectedPeriod === 'custom' && customStartDate && customEndDate) return `${customStartDate} to ${customEndDate}`
    if (selectedPeriod === 'previous_day') return 'Previous Day'
    if (selectedPeriod === 'today')        return 'Today'
    if (selectedPeriod === 'week')         return 'Last 7 Days'
    if (selectedPeriod === 'month')        return 'This Month'
    return ''
  }

  const bootstrapTeam = async (srTl: any, range: { start: string; end: string }) => {
    setLoading(true)
    try {
      const { data: directReports } = await supabase
        .from('users').select('id, full_name, role, reports_to')
        .eq('reports_to', srTl.id).eq('is_active', true)
      const tlIds = (directReports || []).filter((m: any) => m.role === 'team_leader').map((m: any) => m.id)
      let indirectRecruiters: any[] = []
      if (tlIds.length > 0) {
        const { data: recs } = await supabase.from('users').select('id, full_name, role, reports_to')
          .in('reports_to', tlIds).eq('role', 'recruiter').eq('is_active', true)
        indirectRecruiters = recs || []
      }
      const allMembers   = [...(directReports || []), ...indirectRecruiters]
      const allMemberIds = allMembers.map((m: any) => m.id)
      const nameMap: Record<string, string> = {}
      allMembers.forEach((m: any) => { nameMap[m.id] = m.full_name })
      nameMap[srTl.id] = 'Direct'
      const { data: allCandidates } = await supabase.from('candidates')
        .select(`id, assigned_to, job_id, current_stage, created_at, last_activity_date,
          jobs ( id, job_code, job_title, positions, client_id, clients ( id, company_name ) ),
          users:assigned_to ( full_name )`)
        .in('assigned_to', allMemberIds)
        .or(`and(created_at.gte.${range.start},created_at.lte.${range.end}),and(last_activity_date.gte.${range.start},last_activity_date.lte.${range.end})`)
      const candidates = allCandidates || []
      await Promise.all([
        computeTotals(candidates, range),
        computeMemberProgress(allMembers, nameMap, candidates, range),
        computeClientProgress(candidates, range),
        computeJobProgress(allMemberIds, srTl.team_id, candidates, range),
        loadHighlights(allMemberIds),
      ])
    } catch (err) { console.error('Bootstrap error:', err) }
    finally { setLoading(false) }
  }

  const computeTotals = async (candidates: any[], range: { start: string; end: string }) => {
    const counts = countFromCandidates(candidates, range.start, range.end)
    setTotals({ total_cv_submitted: counts.cv_submitted, total_interview_scheduled: counts.interview_scheduled,
      total_interview_completed: counts.interview_completed, total_interview_rejected: counts.interview_rejected,
      total_offer_extended: counts.offer_extended, total_offer_accepted: counts.offer_accepted,
      total_joined: counts.joined, total_renege_dropped: counts.renege_dropped,
      overall_conversion: counts.cv_submitted > 0 ? Math.round((counts.joined / counts.cv_submitted) * 100) : 0 })
  }

  const computeMemberProgress = async (allMembers: any[], nameMap: Record<string, string>, allCandidates: any[], range: { start: string; end: string }) => {
    const progress = await Promise.all(allMembers.map(async (member: any) => {
      const mine = allCandidates.filter((c: any) => c.assigned_to === member.id)
      const { count: jobs_assigned } = await supabase.from('job_recruiter_assignments')
        .select('*', { count: 'exact', head: true }).eq('recruiter_id', member.id)
      const counts = countFromCandidates(mine, range.start, range.end)
      return { member_id: member.id, member_name: member.full_name, role: member.role,
        reports_to_name: nameMap[member.reports_to] || 'Direct', jobs_assigned: jobs_assigned || 0,
        ...counts, conversion_rate: counts.cv_submitted > 0 ? Math.round((counts.joined / counts.cv_submitted) * 100) : 0 }
    }))
    setMemberProgress(progress.sort((a: any, b: any) => {
      if (a.role === b.role) return b.cv_submitted - a.cv_submitted
      return a.role === 'team_leader' ? -1 : 1
    }))
  }

  const computeClientProgress = async (allCandidates: any[], range: { start: string; end: string }) => {
    const clientMap = new Map<string, string>()
    allCandidates.forEach((c: any) => { if (c.jobs?.clients?.id) clientMap.set(c.jobs.clients.id, c.jobs.clients.company_name) })
    if (clientMap.size === 0) { setClientProgress([]); return }
    const progress = await Promise.all(Array.from(clientMap.entries()).map(async ([clientId, clientName]) => {
      const mine = allCandidates.filter((c: any) => c.jobs?.clients?.id === clientId)
      const { count: new_jobs_added } = await supabase.from('jobs').select('*', { count: 'exact', head: true })
        .eq('client_id', clientId).gte('created_at', range.start).lte('created_at', range.end)
      const counts = countFromCandidates(mine, range.start, range.end)
      return { client_id: clientId, client_name: clientName, new_jobs_added: new_jobs_added || 0,
        ...counts, conversion_rate: counts.cv_submitted > 0 ? Math.round((counts.joined / counts.cv_submitted) * 100) : 0 }
    }))
    setClientProgress(progress.filter((c: any) => c.new_jobs_added + c.cv_submitted + c.interview_scheduled + c.joined > 0)
      .sort((a: any, b: any) => b.cv_submitted - a.cv_submitted))
  }

  const computeJobProgress = async (allMemberIds: string[], teamId: string, allCandidates: any[], range: { start: string; end: string }) => {
    const { data: assignedJobs } = await supabase.from('jobs')
      .select('id, job_code, job_title, positions, clients!inner(company_name)')
      .eq('assigned_team_id', teamId).eq('status', 'open')
    if (!assignedJobs || assignedJobs.length === 0) { setJobProgress([]); return }
    const progress = assignedJobs.map((job: any) => {
      const mine = allCandidates.filter((c: any) => c.job_id === job.id)
      const counts = countFromCandidates(mine, range.start, range.end)
      return { job_id: job.id, job_code: job.job_code, job_title: job.job_title,
        client_name: job.clients.company_name, positions: job.positions, ...counts,
        filled_rate: job.positions > 0 ? Math.round((counts.joined / job.positions) * 100) : 0 }
    })
    setJobProgress(progress.filter((j: any) => j.cv_submitted + j.interview_scheduled + j.joined > 0)
      .sort((a: any, b: any) => b.cv_submitted - a.cv_submitted))
  }

  const loadHighlights = async (allMemberIds: string[]) => {
    if (allMemberIds.length === 0) return
    const { data } = await supabase.from('candidates')
      .select(`id, full_name, current_stage, last_activity_date,
        jobs!inner(job_title, clients!inner(company_name)), assigned_user:assigned_to(full_name)`)
      .in('assigned_to', allMemberIds)
      .in('current_stage', ['interview_scheduled','interview_completed','offer_extended','offer_accepted','joined'])
      .order('last_activity_date', { ascending: false }).limit(50)
    if (!data) return
    const now = new Date()
    setHighlights(data.map((c: any) => ({
      id: c.id, full_name: c.full_name, current_stage: c.current_stage,
      job_title: c.jobs?.job_title || 'N/A', client_name: c.jobs?.clients?.company_name || 'N/A',
      recruiter_name: c.assigned_user?.full_name || 'N/A', last_activity_date: c.last_activity_date,
      days_in_stage: Math.floor((now.getTime() - new Date(c.last_activity_date).getTime()) / 86400000),
    })))
  }

  const memberTotals = memberProgress.reduce((a,m)=>({jobs_assigned:a.jobs_assigned+m.jobs_assigned,cv_submitted:a.cv_submitted+m.cv_submitted,interview_scheduled:a.interview_scheduled+m.interview_scheduled,interview_completed:a.interview_completed+m.interview_completed,interview_rejected:a.interview_rejected+m.interview_rejected,offer_extended:a.offer_extended+m.offer_extended,offer_accepted:a.offer_accepted+m.offer_accepted,joined:a.joined+m.joined,renege_dropped:a.renege_dropped+m.renege_dropped}),{jobs_assigned:0,cv_submitted:0,interview_scheduled:0,interview_completed:0,interview_rejected:0,offer_extended:0,offer_accepted:0,joined:0,renege_dropped:0})
  const clientTotals = clientProgress.reduce((a,c)=>({new_jobs_added:a.new_jobs_added+c.new_jobs_added,cv_submitted:a.cv_submitted+c.cv_submitted,interview_scheduled:a.interview_scheduled+c.interview_scheduled,interview_completed:a.interview_completed+c.interview_completed,interview_rejected:a.interview_rejected+c.interview_rejected,offer_extended:a.offer_extended+c.offer_extended,offer_accepted:a.offer_accepted+c.offer_accepted,joined:a.joined+c.joined,renege_dropped:a.renege_dropped+c.renege_dropped}),{new_jobs_added:0,cv_submitted:0,interview_scheduled:0,interview_completed:0,interview_rejected:0,offer_extended:0,offer_accepted:0,joined:0,renege_dropped:0})
  const jobTotals    = jobProgress.reduce((a,j)=>({positions:a.positions+j.positions,cv_submitted:a.cv_submitted+j.cv_submitted,interview_scheduled:a.interview_scheduled+j.interview_scheduled,interview_completed:a.interview_completed+j.interview_completed,interview_rejected:a.interview_rejected+j.interview_rejected,offer_extended:a.offer_extended+j.offer_extended,offer_accepted:a.offer_accepted+j.offer_accepted,joined:a.joined+j.joined,renege_dropped:a.renege_dropped+j.renege_dropped}),{positions:0,cv_submitted:0,interview_scheduled:0,interview_completed:0,interview_rejected:0,offer_extended:0,offer_accepted:0,joined:0,renege_dropped:0})

  // ── Excel Export — uses exceljs (replaces xlsx) ───────────────────────────
  const exportToExcel = async () => {
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb     = new ExcelJS.Workbook()
      const period = getPeriodLabel()

      // ── Overall Summary sheet ──
      const wsSummary = wb.addWorksheet('Overall Summary')
      wsSummary.columns = [{ width: 28 }, { width: 16 }]
      wsSummary.addRows([
        [`Team Pipeline Analytics — ${user?.full_name} — ${period}`],
        [`Generated on: ${new Date().toLocaleString()}`],
        [],
        ['Metric', 'Count'],
        ['CV Submitted',          totals.total_cv_submitted],
        ['Interview Scheduled',   totals.total_interview_scheduled],
        ['Interview Completed',   totals.total_interview_completed],
        ['Interview Rejected',    totals.total_interview_rejected],
        ['Offer Extended',        totals.total_offer_extended],
        ['Offer Accepted',        totals.total_offer_accepted],
        ['Joined',                totals.total_joined],
        ['Renege / Dropped',      totals.total_renege_dropped],
        ['Overall Conversion %',  `${totals.overall_conversion}%`],
      ])

      // ── Member Progress sheet ──
      const wsM = wb.addWorksheet('Member Progress')
      wsM.columns = [{ width: 22 }, { width: 14 }, { width: 20 }, ...Array(10).fill({ width: 20 })]
      wsM.addRow(['Member','Role','Reports To','Jobs Assigned','CV Submitted','Interview Scheduled','Interview Completed','Interview Rejected','Offer Extended','Offer Accepted','Joined','Renege/Dropped','Conversion %'])
      memberProgress.forEach(m => wsM.addRow([m.member_name, m.role==='team_leader'?'Team Leader':'Recruiter', m.reports_to_name, m.jobs_assigned, m.cv_submitted, m.interview_scheduled, m.interview_completed, m.interview_rejected, m.offer_extended, m.offer_accepted, m.joined, m.renege_dropped, `${m.conversion_rate}%`]))
      wsM.addRow(['TOTAL','','', memberTotals.jobs_assigned, memberTotals.cv_submitted, memberTotals.interview_scheduled, memberTotals.interview_completed, memberTotals.interview_rejected, memberTotals.offer_extended, memberTotals.offer_accepted, memberTotals.joined, memberTotals.renege_dropped, memberTotals.cv_submitted>0?`${Math.round(memberTotals.joined/memberTotals.cv_submitted*100)}%`:'0%'])

      // ── Client Progress sheet ──
      const wsC = wb.addWorksheet('Client Progress')
      wsC.columns = [{ width: 28 }, ...Array(10).fill({ width: 20 })]
      wsC.addRow(['Client','New Jobs','CV Submitted','Interview Scheduled','Interview Completed','Interview Rejected','Offer Extended','Offer Accepted','Joined','Renege/Dropped','Conversion %'])
      clientProgress.forEach(c => wsC.addRow([c.client_name, c.new_jobs_added, c.cv_submitted, c.interview_scheduled, c.interview_completed, c.interview_rejected, c.offer_extended, c.offer_accepted, c.joined, c.renege_dropped, `${c.conversion_rate}%`]))
      wsC.addRow(['TOTAL', clientTotals.new_jobs_added, clientTotals.cv_submitted, clientTotals.interview_scheduled, clientTotals.interview_completed, clientTotals.interview_rejected, clientTotals.offer_extended, clientTotals.offer_accepted, clientTotals.joined, clientTotals.renege_dropped, clientTotals.cv_submitted>0?`${Math.round(clientTotals.joined/clientTotals.cv_submitted*100)}%`:'0%'])

      // ── Job Progress sheet ──
      const wsJ = wb.addWorksheet('Job Progress')
      wsJ.columns = [{ width: 12 }, { width: 28 }, { width: 24 }, ...Array(10).fill({ width: 18 })]
      wsJ.addRow(['Job Code','Job Title','Client','Positions','CV Submitted','Interview Scheduled','Interview Completed','Interview Rejected','Offer Extended','Offer Accepted','Joined','Renege/Dropped','Filled %'])
      jobProgress.forEach(j => wsJ.addRow([j.job_code, j.job_title, j.client_name, j.positions, j.cv_submitted, j.interview_scheduled, j.interview_completed, j.interview_rejected, j.offer_extended, j.offer_accepted, j.joined, j.renege_dropped, `${j.filled_rate}%`]))

      // ── Download ──
      const buffer = await wb.xlsx.writeBuffer()
      const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url    = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href       = url
      a.download   = `Team_Analytics_${user?.full_name?.replace(/\s+/g,'_')}_${period.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)

    } catch(err) { console.error('Export error:', err); alert('Export failed.') }
    finally { setExporting(false) }
  }

  const getStageColor = (stage: string) => {
    switch(stage){
      case 'interview_scheduled': return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'interview_completed': return 'bg-purple-100 text-purple-800 border-purple-300'
      case 'offer_extended':      return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'offer_accepted':      return 'bg-green-100 text-green-800 border-green-300'
      case 'joined':              return 'bg-emerald-100 text-emerald-800 border-emerald-300'
      default:                    return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }
  const getStageLabel = (stage: string) => stage.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())
  const groupedHighlights = {
    interview_scheduled: highlights.filter(h=>h.current_stage==='interview_scheduled'),
    interview_completed: highlights.filter(h=>h.current_stage==='interview_completed'),
    offer_extended:      highlights.filter(h=>h.current_stage==='offer_extended'),
    offer_accepted:      highlights.filter(h=>h.current_stage==='offer_accepted'),
    joined:              highlights.filter(h=>h.current_stage==='joined'),
  }

  const PipelineCell = ({ value, colKey }: { value: number; colKey: string }) => {
    const col = PIPELINE_COLS.find(c=>c.key===colKey)!
    return <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded font-semibold text-xs ${col.bg} ${col.text}`}>{value}</span></td>
  }
  const TotalCell = ({ value, colKey }: { value: number; colKey: string }) => {
    const col = PIPELINE_COLS.find(c=>c.key===colKey)!
    return <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded font-bold text-xs border-2 ${col.bg} ${col.text}`}>{value}</span></td>
  }
  const ConversionCell = ({ rate }: { rate: number }) => (
    <td className="px-4 py-3 text-center">
      <span className={`px-2 py-1 rounded font-bold text-xs ${rate>=20?'bg-green-100 text-green-800':rate>=10?'bg-yellow-100 text-yellow-800':'bg-red-100 text-red-800'}`}>{rate}%</span>
    </td>
  )

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    </DashboardLayout>
  )

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 pb-8">

        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
          <h1 className="text-3xl font-bold mb-1">📊 Team Pipeline Analytics</h1>
          <p className="text-blue-100">
            {user?.full_name} · {memberProgress.filter(m=>m.role==='team_leader').length} TLs · {memberProgress.filter(m=>m.role==='recruiter').length} Recruiters
          </p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex gap-2">
              {[{key:'previous_day',label:'Previous Day'},{key:'today',label:'Today'},{key:'week',label:'Last 7 Days'},{key:'month',label:'This Month'}].map(({key,label})=>(
                <button key={key} onClick={()=>setSelectedPeriod(key)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${selectedPeriod===key?'bg-blue-600 text-white':'bg-gray-100 hover:bg-gray-200'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-end">
              <div>
                <label className="block text-xs text-gray-600 mb-1">From</label>
                <input type="date" value={customStartDate} onChange={e=>{setCustomStartDate(e.target.value);setSelectedPeriod('custom')}} className="px-3 py-2 border rounded-lg text-sm"/>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">To</label>
                <input type="date" value={customEndDate} onChange={e=>{setCustomEndDate(e.target.value);setSelectedPeriod('custom')}} className="px-3 py-2 border rounded-lg text-sm"/>
              </div>
            </div>
            <button onClick={exportToExcel} disabled={exporting}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium ml-auto flex items-center gap-2 transition disabled:opacity-60">
              {exporting?<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Exporting...</>:<>📥 Export Excel</>}
            </button>
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 border-2 border-purple-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">📈 Team Overall Pipeline</h2>
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
            {PIPELINE_COLS.map(({key,label,color})=>(
              <div key={key} className="bg-white rounded-lg p-3 text-center shadow">
                <div className="text-xs text-gray-500 mb-1 leading-tight">{label}</div>
                <div className={`text-2xl font-bold ${color}`}>{(totals as any)[`total_${key}`]??0}</div>
              </div>
            ))}
            <div className="bg-white rounded-lg p-3 text-center shadow border-2 border-green-300">
              <div className="text-xs text-gray-500 mb-1 leading-tight">Conversion %</div>
              <div className="text-2xl font-bold text-green-700">{totals.overall_conversion}%</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <div className="flex">
              {[{key:'member',label:`👤 Member Progress (${memberProgress.length})`},{key:'client',label:`🏢 Client Progress (${clientProgress.length})`},{key:'job',label:`💼 Job Progress (${jobProgress.length})`}].map(({key,label})=>(
                <button key={key} onClick={()=>setActiveTab(key as any)}
                  className={`px-6 py-4 font-medium border-b-2 transition ${activeTab===key?'border-blue-600 text-blue-600':'border-transparent text-gray-600 hover:text-gray-900'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-6">

            {activeTab==='member'&&(
              <div className="overflow-x-auto">
                {memberProgress.length===0?(
                  <div className="text-center py-8 text-gray-500">No team members found</div>
                ):(
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50"><tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50">Member</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Role</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Reports To</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Jobs Assigned</th>
                      {PIPELINE_COLS.map(c=><th key={c.key} className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">{c.label}</th>)}
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Conversion %</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-200">
                      {memberProgress.map(m=>(
                        <tr key={m.member_id} className={`hover:bg-gray-50 ${m.role==='team_leader'?'bg-purple-50':''}`}>
                          <td className={`px-4 py-3 font-medium sticky left-0 ${m.role==='team_leader'?'bg-purple-50':'bg-white'}`}>
                            {m.role==='recruiter'&&<span className="text-gray-300 mr-1">└</span>}
                            {m.member_name}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${m.role==='team_leader'?'bg-purple-100 text-purple-800':'bg-blue-100 text-blue-800'}`}>
                              {m.role==='team_leader'?'TL':'Recruiter'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">{m.reports_to_name}</td>
                          <td className="px-4 py-3 text-center">{m.jobs_assigned}</td>
                          {PIPELINE_COLS.map(c=><PipelineCell key={c.key} colKey={c.key} value={(m as any)[c.key]}/>)}
                          <ConversionCell rate={m.conversion_rate}/>
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td className="px-4 py-3 text-gray-900 sticky left-0 bg-gray-100">Total</td>
                        <td className="px-4 py-3"></td><td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-center">{memberTotals.jobs_assigned}</td>
                        {PIPELINE_COLS.map(c=><TotalCell key={c.key} colKey={c.key} value={(memberTotals as any)[c.key]}/>)}
                        <ConversionCell rate={memberTotals.cv_submitted>0?Math.round(memberTotals.joined/memberTotals.cv_submitted*100):0}/>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab==='client'&&(
              <div className="overflow-x-auto">
                {clientProgress.length===0?(
                  <div className="text-center py-8 text-gray-500">No client data for this team in selected period</div>
                ):(
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50"><tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50">Client</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">New Jobs</th>
                      {PIPELINE_COLS.map(c=><th key={c.key} className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">{c.label}</th>)}
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Conversion %</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-200">
                      {clientProgress.map(client=>(
                        <tr key={client.client_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium sticky left-0 bg-white">{client.client_name}</td>
                          <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-purple-100 text-purple-800 rounded font-semibold text-xs">{client.new_jobs_added}</span></td>
                          {PIPELINE_COLS.map(c=><PipelineCell key={c.key} colKey={c.key} value={(client as any)[c.key]}/>)}
                          <ConversionCell rate={client.conversion_rate}/>
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td className="px-4 py-3 text-gray-900 sticky left-0 bg-gray-100">Total</td>
                        <td className="px-4 py-3 text-center"><span className="px-2 py-1 bg-purple-100 text-purple-800 rounded font-bold text-xs border-2">{clientTotals.new_jobs_added}</span></td>
                        {PIPELINE_COLS.map(c=><TotalCell key={c.key} colKey={c.key} value={(clientTotals as any)[c.key]}/>)}
                        <ConversionCell rate={clientTotals.cv_submitted>0?Math.round(clientTotals.joined/clientTotals.cv_submitted*100):0}/>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab==='job'&&(
              <div className="overflow-x-auto">
                {jobProgress.length===0?(
                  <div className="text-center py-8 text-gray-500">No job data for this team in selected period</div>
                ):(
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50"><tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50">Job Code</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Job Title</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Client</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Positions</th>
                      {PIPELINE_COLS.map(c=><th key={c.key} className="px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap">{c.label}</th>)}
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Filled %</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-200">
                      {jobProgress.map(job=>(
                        <tr key={job.job_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-blue-600 sticky left-0 bg-white">{job.job_code}</td>
                          <td className="px-4 py-3">{job.job_title}</td>
                          <td className="px-4 py-3 text-gray-600">{job.client_name}</td>
                          <td className="px-4 py-3 text-center">{job.positions}</td>
                          {PIPELINE_COLS.map(c=><PipelineCell key={c.key} colKey={c.key} value={(job as any)[c.key]}/>)}
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div className={`h-2 rounded-full ${job.filled_rate>=80?'bg-green-500':job.filled_rate>=50?'bg-yellow-500':'bg-orange-500'}`} style={{width:`${Math.min(job.filled_rate,100)}%`}}/>
                              </div>
                              <span className="text-xs font-semibold w-8">{job.filled_rate}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td className="px-4 py-3 text-gray-900 sticky left-0 bg-gray-100">Total</td>
                        <td className="px-4 py-3"></td><td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-center">{jobTotals.positions}</td>
                        {PIPELINE_COLS.map(c=><TotalCell key={c.key} colKey={c.key} value={(jobTotals as any)[c.key]}/>)}
                        <td className="px-4 py-3 text-center"><span className="text-xs font-bold text-gray-700">{jobTotals.positions>0?Math.round(jobTotals.joined/jobTotals.positions*100):0}%</span></td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">🎯 Active Candidates Highlight</h2>
          <div className="space-y-6">
            {Object.entries(groupedHighlights).map(([stage,candidates])=>{
              if(candidates.length===0) return null
              return (
                <div key={stage} className="border-l-4 border-blue-500 pl-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">
                    <span className={`px-3 py-1 rounded-full text-sm border-2 ${getStageColor(stage)}`}>
                      {getStageLabel(stage)} ({candidates.length})
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {candidates.slice(0,9).map(c=>(
                      <div key={c.id} className="border rounded-lg p-4 hover:shadow-lg transition bg-gradient-to-r from-white to-gray-50">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-bold text-gray-900">{c.full_name}</h4>
                          <span className={`px-2 py-1 text-xs rounded-full ${c.days_in_stage<=3?'bg-green-100 text-green-800':c.days_in_stage<=7?'bg-yellow-100 text-yellow-800':'bg-red-100 text-red-800'}`}>{c.days_in_stage}d</span>
                        </div>
                        <div className="text-sm space-y-1">
                          <p className="text-gray-700"><span className="font-medium">Job:</span> {c.job_title}</p>
                          <p className="text-gray-600"><span className="font-medium">Client:</span> {c.client_name}</p>
                          <p className="text-gray-600"><span className="font-medium">Recruiter:</span> {c.recruiter_name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {candidates.length>9&&<div className="mt-4 text-center text-sm text-gray-600">+{candidates.length-9} more in this stage</div>}
                </div>
              )
            })}
            {highlights.length===0&&<div className="text-center py-8 text-gray-500">No active candidates in pipeline stages</div>}
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}