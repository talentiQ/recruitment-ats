// app/recruiter/jobs/[id]/page.tsx - VIEW JOB DETAILS
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Stage config (mirrors Sr.TL page) ───────────────────────────────────────

const STAGE_WEIGHTS: Record<string, number> = {
  sourced:              5,
  screening:            20,
  screening_rejected:   0,
  interview_scheduled:  50,
  interview_rejected:   0,
  documentation:        70,
  offer_extended:       80,
  offer_accepted:       90,
  offer_rejected:       0,
  joined:               100,
  renege:               0,
  on_hold:              0,
}

const STAGE_STYLES: Record<string, string> = {
  sourced:              'bg-gray-100 text-gray-700',
  screening:            'bg-yellow-100 text-yellow-800',
  screening_rejected:   'bg-orange-100 text-orange-800',
  interview_scheduled:  'bg-blue-100 text-blue-800',
  interview_rejected:   'bg-red-200 text-red-800',
  documentation:        'bg-cyan-100 text-cyan-800',
  offer_extended:       'bg-indigo-100 text-indigo-800',
  offer_accepted:       'bg-green-100 text-green-800',
  offer_rejected:       'bg-rose-100 text-rose-800',
  joined:               'bg-green-600 text-white',
  renege:               'bg-orange-200 text-orange-900',
  on_hold:              'bg-gray-200 text-gray-600',
}

// ─── Pipeline helpers ─────────────────────────────────────────────────────────

function calculatePipelineProgress(candidates: any[], positions: number) {
  const active = candidates.filter(c =>
    !['renege','offer_rejected','screening_rejected','interview_rejected']
      .includes(c.current_stage)
  )

  const scored = active.map(c => ({
    ...c,
    score: STAGE_WEIGHTS[c.current_stage] || 0
  }))

  // Sort by strongest candidates first
  scored.sort((a, b) => b.score - a.score)

  // 🔥 ONLY TAKE BEST CANDIDATES
  const top = scored.slice(0, positions * 2)  // reduced from *3

  const total = top.reduce((sum, c) => sum + c.score, 0)
  const max = top.length * 100 || 1

  const joinedCount = candidates.filter(
    c => c.current_stage === 'joined'
  ).length

  // ✅ override for closure
  if (joinedCount >= (positions || 0)) {
    return 100
  }

  return Math.round((total / max) * 100)
}
function getPipelineInsight(candidates: any[], positions: number): string {
  const counts: Record<string, number> = {}
  candidates.forEach(c => { counts[c.current_stage] = (counts[c.current_stage] || 0) + 1 })

  const interview     = (counts['interview_scheduled'] || 0) + (counts['interview_completed'] || 0)
  const documentation = counts['documentation'] || 0
  const offers        = counts['offer_accepted'] || 0
  const joined        = counts['joined'] || 0
  const screening     = counts['screening'] || 0

  if (joined        >= positions) return '✅ Positions closed successfully.'
  if (offers        >= positions) return '🔥 Offers accepted — closure highly likely.'
  if (documentation >= positions) return '🚀 Strong pipeline — candidates in documentation stage.'
  if (interview     >= positions) return '⚡ Good momentum — interviews actively progressing.'
  if (screening > interview)      return '⚠️ Many candidates stuck in screening — push to interview stage.'
  if (candidates.length === 0)    return '🚨 No candidates yet — start sourcing immediately.'
  return '📊 Pipeline is building — focus on moving candidates forward.'
}

