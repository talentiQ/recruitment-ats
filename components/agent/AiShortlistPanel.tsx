// components/agent/AiShortlistPanel.tsx
// AI Shortlist panel for job detail page.
// Builds a rich JD text from all available job fields before sending to Groq —
// so even sparse job_description fields produce accurate scoring.
//
// Auth: uses supabase singleton (anon key + session) — same as rest of app.

'use client'

import { useState } from 'react'
import type { MatchResult, ShortlistedCandidate } from '@/lib/agent/candidateMatcher'
import { useAiMatch } from '@/hooks/useAiMatch'

// ─── Build rich JD text from all job fields ───────────────────────────────────
// Combines job_description, key_skills, nice_to_have_skills, education_requirement
// and structured fields into one text block Groq can parse accurately.

export function buildJdText(job: {
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
}): string {
  const parts: string[] = []

  if (job.job_title)             parts.push(`Job Title: ${job.job_title}`)
  if (job.department)            parts.push(`Department: ${job.department}`)
  if (job.location)              parts.push(`Location: ${job.location}`)
  if (job.work_mode)             parts.push(`Work Mode: ${job.work_mode}`)
  if (job.job_type)              parts.push(`Job Type: ${job.job_type}`)

  if (job.experience_min != null && job.experience_max != null) {
    parts.push(`Experience Required: ${job.experience_min}–${job.experience_max} years`)
  }

  if (job.notice_period_pref)    parts.push(`Notice Period Preference: ${job.notice_period_pref}`)
  if (job.education_requirement) parts.push(`Education Requirement: ${job.education_requirement}`)
  if (job.key_skills)            parts.push(`Key Skills Required:\n${job.key_skills}`)
  if (job.nice_to_have_skills)   parts.push(`Nice to Have Skills:\n${job.nice_to_have_skills}`)
  if (job.job_description)       parts.push(`Job Description:\n${job.job_description}`)

  return parts.join('\n\n')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const GRADE_STYLES: Record<string, string> = {
  A: 'bg-green-100  text-green-800  border-green-200',
  B: 'bg-blue-100   text-blue-800   border-blue-200',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  D: 'bg-red-100    text-red-700    border-red-200',
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
      <span className="w-12 text-right tabular-nums text-gray-600">{score}/{max}</span>
    </div>
  )
}

function CandidateCard({
  c, expanded, onToggle,
}: {
  c: ShortlistedCandidate
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
      >
        <span className="text-xs font-mono text-gray-400 w-6 shrink-0">#{c.rank}</span>
        <span className="flex-1 font-medium text-gray-900 text-sm truncate">{c.candidate_name}</span>

        {c.current_company && (
          <span className="text-xs text-gray-400 hidden sm:block truncate max-w-[120px]">
            {c.current_company}
          </span>
        )}

        {c.has_red_flags && (
          <span title={c.red_flag_critical ? 'Critical red flag' : 'Warning flag'}>
            {c.red_flag_critical ? '🔴' : '🟡'}
          </span>
        )}

        <span className={`text-xs font-semibold px-2 py-0.5 rounded border shrink-0 ${GRADE_STYLES[c.grade]}`}>
          {c.grade}
        </span>
        <span className="text-sm font-bold text-gray-800 w-8 text-right shrink-0">{c.total_score}</span>
        <span className="text-gray-400 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50 text-sm">

          {/* Score bars */}
          <div className="space-y-1.5">
            <ScoreBar score={c.dimensions.skills.score}     max={50} label="Skills" />
            <ScoreBar score={c.dimensions.experience.score} max={25} label="Experience" />
            <ScoreBar score={c.dimensions.alignment.score}  max={15} label="Alignment" />
            <ScoreBar score={c.dimensions.education.score}  max={10} label="Education" />
          </div>

          {/* Per-dimension reasoning */}
          <div className="space-y-1 text-xs text-gray-600 border-t border-gray-200 pt-2">
            <p><span className="font-medium text-gray-700">Skills:</span> {c.dimensions.skills.reasoning}</p>
            <p><span className="font-medium text-gray-700">Experience:</span> {c.dimensions.experience.reasoning}</p>
            <p><span className="font-medium text-gray-700">Alignment:</span> {c.dimensions.alignment.reasoning}</p>
            <p><span className="font-medium text-gray-700">Education:</span> {c.dimensions.education.reasoning}</p>
          </div>

          {/* Matched skills */}
          {c.matched_skills.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {c.matched_skills.map(s => (
                <span key={s} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5">
                  ✓ {s}
                </span>
              ))}
            </div>
          )}

          {/* Missing skills */}
          {c.missing_skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.missing_skills.map(s => (
                <span key={s} className="text-xs bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5">
                  ✗ {s}
                </span>
              ))}
            </div>
          )}

          {/* AI summary */}
          <p className="text-xs text-indigo-700 font-medium border-t border-gray-200 pt-2">
            {c.shortlist_reason}
          </p>
          {c.concern && c.concern !== 'None' && (
            <p className="text-xs text-amber-700">⚠ {c.concern}</p>
          )}

          {/* Confidence + stage + resume link */}
          <div className="flex items-center gap-3 text-xs text-gray-400 pt-1">
            <span>Confidence: {c.confidence}</span>
            {c.current_stage && <span>Stage: {c.current_stage}</span>}
            {c.resume_url && (
              <a
                href={c.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-indigo-600 hover:underline"
              >
                View Resume ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  jobId:  string
  job:    {
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

  const handleRun = () => {
    const jdText = buildJdText(job)
    if (!jdText || jdText.length < 30) {
      alert('Please fill in at least the job title, skills, and experience range before running AI match.')
      return
    }
    run(jobId, jdText)
  }

  const toggleExpand = (id: string) =>
    setExpandedId(prev => (prev === id ? null : id))

  return (
    <div className="card space-y-4">
      {/* Panel header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            🤖 AI Shortlist
            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              Groq · Llama 3.1 70B
            </span>
          </h3>
          {result && (
            <p className="text-xs text-gray-500 mt-0.5">
              {result.total_evaluated} evaluated · {result.total_shortlisted} shortlisted ·{' '}
              {new Date(result.run_at).toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit',
              })}
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
          {isLoading ? 'Running…' : result ? '🔄 Re-run AI Match' : '✨ Run AI Match'}
        </button>
      </div>

      {/* Progress message */}
      {isLoading && progress && (
        <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg">
          <span className="animate-spin">⟳</span>
          <span>{progress}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ❌ {error}
        </div>
      )}

      {/* JD summary — what was parsed */}
      {result && (
        <div className="text-xs bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 space-y-1">
          <p className="font-semibold text-indigo-800">{result.jd_requirements.job_title}</p>
          <p className="text-indigo-600">
            {result.jd_requirements.experience_range.min}–{result.jd_requirements.experience_range.max} yrs
            {' · '}{result.jd_requirements.location}
            {' · '}{result.jd_requirements.seniority_level}
          </p>
          {result.jd_requirements.must_have_skills.length > 0 && (
            <p className="text-indigo-600">
              Must-have: {result.jd_requirements.must_have_skills.join(', ')}
            </p>
          )}
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
        <div className="text-center py-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
          No candidates scored above threshold for this JD.
          <br />
          <span className="text-xs">Try lowering the minimum score or adding more candidates.</span>
        </div>
      )}

      {/* Pre-run empty state */}
      {!result && !isLoading && !error && (
        <div className="text-center py-6 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
          Click <span className="font-medium text-indigo-600">Run AI Match</span> to score and rank
          all candidates against this JD.
        </div>
      )}
    </div>
  )
}