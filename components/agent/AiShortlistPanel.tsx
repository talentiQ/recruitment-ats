// components/agent/AiShortlistPanel.tsx  v3
// Dual-source shortlist panel. Shows candidates + resume_bank in one ranked list.
// Each card shows: score, grade, badges, client history, matched/missing skills.
// resume_bank cards have a "Convert" button that opens ConvertDrawer.

'use client'

import { useState } from 'react'
import type { DualMatchResult, DualSourceCandidate, BadgeType, ClientHistory } from '@/lib/agent/dualSourceMatcher'
import { useAiMatch } from '@/hooks/useAiMatch'
import { ConvertDrawer } from './ConvertDrawer'
import { buildJdText } from './AiShortlistPanel.helpers'

export { buildJdText }

// ─── Badge config ─────────────────────────────────────────────────────────────

const BADGE_CONFIG: Record<BadgeType, { label: string; className: string }> = {
  resume_bank:      { label: 'Resume Bank',    className: 'bg-purple-50 text-purple-700 border-purple-200' },
  active_candidate: { label: 'In Pipeline',    className: 'bg-blue-50   text-blue-700   border-blue-200'   },
  same_client:      { label: 'Same Client ⚠',  className: 'bg-amber-50  text-amber-700  border-amber-200'  },
  already_placed:   { label: 'Placed Here 🔴', className: 'bg-red-50    text-red-700    border-red-200'    },
  never_processed:  { label: 'Fresh ✓',        className: 'bg-green-50  text-green-700  border-green-200'  },
}

