// lib/resumeMatchEngine.ts
// Pure TypeScript — zero external dependencies.
// Runs server-side in API route. Also safe to import in tests.
//
// Scoring (total 100 pts):
//   Skills match     45 pts  — exact=1.0, alias/fuzzy=0.6 per required skill
//   Experience fit   25 pts  — graduated range scoring
//   JD keyword TF    20 pts  — resume text vs job description keyword overlap
//   CTC fit          10 pts  — expected salary vs job budget

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MatchInput {
  resume: {
    skills:           string[]        // normalized skill names from parser
    total_experience: number | null   // years
    expected_ctc:     number | null   // lakhs
    rawText?:         string          // full resume text for JD keyword matching
  }
  job: {
    job_title:       string
    job_description?: string | null
    key_skills?:      string | null   // comma-separated TEXT from DB (not array)
    experience_min?:  number | null
    experience_max?:  number | null
    min_ctc?:         number | null
    max_ctc?:         number | null
  }
}

export interface MatchResult {
  match_score:     number            // 0–100 integer
  recommendation:  'shortlist' | 'maybe' | 'reject'
  breakdown: {
    skills_score:      number        // 0–45
    experience_score:  number        // 0–25
    jd_keyword_score:  number        // 0–20
    ctc_score:         number        // 0–10
  }
  matched_skills:    string[]        // required skills found in resume
  missing_skills:    string[]        // required skills NOT found
  partial_skills:    string[]        // fuzzy/alias matches
  experience_verdict: string
  ctc_verdict:       string
  summary:           string          // 2-sentence human-readable
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','as','is','are','was','were','be','been','have','has','had','do','does',
  'did','will','would','could','should','may','might','this','that','these','those',
  'it','its','we','our','you','your','they','their','not','no','so','both','either',
  'each','any','all','more','most','other','such','than','then','there','when','where',
  'who','which','how','what','if','about','above','after','before','between','into',
  'through','during','including','without','across','within','per','also','well',
  'very','just','can','need','must','make','work','use','using','used','based','able',
  'good','strong','excellent','minimum','maximum','years','year','experience','role',
  'position','company','team','candidate','candidates','skills','skill','ability',
  'knowledge','required','preferred','responsibilities','requirements','qualification',
])

// Common skill aliases for fuzzy matching (bi-directional)
const SKILL_ALIASES: Array<[string, string]> = [
  // Tech
  ['javascript',   'js'],
  ['typescript',   'ts'],
  ['node.js',      'nodejs'],
  ['node.js',      'node js'],
  ['react.js',     'react'],
  ['reactjs',      'react'],
  ['angular.js',   'angular'],
  ['angularjs',    'angular'],
  ['vue.js',       'vuejs'],
  ['postgresql',   'postgres'],
  ['postgresql',   'psql'],
  ['mysql',        'sql'],
  ['microsoft sql','mssql'],
  ['ms excel',     'excel'],
  ['microsoft excel', 'excel'],
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai'],
  ['natural language processing', 'nlp'],
  ['amazon web services', 'aws'],
  ['google cloud platform', 'gcp'],
  ['microsoft azure', 'azure'],
  ['docker',       'containerization'],
  ['kubernetes',   'k8s'],
  ['rest api',     'restful api'],
  ['rest api',     'rest apis'],
  ['graphql',      'graph ql'],
  ['mongodb',      'mongo'],
  // HR domain
  ['talent acquisition',  'recruitment'],
  ['talent acquisition',  'recruiting'],
  ['talent acquisition',  'hiring'],
  ['talent acquisition',  'staffing'],
  ['stakeholder management', 'client management'],
  ['stakeholder management', 'client handling'],
  ['performance management', 'pms'],
  ['employee engagement', 'engagement'],
  ['hr analytics',    'people analytics'],
  ['hris',            'hrms'],
  ['hris',            'hr system'],
  ['linkedin recruiter', 'linkedin'],
  ['background verification', 'bgv'],
  ['background verification', 'background check'],
  ['offer management', 'offer negotiation'],
  // Finance
  ['financial analysis', 'financial modelling'],
  ['mis reporting',   'mis'],
  ['accounts payable','ap'],
  ['accounts receivable', 'ar'],
  // Sales
  ['business development', 'bd'],
  ['key account management', 'kam'],
  ['b2b sales',       'b2b'],
  ['b2c sales',       'b2c'],
]

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s\+\#\.]/g, ' ').replace(/\s+/g, ' ').trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

/**
 * Returns 'exact' | 'partial' | null
 * exact   = direct string match or containment
 * partial = alias match or 1-char Levenshtein on short strings
 */
