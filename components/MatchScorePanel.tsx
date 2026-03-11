// components/MatchScorePanel.tsx
// Drop-in panel for both Add Candidate form and Resume Bank page.
//
// Mode A — Preview (Add Candidate, before save):
//   Pass parsedData + rawText + jobId. No candidateId/resumeBankId.
//   Runs match, shows score, does NOT save to DB.
//
// Mode B — Persistent (Candidate Profile / Resume Bank):
//   Pass candidateId/resumeBankId + jobId + screenedBy.
//   Saves to ai_screenings, caches 24h, shows Re-screen button.

'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface MatchBreakdown {
  skills_score:      number
  experience_score:  number
  jd_keyword_score:  number
  ctc_score:         number
}

interface MatchResult {
  match_score:        number
  recommendation:     'shortlist' | 'maybe' | 'reject'
  breakdown:          MatchBreakdown
  matched_skills:     string[]
  missing_skills:     string[]
  partial_skills:     string[]
  experience_verdict: string
  ctc_verdict:        string
  summary:            string
  created_at?:        string
}

interface Props {
  jobId:          string | null
  jobTitle?:      string
  // Mode A — preview (Add Candidate form, before save)
  parsedData?:    { skills: string[]; total_experience?: number | null; expected_ctc?: number | null } | null
  rawText?:       string
  // Mode B — persistent (profile / resume bank)
  candidateId?:   string
  resumeBankId?:  string
  screenedBy?:    string
  // Shared
  autoRun?:       boolean   // auto-run on mount (default false)
}

