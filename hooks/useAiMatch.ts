// hooks/useAiMatch.ts
// React hook for triggering the AI match pipeline from any UI component.
//
// Usage in job detail page:
//   const { run, result, isLoading, error } = useAiMatch()
//   <button onClick={() => run(jobId, jdText)}>Run AI Match</button>
//   {result && <ShortlistPanel result={result} />}

import { useState, useCallback } from 'react'
import type { MatchResult } from '@/lib/agent/candidateMatcher'

interface UseAiMatchState {
  result:    MatchResult | null
  isLoading: boolean
  error:     string | null
  progress:  string | null   // status message shown during long runs
}

interface UseAiMatchReturn extends UseAiMatchState {
  run:   (jobId: string, jdText: string, options?: { minScore?: number; maxResults?: number }) => Promise<void>
  reset: () => void
}

export function useAiMatch(): UseAiMatchReturn {
  const [state, setState] = useState<UseAiMatchState>({
    result:    null,
    isLoading: false,
    error:     null,
    progress:  null,
  })

  const run = useCallback(async (
    jobId:   string,
    jdText:  string,
    options: { minScore?: number; maxResults?: number } = {}
  ) => {
    setState({ result: null, isLoading: true, error: null, progress: 'Analysing job description...' })

    try {
      // Brief delay to let progress message render
      await new Promise(r => setTimeout(r, 200))
      setState(s => ({ ...s, progress: 'Scoring candidates against JD...' }))

      const res = await fetch('/api/agent/match-candidates', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id:      jobId,
          jd_text:     jdText,
          min_score:   options.minScore,
          max_results: options.maxResults,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? `Request failed with status ${res.status}`)
      }

      setState({
        result:    data.result,
        isLoading: false,
        error:     null,
        progress:  null,
      })

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'AI match failed'
      setState({ result: null, isLoading: false, error: message, progress: null })
    }
  }, [])

  const reset = useCallback(() => {
    setState({ result: null, isLoading: false, error: null, progress: null })
  }, [])

  return { ...state, run, reset }
}