function compareSkills(resumeSkill: string, jobSkill: string): 'exact' | 'partial' | null {
  const r = normalizeStr(resumeSkill)
  const j = normalizeStr(jobSkill)

  if (r === j) return 'exact'
  if (r.includes(j) || j.includes(r)) return 'exact'

  // Alias lookup (both directions)
  for (const [a, b] of SKILL_ALIASES) {
    const na = normalizeStr(a), nb = normalizeStr(b)
    const rMatchA = r === na || r.includes(na)
    const rMatchB = r === nb || r.includes(nb)
    const jMatchA = j === na || j.includes(na)
    const jMatchB = j === nb || j.includes(nb)
    if ((rMatchA && jMatchB) || (rMatchB && jMatchA)) return 'partial'
  }

  // Levenshtein for short skill names (≤ 15 chars)
  if (r.length >= 4 && j.length >= 4 && r.length <= 15 && j.length <= 15) {
    const maxAllowed = Math.min(2, Math.floor(Math.min(r.length, j.length) / 5))
    if (levenshtein(r, j) <= maxAllowed) return 'partial'
  }

  return null
}

// ─── Layer 1: Skills Scoring (0–45) ──────────────────────────────────────────

export function parseJobSkills(keySkillsText: string | null | undefined): string[] {
  if (!keySkillsText || keySkillsText.trim() === '') return []
  return keySkillsText
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 80)
}

function scoreSkills(
  resumeSkills: string[],
  jobKeySkills: string | null | undefined
): Pick<MatchResult, 'matched_skills' | 'missing_skills' | 'partial_skills'> & { score: number } {

  const jobSkills = parseJobSkills(jobKeySkills)

  // No required skills in job — give neutral credit if candidate has skills
  if (jobSkills.length === 0) {
    return {
      score: resumeSkills.length >= 3 ? 28 : resumeSkills.length > 0 ? 18 : 10,
      matched_skills: [], missing_skills: [], partial_skills: [],
    }
  }

  const matched: string[] = []
  const partial: string[]  = []
  const missing: string[]  = []

  for (const jobSkill of jobSkills) {
    let best: 'exact' | 'partial' | null = null

    for (const resumeSkill of resumeSkills) {
      const result = compareSkills(resumeSkill, jobSkill)
      if (result === 'exact') { best = 'exact'; break }
      if (result === 'partial') best = 'partial'
    }

    if (best === 'exact')   matched.push(jobSkill)
    else if (best === 'partial') partial.push(jobSkill)
    else                    missing.push(jobSkill)
  }

  // Weighted: exact=1.0, partial=0.6
  const rawRatio = (matched.length + partial.length * 0.6) / jobSkills.length
  const score = Math.round(rawRatio * 45)

  return { score, matched_skills: matched, missing_skills: missing, partial_skills: partial }
}

// ─── Layer 2: Experience Scoring (0–25) ───────────────────────────────────────

function scoreExperience(
  totalExp: number | null,
  expMin: number | null | undefined,
  expMax: number | null | undefined
): { score: number; experience_verdict: string } {

  if (totalExp === null || totalExp === undefined) {
    return { score: 8, experience_verdict: 'Experience not found in resume — verify manually' }
  }

  const min = expMin ?? 0
  const max = expMax ?? 99

  // Within range — perfect
  if (totalExp >= min && totalExp <= max) {
    return {
      score: 25,
      experience_verdict: `Within range — ${totalExp} yrs (required ${min}–${max} yrs)`,
    }
  }

  const deficit = min - totalExp    // positive if under-qualified
  const surplus = totalExp - max    // positive if over-experienced

  if (deficit > 0) {
    if (deficit <= 1) return { score: 18, experience_verdict: `Slightly below minimum — ${totalExp} yrs (min ${min} yrs)` }
    if (deficit <= 2) return { score: 10, experience_verdict: `Below range — ${totalExp} yrs (min ${min} yrs)` }
    if (deficit <= 4) return { score: 5,  experience_verdict: `Under-qualified — ${totalExp} yrs vs ${min} yrs minimum` }
    return              { score: 2,  experience_verdict: `Significantly under-experienced — ${totalExp} yrs vs ${min} yrs required` }
  }

  // Over-experienced (often still hireable)
  if (surplus <= 2)  return { score: 22, experience_verdict: `Slightly over-experienced — ${totalExp} yrs (max ${max} yrs)` }
  if (surplus <= 5)  return { score: 15, experience_verdict: `Over-experienced — ${totalExp} yrs (max ${max} yrs)` }
  return               { score: 8,  experience_verdict: `Significantly over-experienced — ${totalExp} yrs vs ${max} yrs max` }
}

// ─── Layer 3: JD Keyword TF Overlap (0–20) ───────────────────────────────────
// Strategy: extract non-stop-word tokens from JD, score % that appear in resume text.
// Longer tokens weighted higher (more specific = more meaningful).

