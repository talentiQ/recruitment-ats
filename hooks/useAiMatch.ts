// hooks/useAiMatch.ts
// React hook for triggering AI match from any UI component.
// Sends x-internal-secret header so the API route can verify the request
// comes from the same Talent IQ app (not an external caller).

import { useState, useCallback } from 'react'
import type { MatchResult } from '@/lib/resumeMatchEngine'

interface UseAiMatchState {
  result:    MatchResult | null
  isLoading: boolean
  error:     string | null
  progress:  string | null
}

interface UseAiMatchReturn extends UseAiMatchState {
  run:   (jobId: string, jdText: string, options?: { minScore?: number; maxResults?: number }) => Promise<void>
  reset: () => void
}

export function useAiMatch(): UseAiMatchReturn {
  const [state, setState] = useState<UseAiMatchState>({
    result: null, isLoading: false, error: null, progress: null,
  })

  const run = useCallback(async (
    jobId:   string,
    jdText:  string,
    options: { minScore?: number; maxResults?: number } = {}
  ) => {
    setState({ result: null, isLoading: true, error: null, progress: 'Analysing job description…' })

    try {
      await new Promise(r => setTimeout(r, 150))
      setState(s => ({ ...s, progress: 'Scoring candidates against JD…' }))

      const res = await fetch('/api/match-resume', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          // Secret header — verified by the route handler
          // NEXT_PUBLIC_ prefix makes it available in the browser
          'x-internal-secret': process.env.NEXT_PUBLIC_INTERNAL_API_SECRET ?? '',
        },
        body: JSON.stringify({
          job_id:      jobId,
          jd_text:     jdText,
          min_score:   options.minScore,
          max_results: options.maxResults,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }

      setState({ result: data.result, isLoading: false, error: null, progress: null })

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