function FunnelStrip({ candidates }: { candidates: any[] }) {
  const counts: Record<string, number> = {}
  candidates.forEach(c => { counts[c.current_stage] = (counts[c.current_stage] || 0) + 1 })

  const order = [
    'sourced', 'screening', 'interview_scheduled', 'interview_completed',
    'documentation', 'offer_extended', 'offer_accepted', 'joined',
  ]

  const hasAny = order.some(s => counts[s])
  if (!hasAny) return null

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {order.map(stage => {
        const count = counts[stage] || 0
        if (!count) return null
        return (
          <div key={stage} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${STAGE_STYLES[stage]}`}>
            {stage.replace(/_/g, ' ')} ({count})
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RecruiterJobDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [job,        setJob]        = useState<any>(null)
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    if (params.id) loadJob(params.id as string)
  }, [params.id])

  const loadJob = async (id: string) => {
    setLoading(true)
    try {
      const [jobRes, candRes] = await Promise.all([
        supabase
          .from('jobs')
          .select(`
            *,
            clients(
              company_name,
              contact_person,
              contact_email,
              fee_percentage
            )
          `)
          .eq('id', id)
          .single(),

        supabase
          .from('candidates')
          .select('id, current_stage')
          .eq('job_id', id),
      ])

      if (jobRes.error) throw jobRes.error
      setJob(jobRes.data)
      setCandidates(candRes.data || [])

    } catch (error) {
      console.error('Error loading job:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    </DashboardLayout>
  )

  if (!job) return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-600">Job not found</p>
        <button onClick={() => router.back()} className="mt-4 text-blue-600 hover:underline text-sm">← Go back</button>
      </div>
    </DashboardLayout>
  )

  // ── Derived stats ─────────────────────────────────────────────────────────
  const joinedCount      = candidates.filter(c => c.current_stage === 'joined').length
  const total            = job.positions || 0
  const pipelineProgress = calculatePipelineProgress(candidates, total)
  const pipelineInsight  = getPipelineInsight(candidates, total)
  const positionsFilled  = joinedCount
  const progressPct      = total > 0 ? Math.round((positionsFilled / total) * 100) : 0

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center">
          <button onClick={() => router.back()} className="text-sm text-gray-600 hover:text-gray-900 mb-3">
            ← Back
          </button>
          <div className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-mono font-bold mb-2">
            {job.job_code}
          </div>
          <h2 className="text-3xl font-bold text-gray-900">{job.job_title}</h2>
          <p className="text-gray-600">{job.clients?.company_name}</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card text-center">
            <div className="text-sm text-gray-600">Location</div>
            <div className="font-bold text-gray-900 mt-1">📍 {job.location}</div>
          </div>
          <div className="card text-center">
            <div className="text-sm text-gray-600">Experience</div>
            <div className="font-bold text-gray-900 mt-1">{job.experience_min}–{job.experience_max} yrs</div>
          </div>
          <div className="card text-center">
            <div className="text-sm text-gray-600">CTC Range</div>
            <div className="font-bold text-gray-900 mt-1">₹{job.min_ctc}–{job.max_ctc}L</div>
          </div>
          <div className="card text-center">
            <div className="text-sm text-gray-600">Positions Filled</div>
            <div className="font-bold text-gray-900 mt-1">
              {positionsFilled}/{total}
              <span className="text-xs text-gray-500 ml-1">({progressPct}%)</span>
            </div>
          </div>
        </div>

        {/* Additional details row */}
        {(job.work_mode || job.job_type || job.notice_period_pref || job.target_close_date) && (
          <div className="card">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {job.work_mode && (
                <div>
                  <span className="text-gray-500">Work Mode</span>
                  <p className="font-medium text-gray-900 mt-0.5">{job.work_mode}</p>
                </div>
              )}
              {job.job_type && (
                <div>
                  <span className="text-gray-500">Job Type</span>
                  <p className="font-medium text-gray-900 mt-0.5">{job.job_type}</p>
                </div>
              )}
              {job.notice_period_pref && (
                <div>
                  <span className="text-gray-500">Notice Period</span>
                  <p className="font-medium text-gray-900 mt-0.5">{job.notice_period_pref}</p>
                </div>
              )}
              {job.target_close_date && (
                <div>
                  <span className="text-gray-500">Target Close</span>
                  <p className="font-medium text-gray-900 mt-0.5">
                    {new Date(job.target_close_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pipeline Maturity */}
        <div className="card">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-gray-900">📊 Pipeline Maturity</h3>
            <span className="text-sm text-gray-600">{pipelineProgress}%</span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 via-indigo-500 to-green-500 h-6 text-white flex items-center justify-center text-xs font-semibold transition-all duration-500"
              style={{ width: `${pipelineProgress}%` }}
            >
              {pipelineProgress > 10 ? `${pipelineProgress}%` : ''}
            </div>
          </div>

          <div className="mt-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900 font-medium">
            {pipelineInsight}
          </div>

          <FunnelStrip candidates={candidates} />
        </div>

        {/* Job Description */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">📄 Job Description</h3>
          {job.job_description ? (
            <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
              {job.job_description}
            </p>
          ) : (
            <p className="text-gray-400 text-sm italic">No description available</p>
          )}
        </div>

        {/* Key Skills */}
        {(job.key_skills || job.nice_to_have_skills) && (
          <div className="card">
            <div className="grid md:grid-cols-2 gap-4">

              {job.key_skills && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">🎯 Key Skills Required</h3>
                  <div className="flex flex-wrap gap-2">
                    {job.key_skills.split(',').map((skill: string, i: number) => (
                      <span key={i} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium border border-blue-200">
                        {skill.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {job.nice_to_have_skills && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">✨ Nice to Have</h3>
                  <div className="flex flex-wrap gap-2">
                    {job.nice_to_have_skills.split(',').map((skill: string, i: number) => (
                      <span key={i} className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium border border-purple-200">
                        {skill.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {job.education_requirement && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <span className="text-sm font-medium text-gray-700">🎓 Education: </span>
                <span className="text-sm text-gray-600">{job.education_requirement}</span>
              </div>
            )}
          </div>
        )}

        {/* Client Info */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">🏢 Client Information</h3>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-gray-500">Company</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{job.clients?.company_name}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Contact Person</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{job.clients?.contact_person || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Contact Email</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{job.clients?.contact_email || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Fee Percentage</dt>
              <dd className="font-medium text-gray-900 mt-0.5">
                {job.clients?.fee_percentage ? `${job.clients.fee_percentage}%` : '—'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 flex-wrap">
          <button
            onClick={() => router.push(`/recruiter/candidates?jobId=${job.id}`)}
            className="btn-primary"
          >
            👥 View Candidates ({candidates.length})
          </button>
          <button
            onClick={() => router.push(`/recruiter/jobs/${job.id}/add-candidate`)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium transition"
          >
            + Add Candidate
          </button>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium transition"
          >
            ← Back
          </button>
        </div>

      </div>
    </DashboardLayout>
  )
}