function scoreJDKeywords(
  resumeRawText: string | undefined,
  jdText: string | null | undefined
): number {

  // No JD text — neutral
  if (!jdText || jdText.trim().length < 30) return 10
  if (!resumeRawText || resumeRawText.trim().length < 30) return 8

  const jdTokens = jdText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w))

  if (jdTokens.length === 0) return 10

  // Deduplicate + weight by length (4 chars = weight 1, 10+ chars = weight 2.5)
  const tokenWeight = new Map<string, number>()
  for (const t of jdTokens) {
    if (!tokenWeight.has(t)) {
      tokenWeight.set(t, Math.min(2.5, 1 + (t.length - 4) * 0.15))
    }
  }

  const resumeLower = resumeRawText.toLowerCase()
  let totalWeight = 0, hitWeight = 0

  for (const [token, weight] of tokenWeight) {
    totalWeight += weight
    if (resumeLower.includes(token)) hitWeight += weight
  }

  const ratio = totalWeight > 0 ? hitWeight / totalWeight : 0
  return Math.round(ratio * 20)
}

// ─── Layer 4: CTC Fit (0–10) ─────────────────────────────────────────────────

function scoreCTC(
  expectedCTC: number | null,
  minCTC: number | null | undefined,
  maxCTC: number | null | undefined
): { score: number; ctc_verdict: string } {

  if (!expectedCTC || expectedCTC === 0) {
    return { score: 5, ctc_verdict: 'Expected CTC not specified in resume' }
  }
  if (!maxCTC && !minCTC) {
    return { score: 5, ctc_verdict: 'No CTC budget specified for this job' }
  }

  const max = maxCTC || 9999
  const min = minCTC || 0

  if (expectedCTC >= min && expectedCTC <= max) {
    return { score: 10, ctc_verdict: `Within budget — expects ₹${expectedCTC}L (range ₹${min}–${max}L)` }
  }

  if (expectedCTC < min) {
    return { score: 8, ctc_verdict: `Below minimum — expects ₹${expectedCTC}L (min ₹${min}L) — may negotiate up` }
  }

  // Over budget
  const overPercent = ((expectedCTC - max) / max) * 100
  if (overPercent <= 10) return { score: 6, ctc_verdict: `Slightly over budget — ${overPercent.toFixed(0)}% above ₹${max}L max` }
  if (overPercent <= 25) return { score: 3, ctc_verdict: `Over budget — expects ₹${expectedCTC}L vs max ₹${max}L` }
  return                  { score: 0, ctc_verdict: `Significantly over budget — expects ₹${expectedCTC}L vs max ₹${max}L` }
}

// ─── Summary Generator ────────────────────────────────────────────────────────

function generateSummary(r: Omit<MatchResult, 'summary'>): string {
  const { match_score, matched_skills, missing_skills, experience_verdict, breakdown } = r

  const parts: string[] = []

  if (matched_skills.length > 0) {
    const listed = matched_skills.slice(0, 3).join(', ')
    const extra  = matched_skills.length > 3 ? ` +${matched_skills.length - 3} more` : ''
    parts.push(`Matches ${matched_skills.length} required skill${matched_skills.length > 1 ? 's' : ''} (${listed}${extra})`)
  } else {
    parts.push('No required skills directly matched')
  }

  if (missing_skills.length > 0) {
    const gaps = missing_skills.slice(0, 3).join(', ')
    const extra = missing_skills.length > 3 ? ` and ${missing_skills.length - 3} more` : ''
    parts.push(`missing ${gaps}${extra}`)
  }

  if (experience_verdict && !experience_verdict.toLowerCase().includes('not found')) {
    parts.push(experience_verdict.toLowerCase())
  }

  const verdict =
    match_score >= 70 ? 'Strong candidate — recommended for shortlist.' :
    match_score >= 45 ? 'Partial match — recommend manual review.' :
    'Significant gaps — recommend rejecting.'

  return parts.join('; ') + '. ' + verdict
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function matchResumeToJob(input: MatchInput): MatchResult {
  const { resume, job } = input

  const skillsResult  = scoreSkills(resume.skills, job.key_skills)
  const expResult     = scoreExperience(resume.total_experience, job.experience_min, job.experience_max)
  const jdScore       = scoreJDKeywords(resume.rawText, job.job_description)
  const ctcResult     = scoreCTC(resume.expected_ctc, job.min_ctc, job.max_ctc)

  const breakdown = {
    skills_score:     skillsResult.score,
    experience_score: expResult.score,
    jd_keyword_score: jdScore,
    ctc_score:        ctcResult.score,
  }

  const match_score = Math.min(100,
    breakdown.skills_score +
    breakdown.experience_score +
    breakdown.jd_keyword_score +
    breakdown.ctc_score
  )

  const recommendation: MatchResult['recommendation'] =
    match_score >= 70 ? 'shortlist' :
    match_score >= 45 ? 'maybe'     : 'reject'

  const partial: Omit<MatchResult, 'summary'> = {
    match_score,
    recommendation,
    breakdown,
    matched_skills:    skillsResult.matched_skills,
    missing_skills:    skillsResult.missing_skills,
    partial_skills:    skillsResult.partial_skills,
    experience_verdict: expResult.experience_verdict,
    ctc_verdict:       ctcResult.ctc_verdict,
  }

  return { ...partial, summary: generateSummary(partial) }
}