const GRADE_STYLES: Record<string, string> = {
  A: 'bg-green-100  text-green-800  border-green-200',
  B: 'bg-blue-100   text-blue-800   border-blue-200',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  D: 'bg-red-100    text-red-700    border-red-200',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ score, max, label }: { score: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round(((score ?? 0) / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right tabular-nums text-gray-600">{score ?? 0}/{max}</span>
    </div>
  )
}

function HistoryEntry({ h }: { h: ClientHistory }) {
  const outcomeColor = {
    placed:      'text-green-700',
    selected:    'text-blue-700',
    rejected:    'text-red-600',
    in_progress: 'text-amber-700',
  }[h.outcome] ?? 'text-gray-600'

  return (
    <div className="flex items-start gap-2 text-xs py-1 border-b border-gray-100 last:border-0">
      <span className={`shrink-0 font-medium ${outcomeColor}`}>
        {h.outcome === 'placed'      && '✓ Placed'}
        {h.outcome === 'selected'    && '↑ Selected'}
        {h.outcome === 'rejected'    && '✗ Rejected'}
        {h.outcome === 'in_progress' && '⟳ Active'}
      </span>
      <span className="text-gray-500">
        {h.clientName} · {h.jobTitle}
        {h.monthsAgo < 999 && ` · ${h.monthsAgo}mo ago`}
        {h.recruiterName && ` · via ${h.recruiterName}`}
      </span>
    </div>
  )
}

function CandidateCard({
  c, jobId, expanded, onToggle, onConverted,
}: {
  c: DualSourceCandidate
  jobId: string
  expanded: boolean
  onToggle: () => void
  onConverted: () => void
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ── Null-safe defaults for all fields the AI can omit ──────────────────────
  const badges          = c.badges          ?? []
  const matched_skills  = c.matched_skills  ?? []
  const missing_skills  = c.missing_skills  ?? []
  const clientHistory   = c.clientHistory   ?? []
  const grade           = c.grade           ?? 'D'
  const total_score     = c.total_score     ?? 0
  const shortlist_reason = c.shortlist_reason ?? ''
  const concern         = c.concern         ?? ''
  const candidate_name  = c.candidate_name  ?? 'Unknown'
  const sameClientWarning = c.sameClientWarning ?? ''

  // Null-safe dimensions — each sub-object may be missing
  const dimensions = {
    skills:     { score: c.dimensions?.skills?.score     ?? 0, reasoning: c.dimensions?.skills?.reasoning     ?? '' },
    experience: { score: c.dimensions?.experience?.score ?? 0, reasoning: c.dimensions?.experience?.reasoning ?? '' },
    alignment:  { score: c.dimensions?.alignment?.score  ?? 0, reasoning: c.dimensions?.alignment?.reasoning  ?? '' },
    education:  { score: c.dimensions?.education?.score  ?? 0, reasoning: c.dimensions?.education?.reasoning  ?? '' },
  }

  const isResumeBank = c.source === 'resume_bank'

  const freshnessLabel = c.uploaded_at
    ? (() => {
        const mo = Math.floor((Date.now() - new Date(c.uploaded_at).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
        return mo === 0 ? 'This month' : `${mo}mo old CV`
      })()
    : null

  return (
    <>
      <div className={`border rounded-lg overflow-hidden bg-white ${
        badges.includes('already_placed') ? 'border-red-200' :
        badges.includes('same_client')    ? 'border-amber-200' :
        'border-gray-200'
      }`}>

        {/* Header row */}
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 text-left"
        >
          <span className="text-xs font-mono text-gray-400 w-5 shrink-0">#{c.rank ?? '—'}</span>

          <span className="flex-1 font-medium text-gray-900 text-sm truncate">
            {candidate_name}
          </span>

          {/* Source badge */}
          <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${BADGE_CONFIG[isResumeBank ? 'resume_bank' : 'active_candidate'].className}`}>
            {BADGE_CONFIG[isResumeBank ? 'resume_bank' : 'active_candidate'].label}
          </span>

          {/* Warning badges */}
          {badges.includes('already_placed') && (
            <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${BADGE_CONFIG.already_placed.className}`}>
              {BADGE_CONFIG.already_placed.label}
            </span>
          )}
          {badges.includes('same_client') && !badges.includes('already_placed') && (
            <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${BADGE_CONFIG.same_client.className}`}>
              {BADGE_CONFIG.same_client.label}
            </span>
          )}
          {badges.includes('never_processed') && (
            <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${BADGE_CONFIG.never_processed.className}`}>
              {BADGE_CONFIG.never_processed.label}
            </span>
          )}

          {/* Red flag */}
          {c.has_red_flags && (
            <span>{c.red_flag_critical ? '🔴' : '🟡'}</span>
          )}

          {/* Grade */}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border shrink-0 ${GRADE_STYLES[grade] ?? GRADE_STYLES['D']}`}>
            {grade}
          </span>

          {/* Score */}
          <span className="text-sm font-bold text-gray-800 w-7 text-right shrink-0">{total_score}</span>
          <span className="text-gray-400 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50 text-sm">

            {/* Company + meta row */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              {c.current_company    && <span>🏢 {c.current_company}</span>}
              {c.current_designation && <span>💼 {c.current_designation}</span>}
              {freshnessLabel       && <span className="text-amber-600">📄 {freshnessLabel}</span>}
              {c.sourced_by         && <span>👤 Sourced by {c.sourced_by}</span>}
            </div>

            {/* Same-client warning */}
            {sameClientWarning && (
              <div className={`text-xs px-3 py-2 rounded-lg border ${
                badges.includes('already_placed')
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                ⚠ {sameClientWarning}
              </div>
            )}

            {/* Score bars */}
            <div className="space-y-1.5">
              <ScoreBar score={dimensions.skills.score}     max={50} label="Skills" />
              <ScoreBar score={dimensions.experience.score} max={25} label="Experience" />
              <ScoreBar score={dimensions.alignment.score}  max={15} label="Alignment" />
              <ScoreBar score={dimensions.education.score}  max={10} label="Education" />
            </div>

            {/* Reasoning */}
            <div className="space-y-1 text-xs text-gray-600 border-t border-gray-200 pt-2">
              {dimensions.skills.reasoning     && <p><span className="font-medium">Skills:</span> {dimensions.skills.reasoning}</p>}
              {dimensions.experience.reasoning && <p><span className="font-medium">Experience:</span> {dimensions.experience.reasoning}</p>}
              {dimensions.alignment.reasoning  && <p><span className="font-medium">Alignment:</span> {dimensions.alignment.reasoning}</p>}
              {dimensions.education.reasoning  && <p><span className="font-medium">Education:</span> {dimensions.education.reasoning}</p>}
            </div>

            {/* Matched skills */}
            {matched_skills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {matched_skills.map(s => (
                  <span key={s} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5">✓ {s}</span>
                ))}
              </div>
            )}

            {/* Missing skills */}
            {missing_skills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {missing_skills.map(s => (
                  <span key={s} className="text-xs bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5">✗ {s}</span>
                ))}
              </div>
            )}

            {/* AI summary */}
            {shortlist_reason && (
              <p className="text-xs text-indigo-700 font-medium border-t border-gray-200 pt-2">
                {shortlist_reason}
              </p>
            )}
            {concern && concern !== 'None' && (
              <p className="text-xs text-amber-700">⚠ {concern}</p>
            )}

            {/* Client history */}
            {clientHistory.length > 0 && (
              <div className="border-t border-gray-200 pt-2">
                <p className="text-xs font-medium text-gray-600 mb-1">Submission history</p>
                {clientHistory.map((h, i) => <HistoryEntry key={i} h={h} />)}
              </div>
            )}

            {/* Footer actions */}
            <div className="flex items-center gap-3 pt-1 border-t border-gray-200">
              {c.resume_url && (
                <a href={c.resume_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">
                  View CV ↗
                </a>
              )}
              {c.current_stage && (
                <span className="text-xs text-gray-400">Stage: {c.current_stage}</span>
              )}

              {/* Convert button — only for resume_bank entries */}
              {isResumeBank && (
                <button
                  onClick={e => { e.stopPropagation(); setDrawerOpen(true) }}
                  className="ml-auto text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition"
                >
                  + Convert to Candidate
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Convert drawer */}
      {isResumeBank && (
        <ConvertDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          jobId={jobId}
          resumeBankId={c.sourceId}
          resumeUrl={c.resume_url}
          prefill={{
            full_name:           candidate_name,
            phone:               c.phone,
            email:               c.email,
            current_company:     c.current_company,
            current_designation: c.current_designation,
          }}
          onConverted={id => { setDrawerOpen(false); onConverted() }}
        />
      )}
    </>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  jobId: string
  job: {
    job_title?:              string | null
    job_description?:        string | null
    key_skills?:             string | null
    nice_to_have_skills?:    string | null
    education_requirement?:  string | null
    experience_min?:         number | null
    experience_max?:         number | null
    location?:               string | null
    work_mode?:              string | null
    notice_period_pref?:     string | null
    department?:             string | null
    job_type?:               string | null
  }
}

export function AiShortlistPanel({ jobId, job }: Props) {
  const { run, result, isLoading, error, progress } = useAiMatch()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [runKey, setRunKey]         = useState(0)

  const handleRun = () => {
    const jdText = buildJdText(job)
    if (!jdText || jdText.length < 30) {
      alert('Please fill in at least job title, skills, and experience range before running AI match.')
      return
    }
    run(jobId, jdText)
  }

  const typedResult = result as DualMatchResult | null

  // Null-safe shortlist — filter out any completely broken entries
  const shortlist = (typedResult?.shortlist ?? []).filter(c => c && c.sourceId)

  return (
    <div className="card space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            🤖 AI Shortlist
            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              Groq · Llama 3.1 70B
            </span>
          </h3>
          {typedResult && (
            <p className="text-xs text-gray-500 mt-0.5">
              {typedResult.total_evaluated ?? 0} evaluated
              ({typedResult.candidates_count ?? 0} candidates + {typedResult.resume_bank_count ?? 0} resume bank)
              · {typedResult.total_shortlisted ?? 0} shortlisted
              · {new Date(typedResult.run_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={isLoading}
          className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg
                     hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors flex items-center gap-2"
        >
          {isLoading && <span className="animate-spin text-base">⟳</span>}
          {isLoading ? 'Running…' : typedResult ? '🔄 Re-run' : '✨ Run AI Match'}
        </button>
      </div>

      {/* Progress */}
      {isLoading && progress && (
        <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg">
          <span className="animate-spin">⟳</span> {progress}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ❌ {error}
        </div>
      )}

      {/* JD summary */}
      {typedResult?.jd_requirements && (
        <div className="text-xs bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 space-y-1">
          <p className="font-semibold text-indigo-800">{typedResult.jd_requirements.job_title}</p>
          <p className="text-indigo-600">
            {typedResult.jd_requirements.experience_range?.min ?? 0}–{typedResult.jd_requirements.experience_range?.max ?? 0} yrs
            {typedResult.jd_requirements.location && ` · ${typedResult.jd_requirements.location}`}
            {typedResult.jd_requirements.seniority_level && ` · ${typedResult.jd_requirements.seniority_level}`}
          </p>
          {(typedResult.jd_requirements.must_have_skills?.length ?? 0) > 0 && (
            <p className="text-indigo-600">
              Must-have: {typedResult.jd_requirements.must_have_skills.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Results */}
      {shortlist.length > 0 && (
        <div className="space-y-2" key={runKey}>
          {shortlist.map(c => (
            <CandidateCard
              key={`${c.source}-${c.sourceId}`}
              c={c}
              jobId={jobId}
              expanded={expandedId === `${c.source}-${c.sourceId}`}
              onToggle={() => setExpandedId(prev =>
                prev === `${c.source}-${c.sourceId}` ? null : `${c.source}-${c.sourceId}`
              )}
              onConverted={() => setRunKey(k => k + 1)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {typedResult && shortlist.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
          No candidates scored above threshold.
          <br /><span className="text-xs">Check that the job has skills and experience range filled in.</span>
        </div>
      )}

      {/* Pre-run state */}
      {!typedResult && !isLoading && !error && (
        <div className="text-center py-6 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
          Click <span className="font-medium text-indigo-600">Run AI Match</span> to score candidates
          and resume bank together.
        </div>
      )}
    </div>
  )
}