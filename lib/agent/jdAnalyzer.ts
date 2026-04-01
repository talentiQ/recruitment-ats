// lib/agent/jdAnalyzer.ts
// Agent 1 — JD Analyzer
//
// Input:  raw job description text (pasted or typed by recruiter)
// Output: structured JdRequirements object used by Agent 2 (Candidate Matcher)
//
// Design decisions:
//   - Low temperature (0.1) for consistent structured output
//   - Explicit JSON schema in the prompt — Llama 3.1 70B follows it reliably
//   - must_have vs nice_to_have split — mirrors how recruiters actually think
//   - experience_range stored as { min, max } not a string — easier to compare
//   - location_flexibility enum: onsite | hybrid | remote | any

import { groqChat } from '../groqClient'

export interface JdRequirements {
  job_title:            string
  must_have_skills:     string[]   // non-negotiable technical skills
  nice_to_have_skills:  string[]   // preferred but not blocking
  experience_range:     { min: number; max: number }  // years
  education:            string     // e.g. "B.Tech/B.E.", "CA/CMA", "Any Graduate"
  location:             string     // e.g. "Noida", "Delhi NCR", "Bangalore"
  location_flexibility: 'onsite' | 'hybrid' | 'remote' | 'any'
  industry_preference:  string[]   // e.g. ["Manufacturing", "Automobile", "FMCG"]
  key_responsibilities: string[]   // top 3–5 summarised responsibilities
  seniority_level:      'junior' | 'mid' | 'senior' | 'lead' | 'manager'
  raw_summary:          string     // 2-sentence plain English summary
}

const SYSTEM_PROMPT = `You are an expert recruitment analyst specialising in Indian job markets.
Your job is to parse job descriptions and extract structured hiring requirements.
You always respond with valid JSON only — no preamble, no explanation, no markdown.`

function buildUserPrompt(jdText: string): string {
  return `Parse this job description and return a JSON object matching EXACTLY this schema:

{
  "job_title": "string — exact or inferred title",
  "must_have_skills": ["array of non-negotiable skills — max 8"],
  "nice_to_have_skills": ["array of preferred skills — max 6"],
  "experience_range": { "min": number, "max": number },
  "education": "string — minimum qualification e.g. B.Tech, CA, MBA, Any Graduate",
  "location": "string — city or region e.g. Noida, Delhi NCR, Bangalore",
  "location_flexibility": "onsite | hybrid | remote | any",
  "industry_preference": ["array of relevant industries — e.g. Manufacturing, IT, BFSI"],
  "key_responsibilities": ["array of 3-5 core responsibilities, each under 10 words"],
  "seniority_level": "junior | mid | senior | lead | manager",
  "raw_summary": "2 sentences summarising the role and ideal candidate"
}

Rules:
- must_have_skills: only include skills explicitly required or strongly implied as essential
- nice_to_have_skills: skills mentioned as preferred, good to have, or added advantage
- experience_range.min and max must be integers (years). If JD says "5+ years" use min:5 max:10. If "3-7 years" use min:3 max:7.
- For Indian professional qualifications (CA, CMA, ICWA, CS) include them in education AND must_have_skills
- Normalise skill names: "ReactJS", "React.js", "React JS" all become "React"
- location_flexibility defaults to "onsite" if not mentioned
- seniority_level: junior=0-2yr, mid=2-6yr, senior=6-12yr, lead/manager=8yr+

JOB DESCRIPTION:
${jdText}`
}

export async function analyzeJD(jdText: string): Promise<JdRequirements> {
  if (!jdText || jdText.trim().length < 50) {
    throw new Error('Job description is too short to analyse (minimum 50 characters)')
  }

  const response = await groqChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildUserPrompt(jdText) },
    ],
    { json: true, temperature: 0.1, maxTokens: 1000 }
  )

  let parsed: JdRequirements
  try {
    parsed = JSON.parse(response.content)
  } catch {
    throw new Error(`JD Analyzer returned invalid JSON: ${response.content.slice(0, 200)}`)
  }

  // Basic validation — ensure required fields exist
  const required: (keyof JdRequirements)[] = [
    'job_title', 'must_have_skills', 'experience_range',
    'location', 'seniority_level',
  ]
  for (const field of required) {
    if (!parsed[field]) {
      throw new Error(`JD Analyzer missing required field: ${field}`)
    }
  }

  return parsed
}