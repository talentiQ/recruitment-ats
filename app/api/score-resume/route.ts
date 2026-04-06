// app/api/score-resume/route.ts
// Single-candidate resume scorer used by MatchScorePanel.
// Accepts parsedData + rawText + jobData and returns a MatchResult.

import { NextRequest, NextResponse } from 'next/server'
import { matchResumeToJob } from '@/lib/resumeMatchEngine'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-internal-secret')
    if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await req.json()
    const { jobId, parsedData, rawText, jobData } = body

    if (!jobId || !jobData) {
      return NextResponse.json({message :  'Match Score is Loading..' })
    }

    const result = matchResumeToJob({
      resume: {
        skills:            parsedData?.skills           ?? [],
        total_experience:  parsedData?.total_experience ?? null,
        rawText:           rawText                      ?? '',
        education_degree:  parsedData?.education_degree ?? null,
        current_location:  parsedData?.current_location ?? null,
        current_company:   parsedData?.current_company  ?? null,
      },
      job: {
        job_title:              jobData.job_title             ?? '',
        job_description:        jobData.job_description       ?? null,
        key_skills:             jobData.key_skills            ?? null,
        nice_to_have_skills:    jobData.nice_to_have_skills   ?? null,
        experience_min:         jobData.experience_min        ?? null,
        experience_max:         jobData.experience_max        ?? null,
        education_requirement:  jobData.education_requirement ?? null,
        location:               jobData.location              ?? null,
      },
    })

    return NextResponse.json({ result, cached: false })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[score-resume]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}