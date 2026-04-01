// components/agent/AiShortlistPanel.tsx
// Displays the ranked shortlist returned by the AI match agent.
// Plugs into the job detail page alongside existing candidate list.
//
// Shows:
//   - Run summary (X evaluated, Y shortlisted, model used, timestamp)
//   - Each candidate: rank, name, total score, grade badge, dimension breakdown,
//     matched/missing skills, red flag indicator, shortlist reason

'use client'

import { useState } from 'react'
import type { MatchResult, ShortlistedCandidate } from '@/lib/agent/candidateMatcher'
import { useAiMatch } from '@/hooks/useAiMatch'

interface Props {
  jobId:  string
  jdText: string   // pre-filled from job.description or let recruiter paste
}

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-green-100  text-green-800  border-green-200',
  B: 'bg-blue-100   text-blue-800   border-blue-200',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  D: 'bg-red-100    text-red-800    border-red-200',
}

function ScoreBar({ score, max, label }: { score: number; max: number; label: string }) {
  const pct = Math.round((score / max) * 100)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full bg-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-right text-gray-600">{score}/{max}</span>
    </div>
  )
}

function CandidateCard({ c, expanded, onToggle }: {
  c: ShortlistedCandidate
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
      >
        {/* Rank */}
        <span className="text-xs font-mono text-gray-400 w-6">#{c.rank}</span>

        {/* Name */}
        <span className="flex-1 font-medium text-gray-900 text-sm">{c.candidate_name}</span>

        {/* Red flag */}
        {c.has_red_flags && (
          <span title={c.red_flag_critical ? 'Critical red flag' : 'Warning'}>
            {c.red_flag_critical ? '🔴' : '🟡'}
          </span>
        )}

        {/* Grade badge */}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${GRADE_COLORS[c.grade]}`}>
          {c.grade}
        </span>

        {/* Score */}
        <span className="text-sm font-bold text-gray-800 w-12 text-right">{c.total_score}</span>

        {/* Expand chevron */}
        <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">

          {/* Score bars */}
          <div className="space-y-1.5">
            <ScoreBar score={c.dimensions.skills.score}     max={50} label="Skills" />
            <ScoreBar score={c.dimensions.experience.score} max={25} label="Experience" />
            <ScoreBar score={c.dimensions.alignment.score}  max={15} label="Alignment" />
            <ScoreBar score={c.dimensions.education.score}  max={10} label="Education" />
          </div>

          {/* Reasoning */}
          <div className="space-y-1 text-xs text-gray-600">
            <p><span className="font-medium">Skills:</span> {c.dimensions.skills.reasoning}</p>
            <p><span className="font-medium">Experience:</span> {c.dimensions.experience.reasoning}</p>
            <p><span className="font-medium">Alignment:</span> {c.dimensions.alignment.reasoning}</p>
            <p><span className="font-medium">Education:</span> {c.dimensions.education.reasoning}</p>
          </div>

          {/* Matched / missing skills */}
          {c.matched_skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.matched_skills.map(s => (
                <span key={s} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5">
                  ✓ {s}
                </span>
              ))}
            </div>
          )}
          {c.missing_skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.missing_skills.map(s => (
                <span key={s} className="text-xs bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5">
                  ✗ {s}
                </span>
              ))}
            </div>
          )}

          {/* Summary + concern */}
          <p className="text-xs text-indigo-700 font-medium">{c.shortlist_reason}</p>
          {c.concern && c.concern !== 'None' && (
            <p className="text-xs text-amber-700">⚠ {c.concern}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {c.resume_url && (
              <a
                href={c.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:underline"
              >
                View Resume ↗
              </a>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              Stage: {c.current_stage ?? '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export function AiShortlistPanel({ jobId, jdText }: Props) {
  const { run, result, isLoading, error, progress } = useAiMatch()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleRun = () => run(jobId, jdText)
  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id)

  return (
    <div className="space-y-4">
      {/* Header + Run button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">AI Shortlist</h3>
          {result && (
            <p className="text-xs text-gray-500 mt-0.5">
              {result.total_evaluated} evaluated · {result.total_shortlisted} shortlisted ·{' '}
              {new Date(result.run_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={isLoading}
          className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-md
                     hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? '...' : result ? 'Re-run AI Match' : 'Run AI Match'}
        </button>
      </div>

      {/* Progress */}
      {isLoading && progress && (
        <div className="flex items-center gap-2 text-xs text-indigo-600 py-2">
          <span className="animate-spin">⟳</span>
          <span>{progress}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* JD requirements summary */}
      {result && (
        <div className="text-xs bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 space-y-1">
          <p className="font-medium text-indigo-800">{result.jd_requirements.job_title}</p>
          <p className="text-indigo-600">
            {result.jd_requirements.experience_range.min}–{result.jd_requirements.experience_range.max} yrs ·{' '}
            {result.jd_requirements.location} · {result.jd_requirements.seniority_level}
          </p>
          <p className="text-indigo-600">
            Must-have: {result.jd_requirements.must_have_skills.join(', ')}
          </p>
        </div>
      )}

      {/* Shortlist */}
      {result && result.shortlist.length > 0 && (
        <div className="space-y-2">
          {result.shortlist.map(c => (
            <CandidateCard
              key={c.candidate_id}
              c={c}
              expanded={expandedId === c.candidate_id}
              onToggle={() => toggleExpand(c.candidate_id)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {result && result.shortlist.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-400">
          No candidates scored above threshold for this JD.
        </div>
      )}
    </div>
  )
}