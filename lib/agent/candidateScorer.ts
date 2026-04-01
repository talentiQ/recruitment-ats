// lib/agent/candidateScorer.ts
// Agent 2 (Part A) — Candidate Scorer
//
// Input:  JdRequirements (from jdAnalyzer) + candidate resume text + candidate metadata
// Output: AiCandidateScore with per-dimension breakdown and reasoning
//
// Scoring dimensions (100 pts total — aligned with existing 7-layer system):
//   Skills match    50 pts  — must-have (35) + nice-to-have (15)
//   Experience      25 pts  — years + relevance
//   Role alignment  15 pts  — responsibilities match
//   Education       10 pts  — qualification match
//
// Design decisions:
//   - LLM does semantic matching — no keyword regex needed
//   - reasoning field per dimension — recruiter can see WHY a score was given
//   - confidence: low | medium | high — flags uncertain calls for human review
//   - red_flag_notes passed through from existing redFlagDetector — not re-detected here

import { groqChat } from '../groqClient'
import type { JdRequirements } from './jdAnalyzer'

export interface ScoreDimension {
  score:     number   // points earned
  max:       number   // max possible
  reasoning: string   // 1 sentence explanation
}

export interface AiCandidateScore {
  candidate_id:      string
  candidate_name:    string
  total_score:       number                    // 0–100
  grade:             'A' | 'B' | 'C' | 'D'   // A=80+, B=65+, C=50+, D=<50
  dimensions: {
    skills:      ScoreDimension   // /50
    experience:  ScoreDimension   // /25
    alignment:   ScoreDimension   // /15
    education:   ScoreDimension   // /10
  }
  matched_skills:    string[]   // skills from JD found in resume
  missing_skills:    string[]   // must-have skills NOT found
  confidence:        'low' | 'medium' | 'high'
  shortlist_reason:  string     // 1-sentence human-readable summary
  concern:           string     // 1-sentence concern or "None"
}

interface CandidateMeta {
  id:                string
  name:              string
  stated_experience: number | null
  current_location:  string | null
}

const SYSTEM_PROMPT = `You are a senior technical recruiter specialising in Indian talent markets.
You evaluate candidate resumes against job requirements and provide objective, evidence-based scores.
You always respond with valid JSON only — no preamble, no explanation, no markdown.`

function buildScoringPrompt(
  jd:        JdRequirements,
  resumeText: string,
  meta:       CandidateMeta
): string {
  return `Score this candidate against the job requirements. Return JSON matching EXACTLY this schema:

{
  "candidate_id": "${meta.id}",
  "candidate_name": "${meta.name}",
  "total_score": number (0-100),
  "grade": "A" | "B" | "C" | "D",
  "dimensions": {
    "skills":     { "score": number (0-50),  "max": 50,  "reasoning": "1 sentence" },
    "experience": { "score": number (0-25),  "max": 25,  "reasoning": "1 sentence" },
    "alignment":  { "score": number (0-15),  "max": 15,  "reasoning": "1 sentence" },
    "education":  { "score": number (0-10),  "max": 10,  "reasoning": "1 sentence" }
  },
  "matched_skills":   ["skills from JD found in resume"],
  "missing_skills":   ["must-have skills NOT found in resume"],
  "confidence":       "low" | "medium" | "high",
  "shortlist_reason": "1 sentence — why this candidate is or isn't a good fit",
  "concern":          "1 sentence concern OR the string None"
}

SCORING RULES:
Skills (50 pts):
  - Must-have skills: 35 pts — deduct ~4-5 pts per missing must-have skill
  - Nice-to-have skills: 15 pts — proportional to how many are present
  - Treat synonyms as matches: React = ReactJS = React.js, Node = NodeJS, ICWA = CMA = CMA(India)
  - Partial domain match (e.g. has SAP FI but JD wants SAP CO) = half credit

Experience (25 pts):
  - Full 25 pts if within JD range
  - 18 pts if 1-2 years below minimum (can grow into role)
  - 12 pts if 3+ years below minimum
  - 20 pts if above maximum (overqualified — might leave soon)
  - Use stated experience if available, else estimate from resume dates

Role alignment (15 pts):
  - How well do their actual day-to-day responsibilities match the JD's key responsibilities?
  - 15 = near-perfect match, 10 = good overlap, 5 = partial, 0 = different domain

Education (10 pts):
  - 10 pts: exact match or higher (e.g. JD wants B.Tech, candidate has B.Tech/M.Tech)
  - 7 pts: equivalent (e.g. JD wants CA, candidate has CMA — both are professional accountancy)
  - 4 pts: related but lower (e.g. JD wants CA, candidate has B.Com + MBA Finance)
  - 0 pts: unrelated

Grade thresholds: A=80+, B=65-79, C=50-64, D=<50
Confidence: high if resume is detailed and clear, medium if some info missing, low if very sparse

JOB REQUIREMENTS:
${JSON.stringify(jd, null, 2)}

CANDIDATE RESUME:
Name: ${meta.name}
Stated Experience: ${meta.stated_experience ?? 'Not specified'} years
Current Location: ${meta.current_location ?? 'Not specified'}

${resumeText}`
}

export async function scoreCandidate(
  jd:         JdRequirements,
  resumeText: string,
  meta:       CandidateMeta
): Promise<AiCandidateScore> {
  if (!resumeText || resumeText.trim().length < 100) {
    // Return a low-confidence minimal score if resume text is too sparse
    return {
      candidate_id:     meta.id,
      candidate_name:   meta.name,
      total_score:      0,
      grade:            'D',
      dimensions: {
        skills:     { score: 0, max: 50, reasoning: 'No resume text available' },
        experience: { score: 0, max: 25, reasoning: 'No resume text available' },
        alignment:  { score: 0, max: 15, reasoning: 'No resume text available' },
        education:  { score: 0, max: 10, reasoning: 'No resume text available' },
      },
      matched_skills:   [],
      missing_skills:   jd.must_have_skills,
      confidence:       'low',
      shortlist_reason: 'Resume text unavailable — manual review required',
      concern:          'No resume data to evaluate',
    }
  }

  const response = await groqChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildScoringPrompt(jd, resumeText, meta) },
    ],
    { json: true, temperature: 0.1, maxTokens: 1200 }
  )

  let parsed: AiCandidateScore
  try {
    parsed = JSON.parse(response.content)
  } catch {
    throw new Error(`Candidate scorer returned invalid JSON for ${meta.name}: ${response.content.slice(0, 200)}`)
  }

  // Clamp scores to valid ranges
  parsed.total_score               = Math.min(100, Math.max(0, parsed.total_score))
  parsed.dimensions.skills.score   = Math.min(50,  Math.max(0, parsed.dimensions.skills.score))
  parsed.dimensions.experience.score = Math.min(25, Math.max(0, parsed.dimensions.experience.score))
  parsed.dimensions.alignment.score  = Math.min(15, Math.max(0, parsed.dimensions.alignment.score))
  parsed.dimensions.education.score  = Math.min(10, Math.max(0, parsed.dimensions.education.score))

  // Recalculate total from dimensions (prevents LLM arithmetic errors)
  parsed.total_score =
    parsed.dimensions.skills.score +
    parsed.dimensions.experience.score +
    parsed.dimensions.alignment.score +
    parsed.dimensions.education.score

  // Recalculate grade from total
  parsed.grade =
    parsed.total_score >= 80 ? 'A' :
    parsed.total_score >= 65 ? 'B' :
    parsed.total_score >= 50 ? 'C' : 'D'

  return parsed
}