export default function MatchScorePanel({
  jobId, jobTitle,
  parsedData, rawText,
  candidateId, resumeBankId, screenedBy,
  autoRun = false,
}: Props) {

  const [result,   setResult]   = useState<MatchResult | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [checking, setChecking] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [cached,   setCached]   = useState(false)
  const [jobData,  setJobData]  = useState<any>(null)

  // Fetch full job details client-side (avoids RLS issues in the API route)
  useEffect(() => {
    if (!jobId) return
    supabase
      .from('jobs')
      .select('id, job_title, job_description, key_skills, experience_min, experience_max, min_ctc, max_ctc')
      .eq('id', jobId)
      .single()
      .then(({ data }) => { if (data) setJobData(data) })
  }, [jobId])

  // Auto-load cached result if in persistent mode
  useEffect(() => {
    if (!jobId) return
    if (candidateId || resumeBankId) {
      loadCached()
    } else if (autoRun && parsedData) {
      runMatch()
    }
  }, [jobId, candidateId, resumeBankId])

  // Re-run when parsed data changes (form auto-fill)
  useEffect(() => {
    if (autoRun && parsedData && jobId && !candidateId && !resumeBankId) {
      runMatch()
    }
  }, [parsedData?.skills?.length, jobId])

  const loadCached = async () => {
    setChecking(true)
    try {
      const res = await fetch('/api/match-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, candidateId, resumeBankId, screenedBy: null, jobData }),
      })
      if (res.ok) {
        const json = await res.json()
        if (json.result?.match_score !== undefined) {
          setResult(json.result)
          setCached(json.cached)
        }
      }
    } catch {
      // No cached result — that's fine
    } finally {
      setChecking(false)
    }
  }

  const runMatch = async () => {
    if (!jobId) return
    setLoading(true)
    setError(null)

    try {
      const payload: Record<string, any> = { jobId }

      if (candidateId)  payload.candidateId  = candidateId
      if (resumeBankId) payload.resumeBankId  = resumeBankId
      if (screenedBy)   payload.screenedBy    = screenedBy
      if (parsedData)   payload.parsedData    = parsedData
      if (rawText)      payload.rawText       = rawText
      if (jobData)      payload.jobData       = jobData  // avoids RLS-blocked DB fetch in API route

      const res  = await fetch('/api/match-resume', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })

      const json = await res.json()

      if (!res.ok || json.error) throw new Error(json.error || 'Match failed')

      setResult(json.result)
      setCached(json.cached)
    } catch (err: any) {
      setError(err.message || 'Matching failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  const scoreColor = (s: number) =>
    s >= 70 ? 'text-green-600' : s >= 45 ? 'text-yellow-600' : 'text-red-600'

  const scoreBg = (s: number) =>
    s >= 70 ? 'bg-green-50 border-green-200' : s >= 45 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'

  const scoreBarColor = (s: number) =>
    s >= 70 ? 'bg-green-500' : s >= 45 ? 'bg-amber-400' : 'bg-red-500'

  const recConfig = {
    shortlist: { label: 'Shortlist',  bg: 'bg-green-100 text-green-800',  icon: '✅' },
    maybe:     { label: 'Maybe',      bg: 'bg-amber-100 text-amber-800',   icon: '🤔' },
    reject:    { label: 'Not a Fit',  bg: 'bg-red-100 text-red-800',       icon: '❌' },
  }

  const breakdownItems = result ? [
    { label: 'Skills Match',    score: result.breakdown.skills_score,     max: 45, icon: '🎯' },
    { label: 'Experience',      score: result.breakdown.experience_score,  max: 25, icon: '📅' },
    { label: 'JD Relevance',    score: result.breakdown.jd_keyword_score,  max: 20, icon: '📋' },
    { label: 'CTC Fit',         score: result.breakdown.ctc_score,         max: 10, icon: '💰' },
  ] : []

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!jobId) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-sm text-gray-500">
        💼 Select a job to enable match scoring
      </div>
    )
  }

  const isPersistentMode = !!(candidateId || resumeBankId)
  const canRun = !!(parsedData?.skills?.length || candidateId || resumeBankId)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <span className="text-xl">🔬</span>
          <div>
            <div className="font-semibold text-sm">Resume Match Score</div>
            {jobTitle && <div className="text-xs text-violet-200">vs {jobTitle}</div>}
          </div>
        </div>

        <button
          onClick={runMatch}
          disabled={loading || checking || !canRun}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition
            ${loading || checking || !canRun
              ? 'bg-white/20 text-white/50 cursor-not-allowed'
              : result
                ? 'bg-white/20 text-white hover:bg-white/30 border border-white/30'
                : 'bg-white text-violet-700 hover:bg-violet-50'
            }`}
        >
          {loading   ? '⏳ Scoring…'
           : checking ? '…'
           : result   ? '🔄 Re-score'
           : '▶ Score Match'}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="p-5 space-y-4">

        {/* Loading */}
        {(loading || checking) && (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-600"></div>
            <p className="text-sm text-gray-500">
              {checking ? 'Loading saved score…' : 'Analysing resume against job requirements…'}
            </p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
            <span>⚠️</span><span>{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !checking && !result && !error && (
          <div className="text-center py-6">
            <div className="text-4xl mb-2">📊</div>
            <p className="text-sm text-gray-600 font-medium">Scientific Resume Scoring</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
              Scores skills match, experience fit, job description relevance, and CTC compatibility — 100 pts total.
            </p>
            {!canRun && (
              <p className="text-xs text-amber-600 mt-2">
                {parsedData ? 'No skills found in parsed resume yet' : 'Upload a resume first to enable scoring'}
              </p>
            )}
          </div>
        )}

        {/* Result */}
        {result && !loading && !checking && (
          <>
            {/* Cache notice */}
            {cached && result.created_at && (
              <div className="text-xs text-gray-400 flex items-center gap-1">
                <span>💾</span>
                <span>
                  Saved score from {new Date(result.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                  {isPersistentMode && ' · Click Re-score to refresh'}
                </span>
              </div>
            )}
            {!isPersistentMode && (
              <div className="text-xs text-amber-600 flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-lg">
                <span>⚡</span>
                <span>Preview only — score saved automatically when you submit the form</span>
              </div>
            )}

            {/* Score + Recommendation */}
            <div className={`rounded-xl border-2 p-5 flex items-center justify-between gap-4 ${scoreBg(result.match_score)}`}>
              <div className="flex items-center gap-4">

                {/* Score ring */}
                <div className="relative w-20 h-20 flex-shrink-0">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" fill="none" stroke="#e5e7eb" strokeWidth="9" />
                    <circle
                      cx="40" cy="40" r="32" fill="none"
                      stroke={result.match_score >= 70 ? '#16a34a' : result.match_score >= 45 ? '#d97706' : '#dc2626'}
                      strokeWidth="9"
                      strokeDasharray={`${(result.match_score / 100) * 201} 201`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-xl font-bold ${scoreColor(result.match_score)}`}>
                      {result.match_score}
                    </span>
                    <span className="text-xs text-gray-400">/ 100</span>
                  </div>
                </div>

                <div>
                  <div className={`text-2xl font-bold ${scoreColor(result.match_score)}`}>
                    {result.match_score}% Match
                  </div>
                  <div className="w-48 h-2 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${scoreBarColor(result.match_score)}`}
                      style={{ width: `${result.match_score}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className={`px-4 py-2 rounded-xl text-sm font-bold ${recConfig[result.recommendation].bg}`}>
                {recConfig[result.recommendation].icon} {recConfig[result.recommendation].label}
              </div>
            </div>

            {/* Score Breakdown */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Score Breakdown</div>
              <div className="space-y-2.5">
                {breakdownItems.map(({ label, score, max, icon }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-sm w-4">{icon}</span>
                    <div className="text-sm text-gray-600 w-28 flex-shrink-0">{label}</div>
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${scoreBarColor((score / max) * 100)}`}
                        style={{ width: `${(score / max) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 w-12 text-right flex-shrink-0">
                      <span className="font-semibold text-gray-700">{score}</span>/{max}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Analysis */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <div className="text-xs font-semibold text-indigo-500 uppercase mb-2 flex items-center gap-1">
                <span>🧠</span> Analysis
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>
              {result.experience_verdict && (
                <p className="text-xs text-gray-500 mt-1.5">📅 {result.experience_verdict}</p>
              )}
              {result.ctc_verdict && result.ctc_verdict !== 'Expected CTC not specified' && (
                <p className="text-xs text-gray-500 mt-1">💰 {result.ctc_verdict}</p>
              )}
            </div>

            {/* Skills Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Matched */}
              <div>
                <div className="text-xs font-semibold text-green-700 uppercase mb-2 flex items-center gap-1">
                  <span>✅</span>
                  Matched Skills
                  <span className="text-green-500 font-normal">({result.matched_skills.length})</span>
                </div>
                {result.matched_skills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {result.matched_skills.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">None matched directly</p>
                )}

                {/* Partial matches */}
                {result.partial_skills.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-semibold text-amber-600 mb-1 flex items-center gap-1">
                      <span>〜</span> Partial / Alias
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.partial_skills.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium border border-amber-200">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Gaps */}
              <div>
                <div className="text-xs font-semibold text-red-700 uppercase mb-2 flex items-center gap-1">
                  <span>⚠️</span>
                  Skill Gaps
                  <span className="text-red-500 font-normal">({result.missing_skills.length})</span>
                </div>
                {result.missing_skills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {result.missing_skills.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-green-600 italic font-medium">🎉 No skill gaps found!</p>
                )}
              </div>
            </div>

          </>
        )}
      </div>
    </div>
  )
}
