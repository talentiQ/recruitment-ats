// components/StaleCandidatesBanner.tsx
'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const STALE_DAYS = 7
const TERMINAL_STAGES = ['joined', 'interview_rejected', 'screening_rejected', 'interview_rejected', 'renege', 'offer_accepted', 'offer_rejected', 'on_hold']


const formatStage = (stage: string) =>
  stage?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

export default function StaleCandidatesBanner({ userId, userRole }: { userId: string; userRole: string }) {
  const router = useRouter()
  const [staleCandidates, setStaleCandidates] = useState<any[]>([])
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (userId && userRole) loadStaleCandidates()
  }, [userId, userRole])

  const loadStaleCandidates = async () => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - STALE_DAYS)

    let recruiterIds: string[] = []

    if (userRole === 'recruiter') {
      // ── Recruiter: only their own candidates ────────────────────────────
      recruiterIds = [userId]

    } else if (userRole === 'team_leader') {
      // ── TL: all recruiters who report directly to this TL ───────────────
      const { data: directReports } = await supabase
        .from('users')
        .select('id')
        .eq('reports_to', userId)
        .eq('role', 'recruiter')
        .eq('is_active', true)

      recruiterIds = directReports?.map(u => u.id) || []

    } else if (userRole === 'sr_team_leader') {
      // ── Sr.TL: recruiters under all TLs who report to this Sr.TL ────────
      const { data: tlList } = await supabase
        .from('users')
        .select('id')
        .eq('reports_to', userId)
        .eq('role', 'team_leader')
        .eq('is_active', true)

      const tlIds = tlList?.map(u => u.id) || []

      if (tlIds.length > 0) {
        const { data: recruitersUnderTLs } = await supabase
          .from('users')
          .select('id')
          .in('reports_to', tlIds)
          .eq('role', 'recruiter')
          .eq('is_active', true)

        recruiterIds = recruitersUnderTLs?.map(u => u.id) || []
      }

      // Also include any recruiters reporting directly to Sr.TL
      const { data: directRecruiters } = await supabase
        .from('users')
        .select('id')
        .eq('reports_to', userId)
        .eq('role', 'recruiter')
        .eq('is_active', true)

      recruiterIds = [...new Set([...recruiterIds, ...(directRecruiters?.map(u => u.id) || [])])]
    }

    if (recruiterIds.length === 0) return

    // ── Fetch stale candidates for all resolved recruiter IDs ──────────────
    const { data } = await supabase
      .from('candidates')
      .select(`
        id, full_name, current_stage, last_activity_date, assigned_to,
        jobs (job_title, clients (company_name)),
        users!candidates_assigned_to_fkey (full_name)
      `)
      .in('assigned_to', recruiterIds)
      .not('current_stage', 'in', `(${TERMINAL_STAGES.map(s => `"${s}"`).join(',')})`)
      .lt('last_activity_date', cutoff.toISOString())
      .order('last_activity_date', { ascending: true })

    if (data && data.length > 0) {
      const now = new Date()
      setStaleCandidates(data.map((c: any) => ({
        ...c,
        days_stale: Math.floor((now.getTime() - new Date(c.last_activity_date).getTime()) / (1000 * 60 * 60 * 24)),
        job_title: c.jobs?.job_title || 'N/A',
        client_name: c.jobs?.clients?.company_name || 'N/A',
        recruiter_name: c.users?.full_name || 'Unknown',
      })))
    }
  }

  if (dismissed || staleCandidates.length === 0) return null

  const critical = staleCandidates.filter(c => c.days_stale >= 14)
  const warning  = staleCandidates.filter(c => c.days_stale >= 7 && c.days_stale < 14)
  const isManager = userRole === 'team_leader' || userRole === 'sr_team_leader'

  const getDaysStyle = (days: number) => {
    if (days >= 14) return { bg: 'bg-red-50', badge: 'bg-red-600 text-white' }
    return { bg: 'bg-amber-50', badge: 'bg-amber-500 text-white' }
  }

  const rolePrefix = userRole === 'sr_team_leader' ? 'sr-tl'
    : userRole === 'team_leader' ? 'tl' : 'recruiter'

  return (
    <div className={`rounded-xl border-2 overflow-hidden mb-6 ${critical.length > 0 ? 'border-red-400 bg-red-50' : 'border-amber-400 bg-amber-50'}`}>

      {/* Banner Header */}
      <div className={`flex items-center justify-between px-5 py-4 ${critical.length > 0 ? 'bg-red-100' : 'bg-amber-100'}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{critical.length > 0 ? '🚨' : '⚠️'}</span>
          <div>
            <h3 className={`font-bold text-base ${critical.length > 0 ? 'text-red-900' : 'text-amber-900'}`}>
              {staleCandidates.length} Candidate{staleCandidates.length > 1 ? 's' : ''} Need{staleCandidates.length === 1 ? 's' : ''} Immediate Update
              {isManager && (
                <span className="ml-2 text-sm font-normal opacity-75">— across your team</span>
              )}
            </h3>
            <p className={`text-sm ${critical.length > 0 ? 'text-red-700' : 'text-amber-700'}`}>
              {critical.length > 0 && `${critical.length} critical (14+ days)`}
              {critical.length > 0 && warning.length > 0 && ' · '}
              {warning.length > 0 && `${warning.length} overdue (7+ days)`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${critical.length > 0 ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-600 text-white hover:bg-amber-700'}`}
          >
            {expanded ? 'Hide' : 'View All'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Expanded candidate list */}
      {expanded && (
        <div className="divide-y divide-gray-100">
          {staleCandidates.map(c => {
            const style = getDaysStyle(c.days_stale)
            return (
              <div
                key={c.id}
                className={`flex items-center justify-between px-5 py-3 hover:bg-white transition cursor-pointer ${style.bg}`}
                onClick={() => router.push(`/${rolePrefix}/candidates/${c.id}`)}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{c.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {c.job_title} · {c.client_name}
                      {isManager && (
                        <span className="ml-1 text-blue-600 font-medium">· {c.recruiter_name}</span>
                      )}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium flex-shrink-0">
                    {formatStage(c.current_stage)}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${style.badge}`}>
                    {c.days_stale} days
                  </span>
                  <span className="text-gray-400 text-sm">→</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Collapsed quick preview */}
      {!expanded && (
        <div className="px-5 py-3 flex gap-2 flex-wrap">
          {staleCandidates.slice(0, 4).map(c => {
            const style = getDaysStyle(c.days_stale)
            return (
              <span
                key={c.id}
                onClick={() => router.push(`/${rolePrefix}/candidates/${c.id}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm cursor-pointer hover:shadow-sm transition"
              >
                <span className="font-medium text-gray-900">{c.full_name}</span>
                {isManager && (
                  <span className="text-xs text-gray-400">{c.recruiter_name}</span>
                )}
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${style.badge}`}>
                  {c.days_stale}d
                </span>
              </span>
            )
          })}
          {staleCandidates.length > 4 && (
            <span className="inline-flex items-center px-3 py-1.5 bg-gray-100 rounded-lg text-sm text-gray-500">
              +{staleCandidates.length - 4} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}
