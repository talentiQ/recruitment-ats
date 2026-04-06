// lib/agent/jdAnalyzer.ts
// Agent 1 — JD Analyzer (INTERNAL — NO GROQ)

export interface JdRequirements {
  job_title:            string
  must_have_skills:     string[]
  nice_to_have_skills:  string[]
  experience_range:     { min: number; max: number }
  education:            string
  location:             string
  location_flexibility: 'onsite' | 'hybrid' | 'remote' | 'any'
  industry_preference:  string[]
  key_responsibilities: string[]
  seniority_level:      'junior' | 'mid' | 'senior' | 'lead' | 'manager'
  raw_summary:          string
}

// ─── Skill Dictionary ─────────────────────────────────────────────────────────

const COMMON_SKILLS = [
  'Java', 'Python', 'SQL', 'React', 'Node', 'Angular',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes',
  'Excel', 'Power BI', 'Tableau',
  'Sales', 'Marketing', 'Accounting', 'Finance',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractSkills(text: string): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []

  for (const skill of COMMON_SKILLS) {
    if (lower.includes(skill.toLowerCase())) {
      found.push(skill)
    }
  }

  return [...new Set(found)]
}

function extractExperience(text: string): { min: number; max: number } {
  const rangeMatch = text.match(/(\d+)\s*[-to]{1,3}\s*(\d+)/i)
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
    }
  }

  const singleMatch = text.match(/(\d+)\+?\s*years?/i)
  if (singleMatch) {
    const min = Number(singleMatch[1])
    return { min, max: min + 5 }
  }

  return { min: 0, max: 10 }
}

function extractLocation(text: string): string {
  const cities = ['Delhi', 'Noida', 'Gurgaon', 'Bangalore', 'Mumbai', 'Pune']
  const lower = text.toLowerCase()

  for (const city of cities) {
    if (lower.includes(city.toLowerCase())) {
      return city
    }
  }

  return 'India'
}

function extractEducation(text: string): string {
  if (/b\.?tech|b\.?e/i.test(text)) return 'B.Tech/B.E.'
  if (/mba/i.test(text)) return 'MBA'
  if (/ca|cma/i.test(text)) return 'CA/CMA'
  return 'Any Graduate'
}

function extractSeniority(exp: number): JdRequirements['seniority_level'] {
  if (exp <= 2) return 'junior'
  if (exp <= 6) return 'mid'
  if (exp <= 12) return 'senior'
  return 'lead'
}

function extractResponsibilities(text: string): string[] {
  return text
    .split('.')
    .map(s => s.trim())
    .filter(s => s.length > 20)
    .slice(0, 5)
}

// ─── MAIN PARSER ─────────────────────────────────────────────────────────────

function simpleParseJD(jdText: string): JdRequirements {
  const skills = extractSkills(jdText)
  const exp = extractExperience(jdText)

  return {
    job_title: jdText.split('\n')[0]?.slice(0, 60) || 'Unknown Role',

    must_have_skills: skills.slice(0, 6),
    nice_to_have_skills: skills.slice(6, 10),

    experience_range: exp,

    education: extractEducation(jdText),
    location: extractLocation(jdText),
    location_flexibility: 'onsite',

    industry_preference: [],

    key_responsibilities: extractResponsibilities(jdText),

    seniority_level: extractSeniority(exp.min),

    raw_summary: jdText.slice(0, 200),
  }
}

// ─── PUBLIC FUNCTION ─────────────────────────────────────────────────────────

export async function analyzeJD(jdText: string): Promise<JdRequirements> {
  if (!jdText || jdText.trim().length < 50) {
    throw new Error('Job description is too short to analyse (minimum 50 characters)')
  }

  return simpleParseJD(jdText)
}