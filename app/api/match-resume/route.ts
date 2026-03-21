// app/api/match-resume/route.ts
// Server-side job matching endpoint — no paid APIs, pure algorithmic.
// Accepts parsed resume data OR fetches from DB by candidateId/resumeBankId.
// Caches results in ai_screenings table (24h TTL).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { matchResumeToJob } from '@/lib/resumeMatchEngine'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { jobId, candidateId, resumeBankId, parsedData, rawText, screenedBy, jobData } = body

    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

    let job = jobData || null
    if (!job) {
      const { data: fetched, error: jobError } = await supabaseAdmin
        .from('jobs')
        .select('id, job_title, job_description, key_skills, nice_to_have_skills, experience_min, experience_max, min_ctc, max_ctc, education_requirement, location')
        .eq('id', jobId).limit(1).maybeSingle()
      if (jobError || !fetched) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      job = fetched
    }

    if (screenedBy && (candidateId || resumeBankId)) {
      const sf = candidateId ? { candidate_id: candidateId } : { resume_bank_id: resumeBankId }
      const { data: existing } = await supabaseAdmin.from('ai_screenings').select('*').match({ ...sf, job_id: jobId }).maybeSingle()
      if (existing) {
        const ageHours = (Date.now() - new Date(existing.created_at).getTime()) / 3_600_000
        if (ageHours < 24) return NextResponse.json({ result: existing, cached: true })
      }
    }

    let skills: string[] = [], total_experience: number | null = null
    let resumeText = rawText || '', education_level = '', education_degree = ''
    let current_location = '', current_company = ''

    if (parsedData) {
      skills = parsedData.skills || parsedData.key_skills || []
      total_experience = parsedData.total_experience ?? null
      resumeText = parsedData.rawText || rawText || ''
      education_level = parsedData.education_level || ''
      education_degree = parsedData.education_degree || ''
      current_location = parsedData.current_location || ''
      current_company = parsedData.current_company || ''
    } else if (candidateId) {
      const { data: c } = await supabaseAdmin.from('candidates')
        .select('key_skills, total_experience, education_level, education_degree, current_location, current_company, resume_parsed_text')
        .eq('id', candidateId).single()
      if (c) {
        skills = c.key_skills || []; total_experience = c.total_experience
        education_level = c.education_level || ''; education_degree = c.education_degree || ''
        current_location = c.current_location || ''; current_company = c.current_company || ''
        resumeText = c.resume_parsed_text || rawText || ''
      }
    } else if (resumeBankId) {
      const { data: rb } = await supabaseAdmin.from('resume_bank')
        .select('key_skills, total_experience, education_level, education_degree, current_location, current_company')
        .eq('id', resumeBankId).single()
      if (rb) {
        skills = rb.key_skills || []; total_experience = rb.total_experience
        education_level = rb.education_level || ''; education_degree = rb.education_degree || ''
        current_location = rb.current_location || ''; current_company = rb.current_company || ''
      }
    }

    const result = matchResumeToJob({
      resume: { skills, total_experience, rawText: resumeText, education_level, education_degree, current_location, current_company },
      job,
    })

    if (screenedBy && (candidateId || resumeBankId)) {
      const record: Record<string, any> = {
        job_id: jobId, screened_by: screenedBy, match_score: result.match_score,
        matched_skills: result.matched_skills, skill_gaps: result.missing_skills,
        analysis: result.summary, recommendation: result.recommendation,
        score_breakdown: result.breakdown, experience_verdict: result.experience_verdict,
        education_verdict: result.education_verdict, location_verdict: result.location_verdict,
        stability_verdict: result.stability_verdict, industry_verdict: result.industry_verdict,
        partial_skills: result.partial_skills,
      }
      if (candidateId) record.candidate_id = candidateId
      if (resumeBankId) record.resume_bank_id = resumeBankId
      const { data: saved } = await supabaseAdmin.from('ai_screenings')
        .upsert(record, { onConflict: candidateId ? 'candidate_id,job_id' : 'resume_bank_id,job_id' })
        .select().maybeSingle()
      return NextResponse.json({ result: saved ?? result, cached: false })
    }

    return NextResponse.json({ result, cached: false })
  } catch (err: any) {
    console.error('match-resume error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}