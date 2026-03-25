// app/recruiter/jobs/[id]/candidates/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const STAGE_LABELS: { [key: string]: { label: string; color: string } } = {
  sourced:              { label: 'Sourced',             color: 'bg-gray-100 text-gray-700' },
  screening:            { label: 'Screening',           color: 'bg-blue-100 text-blue-700' },
  interview_scheduled:  { label: 'Interview Scheduled', color: 'bg-yellow-100 text-yellow-700' },
  interview_completed:  { label: 'Interview Completed', color: 'bg-purple-100 text-purple-700' },
  offer_extended:       { label: 'Offer Extended',      color: 'bg-orange-100 text-orange-700' },
  offer_accepted:       { label: 'Offer Accepted',      color: 'bg-green-100 text-green-700' },
  joined:               { label: 'Joined',              color: 'bg-green-200 text-green-800' },
  on_hold:              { label: 'On Hold',             color: 'bg-gray-100 text-gray-500' },
  rejected:             { label: 'Rejected',            color: 'bg-red-100 text-red-700' },
  interview_rejected:   { label: 'Interview Rejected',  color: 'bg-red-100 text-red-600' },
  withdrawn:            { label: 'Withdrawn',           color: 'bg-gray-100 text-gray-500' },
}

export default function RecruiterJobCandidatesPage() {
  const params = useParams()
  const router = useRouter()

  const [job, setJob] = useState<any>(null)
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('all')

  useEffect(() => {
    if (params.id) loadData(params.id as string)
  }, [params.id])

  const loadData = async (jobId: string) => {
    setLoading(true)
    try {
      // Load job info
      const { data: jobData } = await supabase
        .from('jobs')
        .select('id, job_title, job_code, positions, positions_filled, clients(company_name)')
        .eq('id', jobId)
        .single()
      setJob(jobData)

      // Load all candidates for this job
      const { data: candidatesData, error } = await supabase
        .from('candidates')
        .select('id, full_name, email, phone, current_company, total_experience, current_location, current_stage, key_skills, created_at, resume_url')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCandidates(candidatesData || [])
    } catch (error) {
      console.error('Error loading candidates:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter candidates by search + stage
  const filtered = candidates.filter(c => {
    const matchesStage = stageFilter === 'all' || c.current_stage === stageFilter
    const q = searchQuery.toLowerCase().trim()
    const matchesSearch = !q || (
      c.full_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.current_company?.toLowerCase().includes(q) ||
      c.current_location?.toLowerCase().includes(q) ||
      c.key_skills?.toLowerCase().includes(q)
    )
    return matchesStage && matchesSearch
  })

  const getStageBadge = (stage: string) => {
    const opt = STAGE_LABELS[stage]
    return opt ? { label: opt.label, color: opt.color } : { label: stage, color: 'bg-gray-100 text-gray-600' }
  }

  // Unique stages present in this job's candidates for filter dropdown
  const presentStages = [...new Set(candidates.map(c => c.current_stage).filter(Boolean))]

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-800 mb-1 flex items-center gap-1">
              ← Back to Jobs
            </button>
            {job && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-bold text-blue-600">{job.job_code}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-sm text-gray-500">{job.clients?.company_name}</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{job.job_title}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {job.positions_filled}/{job.positions} positions filled
                </p>
              </>
            )}
          </div>
          <button
            onClick={() => router.push(`/recruiter/jobs/${params.id}/add-candidate`)}
            className="btn-primary"
          >
            + Add Candidate
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="kpi-card">
            <div className="kpi-title">Total Submitted</div>
            <div className="kpi-value">{candidates.length}</div>
          </div>
          <div className="kpi-card kpi-success">
            <div className="kpi-title">Offers Accepted</div>
            <div className="kpi-value">{candidates.filter(c => c.current_stage === 'offer_accepted').length}</div>
          </div>
          <div className="kpi-card kpi-warning">
            <div className="kpi-title">In Interview</div>
            <div className="kpi-value">{candidates.filter(c => ['interview_scheduled','interview_completed'].includes(c.current_stage)).length}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Screening</div>
            <div className="kpi-value">{candidates.filter(c => c.current_stage === 'screening').length}</div>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="card">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, company, location, skills…"
                className="input w-full pl-9"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-3 text-gray-400 hover:text-gray-600 text-sm">✕</button>
              )}
            </div>
            <div className="sm:w-52">
              <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="input w-full">
                <option value="all">All Stages</option>
                {presentStages.map(stage => (
                  <option key={stage} value={stage}>{STAGE_LABELS[stage]?.label || stage}</option>
                ))}
              </select>
            </div>
          </div>
          {(searchQuery || stageFilter !== 'all') && (
            <p className="text-xs text-gray-500 mt-2">
              Showing <span className="font-semibold text-gray-700">{filtered.length}</span> of {candidates.length} candidates
            </p>
          )}
        </div>

        {/* Candidates list */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 mb-2">
              {candidates.length === 0 ? 'No candidates submitted yet' : 'No candidates match your search'}
            </p>
            {candidates.length === 0 && (
              <button onClick={() => router.push(`/recruiter/jobs/${params.id}/add-candidate`)} className="btn-primary mt-3">
                + Add First Candidate
              </button>
            )}
            {(searchQuery || stageFilter !== 'all') && (
              <button onClick={() => { setSearchQuery(''); setStageFilter('all') }} className="text-sm text-blue-600 hover:underline mt-2 block mx-auto">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Candidate</th>
                  <th>Contact</th>
                  <th>Company</th>
                  <th>Experience</th>
                  <th>Location</th>
                  <th>Stage</th>
                  <th>Submitted</th>
                  <th>Resume</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => {
                  const badge = getStageBadge(c.current_stage)
                  return (
                    <tr key={c.id}>
                      <td className="text-gray-400 text-sm">{idx + 1}</td>
                      <td>
                        <div className="font-medium text-gray-900">{c.full_name}</div>
                        {c.key_skills && (
                          <div className="text-xs text-gray-400 mt-0.5 max-w-[180px] truncate">{c.key_skills}</div>
                        )}
                      </td>
                      <td>
                        <div className="text-sm text-gray-700">{c.phone || '—'}</div>
                        <div className="text-xs text-gray-400">{c.email || ''}</div>
                      </td>
                      <td className="text-sm text-gray-700">{c.current_company || '—'}</td>
                      <td className="text-sm text-gray-700">{c.total_experience ? `${c.total_experience} yrs` : '—'}</td>
                      <td className="text-sm text-gray-700">{c.current_location || '—'}</td>
                      <td>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="text-xs text-gray-500">
                        {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </td>
                      <td>
                        {c.resume_url ? (
                          <a
                            href={c.resume_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            📄 View
                          </a>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}