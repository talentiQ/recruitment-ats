// lib/resumeMatchEngine.ts
// Pure TypeScript — zero external dependencies.
// Runs server-side in API route. Also safe to import in tests.
//
// Scoring (total 100 pts):
//   Skills match           30 pts  — exact=1.0, alias/fuzzy=0.6, text-extracted=0.5
//   Experience relevance   20 pts  — years range + domain relevance
//   Role & responsibility  20 pts  — action verbs + responsibility keyword overlap
//   Education + certs      10 pts  — degree match, strict for professions (CA, LLB etc.)
//   Career stability       10 pts  — tenure analysis, progression, job-hopping penalty
//   Location match          5 pts  — city/metro/state/remote
//   Industry fit            5 pts  — company/domain keyword overlap
//
// CTC intentionally excluded — unreliable, rarely in resume, not a meaningful signal

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MatchInput {
  resume: {
    skills:            string[]
    total_experience:  number | null
    rawText?:          string
    education_level?:  string
    education_degree?: string
    current_location?: string
    current_company?:  string
  }
  job: {
    job_title:              string
    job_description?:       string | null
    key_skills?:            string | null
    experience_min?:        number | null
    experience_max?:        number | null
    min_ctc?:               number | null
    max_ctc?:               number | null
    education_requirement?: string | null
    location?:              string | null
    nice_to_have_skills?:   string | null
  }
}

export interface MatchResult {
  match_score:            number
  recommendation:         'shortlist' | 'maybe' | 'reject'
  breakdown: {
    skills_score:         number   // 0–30
    experience_score:     number   // 0–20
    responsibility_score: number   // 0–20
    education_score:      number   // 0–10
    stability_score:      number   // 0–10
    location_score:       number   // 0–5
    industry_score:       number   // 0–5
  }
  matched_skills:         string[]
  missing_skills:         string[]
  partial_skills:         string[]
  text_extracted_skills:  string[]
  experience_verdict:     string
  education_verdict:      string
  location_verdict:       string
  stability_verdict:      string
  industry_verdict:       string
  summary:                string
}

// ─── Stop words ───────────────────────────────────────────────────────────────

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

// ─── Skill aliases ────────────────────────────────────────────────────────────

const SKILL_ALIASES: Array<[string, string]> = [
  // Tech
  ['javascript','js'],['typescript','ts'],['node.js','nodejs'],['node.js','node js'],
  ['react.js','react'],['reactjs','react'],['next.js','nextjs'],
  ['angular.js','angular'],['angularjs','angular'],['vue.js','vuejs'],
  ['postgresql','postgres'],['postgresql','psql'],['mysql','sql'],
  ['microsoft sql','mssql'],['ms excel','excel'],['microsoft excel','excel'],
  ['machine learning','ml'],['artificial intelligence','ai'],
  ['natural language processing','nlp'],['amazon web services','aws'],
  ['google cloud platform','gcp'],['microsoft azure','azure'],
  ['docker','containerization'],['kubernetes','k8s'],
  ['rest api','restful api'],['rest api','rest apis'],['graphql','graph ql'],
  ['mongodb','mongo'],['next.js','react'],
  // HR
  ['talent acquisition','recruitment'],['talent acquisition','recruiting'],
  ['talent acquisition','hiring'],['talent acquisition','staffing'],
  ['stakeholder management','client management'],['stakeholder management','client handling'],
  ['performance management','pms'],['employee engagement','engagement'],
  ['hr analytics','people analytics'],['hris','hrms'],['hris','hr system'],
  ['linkedin recruiter','linkedin'],['background verification','bgv'],
  ['background verification','background check'],['offer management','offer negotiation'],
  // Finance / Tax
  ['financial analysis','financial modelling'],['mis reporting','mis'],
  ['accounts payable','ap'],['accounts receivable','ar'],
  ['transfer pricing','tp'],['transfer pricing','transfer pricing documentation'],
  ['corporate tax','corporate taxation'],['corporate tax','corporate income tax'],
  ['direct tax','direct taxation'],['indirect tax','indirect taxation'],
  ['income tax','income tax returns'],['income tax','income tax compliance'],
  ['tax audit','tax audits'],['tax compliance','tax compliances'],
  ['financial reporting','financial statements'],['financial reporting','ifrs'],
  ['ifrs','international financial reporting standards'],
  ['gst','goods and services tax'],['gst','gst compliance'],
  // Sales
  ['business development','bd'],['key account management','kam'],
  ['b2b sales','b2b'],['b2c sales','b2c'],
]

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s\+\#\.]/g, ' ').replace(/\s+/g, ' ').trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n; if (n === 0) return m
  const dp = Array.from({length: m+1}, (_,i) =>
    Array.from({length: n+1}, (_,j) => i===0?j:j===0?i:0))
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1])
  return dp[m][n]
}

function compareSkills(r: string, j: string): 'exact'|'partial'|null {
  const rn = normalizeStr(r), jn = normalizeStr(j)
  if (rn===jn || rn.includes(jn) || jn.includes(rn)) return 'exact'
  for (const [a,b] of SKILL_ALIASES) {
    const na=normalizeStr(a), nb=normalizeStr(b)
    const rA=rn===na||rn.includes(na), rB=rn===nb||rn.includes(nb)
    const jA=jn===na||jn.includes(na), jB=jn===nb||jn.includes(nb)
    if ((rA&&jB)||(rB&&jA)) return 'partial'
  }
  if (rn.length>=4&&jn.length>=4&&rn.length<=15&&jn.length<=15) {
    const max=Math.min(2,Math.floor(Math.min(rn.length,jn.length)/5))
    if (levenshtein(rn,jn)<=max) return 'partial'
  }
  return null
}

function skillInRawText(jobSkill: string, resumeText: string): boolean {
  const nt = normalizeStr(resumeText), j = normalizeStr(jobSkill)
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  if (new RegExp(`(^|[^a-z0-9])${esc(j)}([^a-z0-9]|$)`).test(nt)) return true
  for (const [a,b] of SKILL_ALIASES) {
    const na=normalizeStr(a), nb=normalizeStr(b)
    if (j===na||j.includes(na)||na.includes(j))
      if (new RegExp(`(^|[^a-z0-9])${esc(nb)}([^a-z0-9]|$)`).test(nt)) return true
    if (j===nb||j.includes(nb)||nb.includes(j))
      if (new RegExp(`(^|[^a-z0-9])${esc(na)}([^a-z0-9]|$)`).test(nt)) return true
  }
  return false
}

// ─── Layer 1: Skills Match (0–30) ────────────────────────────────────────────

export function parseJobSkills(keySkillsText: string | null | undefined): string[] {
  if (!keySkillsText?.trim()) return []
  return keySkillsText.split(/[,;\n]+/).map(s=>s.trim()).filter(s=>s.length>1&&s.length<80)
}

function applySkillCurve(rawRatio: number): number {
  if (rawRatio<=0) return 0
  if (rawRatio>=1) return 30
  return Math.round(Math.pow(rawRatio, 0.75) * 30)
}

function scoreSkills(
  resumeSkills: string[],
  jobKeySkills: string | null | undefined,
  niceToHaveSkills: string | null | undefined,
  rawText?: string
): Pick<MatchResult,'matched_skills'|'missing_skills'|'partial_skills'|'text_extracted_skills'> & {score:number} {

  const jobSkills  = parseJobSkills(jobKeySkills)
  const niceSkills = parseJobSkills(niceToHaveSkills)

  if (jobSkills.length===0) {
    return {
      score: resumeSkills.length>=3 ? 20 : resumeSkills.length>0 ? 12 : 6,
      matched_skills:[], missing_skills:[], partial_skills:[], text_extracted_skills:[],
    }
  }

  const matched:string[]=[], partial:string[]=[], textExtracted:string[]=[], missing:string[]=[]

  for (const jobSkill of jobSkills) {
    let best:'exact'|'partial'|null = null
    for (const rs of resumeSkills) {
      const r = compareSkills(rs, jobSkill)
      if (r==='exact') { best='exact'; break }
      if (r==='partial') best='partial'
    }
    if (best==='exact')   { matched.push(jobSkill); continue }
    if (best==='partial') { partial.push(jobSkill); continue }
    if (rawText && rawText.trim().length>50 && skillInRawText(jobSkill, rawText)) {
      textExtracted.push(jobSkill); continue
    }
    missing.push(jobSkill)
  }

  // Nice-to-have skills give a small bonus (up to 3 pts)
  let niceBonus = 0
  for (const ns of niceSkills) {
    let found = false
    for (const rs of resumeSkills) {
      if (compareSkills(rs, ns) !== null) { found=true; break }
    }
    if (!found && rawText && skillInRawText(ns, rawText)) found=true
    if (found) niceBonus++
  }
  const nicePts = niceSkills.length>0 ? Math.min(3, Math.round((niceBonus/niceSkills.length)*3)) : 0

  const rawRatio  = (matched.length*1.0 + partial.length*0.6 + textExtracted.length*0.5) / jobSkills.length
  const baseScore = applySkillCurve(rawRatio)

  return {
    score: Math.min(30, baseScore + nicePts),
    matched_skills: matched, missing_skills: missing,
    partial_skills: partial, text_extracted_skills: textExtracted,
  }
}

// ─── Layer 2: Experience Relevance (0–20) ────────────────────────────────────

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  'fintech':      ['fintech','financial technology','banking','payments','neobank','lending','insurance','insurtech'],
  'saas':         ['saas','software as a service','b2b software','cloud software','subscription'],
  'ecommerce':    ['ecommerce','e-commerce','retail tech','marketplace','d2c','dtc','shopify'],
  'healthtech':   ['healthtech','health tech','healthcare','medtech','hospital','clinical','pharma'],
  'edtech':       ['edtech','ed-tech','education technology','learning','lms','online education'],
  'logistics':    ['logistics','supply chain','delivery','fulfillment','warehouse','freight'],
  'taxation':     ['taxation','tax','transfer pricing','gst','income tax','direct tax','indirect tax','ca firm'],
  'audit':        ['audit','statutory audit','internal audit','assurance','compliance'],
  'recruitment':  ['recruitment','staffing','talent acquisition','executive search','rpo','headhunting'],
  'manufacturing':['manufacturing','production','factory','plant','assembly','quality'],
  'realestate':   ['real estate','property','construction','realty','infra'],
}

function detectDomain(text: string): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) found.push(domain)
  }
  return found
}

// ── fix: jobDescription typed as string | undefined (not null) ───────────────
function scoreExperience(
  totalExp: number | null,
  expMin: number | null | undefined,
  expMax: number | null | undefined,
  resumeRawText?: string,
  jobTitle?: string,
  jobDescription?: string        // ← string | undefined only (null stripped at call site)
): { score: number; experience_verdict: string } {

  let baseScore = 0
  let verdict   = ''

  if (totalExp === null || totalExp === undefined) {
    baseScore = 6
    verdict   = 'Experience not found in resume — verify manually'
  } else {
    const min = expMin ?? 0
    const max = expMax ?? 99

    if (totalExp >= min && totalExp <= max) {
      baseScore = 16
      verdict   = `Within range — ${totalExp} yrs (required ${min}–${max} yrs)`
    } else {
      const deficit = min - totalExp
      const surplus = totalExp - max

      if (deficit > 0) {
        if (deficit <= 1)      { baseScore=11; verdict=`Slightly below minimum — ${totalExp} yrs (min ${min} yrs)` }
        else if (deficit <= 2) { baseScore=7;  verdict=`Below range — ${totalExp} yrs (min ${min} yrs)` }
        else if (deficit <= 4) { baseScore=3;  verdict=`Under-qualified — ${totalExp} yrs vs ${min} yrs minimum` }
        else                   { baseScore=1;  verdict=`Significantly under-experienced — ${totalExp} yrs vs ${min} yrs required` }
      } else {
        if (surplus <= 2)      { baseScore=14; verdict=`Slightly over-experienced — ${totalExp} yrs (max ${max} yrs)` }
        else if (surplus <= 5) { baseScore=10; verdict=`Over-experienced — ${totalExp} yrs (max ${max} yrs)` }
        else                   { baseScore=6;  verdict=`Significantly over-experienced — ${totalExp} yrs vs ${max} yrs max` }
      }
    }
  }

  // Domain relevance bonus (up to +4 pts)
  let domainBonus = 0
  if (resumeRawText && (jobTitle || jobDescription)) {
    const jdText       = `${jobTitle || ''} ${jobDescription || ''}`.toLowerCase()
    const resumeDomains = detectDomain(resumeRawText)
    const jobDomains    = detectDomain(jdText)
    const overlap = resumeDomains.filter(d => jobDomains.includes(d))
    if (overlap.length > 0) {
      domainBonus = Math.min(4, overlap.length * 2)
      verdict += ` · Domain match: ${overlap.join(', ')}`
    }
  }

  return { score: Math.min(20, baseScore + domainBonus), experience_verdict: verdict }
}

// ─── Layer 3: Role & Responsibility Alignment (0–20) ─────────────────────────

const ACTION_VERBS = {
  leadership: ['led','managed','directed','headed','oversaw','supervised','mentored',
               'coached','built team','grew team','hired','scaled','transformed'],
  execution:  ['developed','built','implemented','designed','architected','created',
               'delivered','launched','deployed','shipped','automated','optimized'],
  analysis:   ['analyzed','assessed','evaluated','researched','investigated','audited',
               'reviewed','reported','measured','tracked','monitored'],
  process:    ['coordinated','collaborated','managed','planned','organized','executed',
               'administered','handled','processed','maintained','ensured'],
  advisory:   ['advised','consulted','recommended','strategized','proposed','presented',
               'liaised','negotiated','facilitated','trained'],
}

const RESPONSIBILITY_DOMAINS: Record<string, string[]> = {
  'people_management': ['team','hiring','performance review','appraisal','headcount','reports to','direct reports'],
  'client_management': ['client','customer','stakeholder','account','relationship','vendor'],
  'financial':         ['budget','p&l','revenue','cost','forecast','financial','mis','reporting'],
  'technical':         ['architecture','code','system','api','database','cloud','deployment','infrastructure'],
  'compliance':        ['compliance','regulatory','audit','risk','governance','policy','sox','sebi','rbi'],
  'strategy':          ['strategy','roadmap','planning','growth','business development','expansion'],
  'operations':        ['operations','process','workflow','sop','efficiency','quality','delivery'],
  'tax_advisory':      ['transfer pricing','corporate tax','tax planning','tax advisory','tax compliance','gst','income tax'],
}

function extractResponsibilitySignals(text: string): { verbs: Set<string>; domains: Set<string> } {
  const lower  = text.toLowerCase()
  const verbs  = new Set<string>()
  const domains = new Set<string>()

  for (const [, verbList] of Object.entries(ACTION_VERBS))
    for (const v of verbList)
      if (lower.includes(v)) verbs.add(v)

  for (const [domain, keywords] of Object.entries(RESPONSIBILITY_DOMAINS))
    if (keywords.some(k => lower.includes(k))) domains.add(domain)

  return { verbs, domains }
}

function scoreResponsibility(
  resumeRawText: string | undefined,
  jobDescription: string | null | undefined,
  jobTitle: string
): { score: number; responsibility_verdict: string } {

  if (!resumeRawText || resumeRawText.trim().length < 100)
    return { score: 8, responsibility_verdict: 'Resume text unavailable — scored conservatively' }

  if (!jobDescription || jobDescription.trim().length < 50) {
    const titleLower  = jobTitle.toLowerCase()
    const resumeLower = resumeRawText.toLowerCase()
    const titleWords  = titleLower.split(/\s+/).filter(w => w.length>3 && !STOP_WORDS.has(w))
    const hits        = titleWords.filter(w => resumeLower.includes(w))
    const ratio       = titleWords.length > 0 ? hits.length / titleWords.length : 0
    return {
      score: Math.round(ratio * 14),
      responsibility_verdict: `Job description not available — matched on title keywords (${hits.length}/${titleWords.length})`,
    }
  }

  const jdSignals     = extractResponsibilitySignals(jobDescription)
  const resumeSignals = extractResponsibilitySignals(resumeRawText)

  const domainOverlap = [...jdSignals.domains].filter(d => resumeSignals.domains.has(d))
  const domainScore   = jdSignals.domains.size > 0
    ? Math.round((domainOverlap.length / jdSignals.domains.size) * 12) : 8

  const verbOverlap = [...jdSignals.verbs].filter(v => resumeSignals.verbs.has(v))
  const verbScore   = jdSignals.verbs.size > 0
    ? Math.round((verbOverlap.length / Math.max(jdSignals.verbs.size, 1)) * 8) : 4

  const score = Math.min(20, domainScore + verbScore)

  const verdict = score >= 16
    ? `Strong alignment — ${domainOverlap.length} matching responsibility areas`
    : score >= 10
      ? `Partial alignment — ${domainOverlap.length} of ${jdSignals.domains.size} responsibility areas match`
      : `Low alignment — role responsibilities differ significantly from candidate background`

  return { score, responsibility_verdict: verdict }
}

// ─── Layer 4: Education & Certifications (0–10) ───────────────────────────────

const EDU_RANK: Record<string, number> = {
  'phd':9, 'ca / cpa':8, 'ca':8, 'cpa':8, 'icai':8, 'chartered accountant':8,
  'mba':7, 'pgdm':7,
  'master':6, 'm.tech':6, 'm.e':6, 'm.sc':6, 'm.com':6, 'm.a':6, 'mca':6, 'post graduate':6,
  'b.tech':5, 'b.e':5,
  'bca':4, 'bba':4, 'b.sc':4, 'b.com':4, 'b.a':4, 'bachelor':4,
  'diploma':2, 'any':1, '':1,
}

const STRICT_PROFESSIONS: Record<string, string[]> = {
  'ca / cpa': ['ca','cpa','chartered accountant','icai','ca / cpa'],
  'ca':       ['ca','cpa','chartered accountant','icai','ca / cpa'],
  'cpa':      ['ca','cpa','chartered accountant','icai','ca / cpa'],
  'llb':      ['llb','llm','law','ba llb','bba llb'],
  'mbbs':     ['mbbs','md','ms','bds','bams'],
  'phd':      ['phd','ph.d','doctor of philosophy'],
}

const CERT_KEYWORDS: Record<string, string[]> = {
  'aws':      ['aws certified','amazon web services certified','aws solutions architect','aws developer'],
  'pmp':      ['pmp','project management professional'],
  'cfa':      ['cfa','chartered financial analyst'],
  'ca':       ['ca final','icai','chartered accountant','ca inter'],
  'cissp':    ['cissp','certified information systems security'],
  'gcp':      ['google cloud certified','gcp certified'],
  'azure':    ['microsoft certified azure','az-900','az-104','az-204'],
  'scrum':    ['scrum master','csm','certified scrum'],
  'six_sigma':['six sigma','lean six sigma','black belt','green belt'],
}

function scoreEducation(
  candidateDegree: string | undefined,
  candidateLevel: string | undefined,
  jobEduRequirement: string | null | undefined,
  resumeRawText?: string
): { score: number; education_verdict: string } {

  if (!jobEduRequirement?.trim() || normalizeStr(jobEduRequirement) === 'any')
    return { score: 8, education_verdict: 'No specific education requirement' }

  if (!candidateDegree && !candidateLevel)
    return { score: 3, education_verdict: 'Education not found in resume — verify manually' }

  const jobReq  = normalizeStr(jobEduRequirement)
  const candDeg = normalizeStr(candidateDegree || '')
  const candLvl = normalizeStr(candidateLevel  || '')

  for (const [reqKey, qualifiers] of Object.entries(STRICT_PROFESSIONS)) {
    if (jobReq.includes(reqKey) || reqKey.includes(jobReq)) {
      const isQualified = qualifiers.some(q => candDeg.includes(q) || candLvl.includes(q))
      const inText      = resumeRawText
        ? qualifiers.some(q => resumeRawText.toLowerCase().includes(q))
        : false
      if (isQualified || inText)
        return { score: 8, education_verdict: `Qualified — ${candidateDegree || candidateLevel} meets ${jobEduRequirement}` }
      return { score: 0, education_verdict: `Not qualified — ${jobEduRequirement} required, candidate has ${candidateDegree || candidateLevel || 'unknown'}` }
    }
  }

  const jobRank = EDU_RANK[jobReq] ?? 4
  let candRank  = 1
  for (const [key, rank] of Object.entries(EDU_RANK))
    if ((candDeg.includes(key) || candLvl.includes(key)) && rank > candRank) candRank = rank

  let baseScore = 0, verdict = ''
  const gap     = jobRank - candRank

  if (candRank >= jobRank) {
    baseScore = 8; verdict = `Qualified — ${candidateDegree || candidateLevel} meets requirement`
  } else if (gap === 1) {
    baseScore = 5; verdict = `Slightly below — ${candidateDegree || candidateLevel} (required: ${jobEduRequirement})`
  } else if (gap === 2) {
    baseScore = 2; verdict = `Below requirement — ${candidateDegree || candidateLevel} (required: ${jobEduRequirement})`
  } else {
    baseScore = 0; verdict = `Does not meet — ${candidateDegree || candidateLevel} vs ${jobEduRequirement}`
  }

  let certBonus = 0
  if (resumeRawText) {
    const lower = resumeRawText.toLowerCase()
    for (const keywords of Object.values(CERT_KEYWORDS))
      if (keywords.some(k => lower.includes(k))) { certBonus++; break }
    if (certBonus > 0) verdict += ' · Certifications detected'
  }

  return { score: Math.min(10, baseScore + certBonus), education_verdict: verdict }
}

// ─── Layer 5: Career Stability (0–10) ────────────────────────────────────────

function scoreCareerStability(
  totalExp: number | null,
  resumeRawText?: string
): { score: number; stability_verdict: string } {

  if (!resumeRawText || resumeRawText.trim().length < 100)
    return { score: 6, stability_verdict: 'Resume text unavailable — scored conservatively' }

  const months = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
  const MONTH_MAP: Record<string, number> = {
    jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
  }

  const rangeRegex = new RegExp(
    `(${months})[a-z]*[\\s,]+(\\d{4})\\s*[–\\-—to]+\\s*(Present|Current|Till\\s*Date|(${months})[a-z]*[\\s,]+(\\d{4}))`,
    'gi'
  )

  const now = new Date()
  const durations: number[] = []

  for (const m of [...resumeRawText.matchAll(rangeRegex)]) {
    const startMon  = m[1].toLowerCase().slice(0, 3)
    const startYr   = parseInt(m[2])
    const startDate = new Date(startYr, (MONTH_MAP[startMon] || 1) - 1, 1)

    let endDate: Date
    if (/present|current|till/i.test(m[3])) {
      endDate = now
    } else if (m[4] && m[5]) {
      // ── fix: cast capture groups to string ──────────────────────────────
      const endMon = (m[4] as string).toLowerCase().slice(0, 3)
      endDate = new Date(parseInt(m[5] as string), (MONTH_MAP[endMon] || 1) - 1, 1)
    } else continue

    if (startDate > endDate || startYr < 1990) continue
    const dur = (endDate.getFullYear()-startDate.getFullYear())*12 + (endDate.getMonth()-startDate.getMonth())
    if (dur > 0 && dur < 600) durations.push(dur)
  }

  if (durations.length === 0) {
    const yearRangeRegex = /\b(\d{4})\s*[–\-—]\s*(Present|Current|\d{4})\b/gi
    for (const m of [...resumeRawText.matchAll(yearRangeRegex)]) {
      const startYr = parseInt(m[1])
      const endYr   = /present|current/i.test(m[2]) ? now.getFullYear() : parseInt(m[2])
      const dur     = (endYr - startYr) * 12
      if (dur > 0 && dur < 600 && startYr >= 1990) durations.push(dur)
    }
  }

  if (durations.length === 0) {
    if (totalExp !== null && totalExp > 0) {
      const score = totalExp >= 5 ? 8 : totalExp >= 3 ? 7 : 6
      return { score, stability_verdict: `${totalExp} yrs experience — tenure details not parsed` }
    }
    return { score: 6, stability_verdict: 'Job tenure data not found — verify manually' }
  }

  const numJobs     = durations.length
  const avgTenure   = durations.reduce((s,d) => s+d, 0) / numJobs
  const shortStints = durations.filter(d => d < 12).length
  const longStints  = durations.filter(d => d >= 24).length

  let score = 0
  if      (avgTenure >= 36) score = 10
  else if (avgTenure >= 24) score = 9
  else if (avgTenure >= 18) score = 8
  else if (avgTenure >= 12) score = 6
  else if (avgTenure >= 8)  score = 4
  else                      score = 2

  if      (shortStints >= 3) score = Math.max(0, score - 3)
  else if (shortStints >= 2) score = Math.max(0, score - 1)
  if (longStints >= 2)       score = Math.min(10, score + 1)

  const avgYrs = (avgTenure/12).toFixed(1)
  let verdict  = ''
  if      (score >= 8) verdict = `Stable career — avg ${avgYrs} yrs/role across ${numJobs} position${numJobs>1?'s':''}`
  else if (score >= 6) verdict = `Moderate stability — avg ${avgYrs} yrs/role`
  else if (score >= 4) verdict = `Some job-hopping — avg ${avgYrs} yrs/role, ${shortStints} short stint${shortStints>1?'s':''}`
  else                 verdict = `Frequent job changes — avg ${avgYrs} yrs/role, ${shortStints} role${shortStints>1?'s':''} under 1 yr`

  return { score, stability_verdict: verdict }
}

// ─── Layer 6: Location Match (0–5) ───────────────────────────────────────────

const METRO_CLUSTERS: string[][] = [
  ['delhi','new delhi','noida','gurgaon','gurugram','faridabad','ghaziabad','greater noida','ncr'],
  ['mumbai','navi mumbai','thane','pune'],
  ['bangalore','bengaluru','electronic city','whitefield'],
  ['hyderabad','secunderabad','cyberabad'],
  ['chennai','ambattur','tambaram'],
  ['kolkata','salt lake','howrah'],
  ['ahmedabad','gandhinagar'],
]

const STATE_CITIES: Record<string, string[]> = {
  'maharashtra':  ['mumbai','pune','nagpur','nashik','thane','navi mumbai'],
  'karnataka':    ['bangalore','bengaluru','mysore','hubli','mangalore'],
  'telangana':    ['hyderabad','secunderabad','warangal'],
  'tamilnadu':    ['chennai','coimbatore','madurai','salem'],
  'delhi':        ['delhi','new delhi','noida','gurgaon','gurugram','faridabad'],
  'gujarat':      ['ahmedabad','surat','vadodara','rajkot','gandhinagar'],
  'rajasthan':    ['jaipur','jodhpur','udaipur','kota'],
  'uttarpradesh': ['noida','lucknow','kanpur','agra','varanasi','ghaziabad'],
  'madhyapradesh':['bhopal','indore','gwalior','jabalpur'],
  'haryana':      ['gurgaon','gurugram','faridabad','ambala'],
  'punjab':       ['chandigarh','ludhiana','amritsar','jalandhar'],
  'westbengal':   ['kolkata','howrah','durgapur'],
}

function nc(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g,' ').replace(/[.,\-–]/g,'').split(',')[0].trim()
}

function scoreLocation(
  candidateLocation: string | undefined,
  jobLocation: string | null | undefined
): { score: number; location_verdict: string } {

  if (jobLocation && /remote|wfh|work\s+from\s+home|anywhere/i.test(jobLocation))
    return { score: 5, location_verdict: 'Remote role — location not a factor' }

  if (!candidateLocation || !jobLocation)
    return { score: 3, location_verdict: 'Location data unavailable — verify manually' }

  const c = nc(candidateLocation), j = nc(jobLocation)

  if (c===j || c.includes(j) || j.includes(c))
    return { score: 5, location_verdict: `Location match — ${candidateLocation}` }

  for (const cluster of METRO_CLUSTERS) {
    const cIn = cluster.some(x => c.includes(x)||x.includes(c))
    const jIn = cluster.some(x => j.includes(x)||x.includes(j))
    if (cIn && jIn) return { score: 4, location_verdict: `Same metro — ${candidateLocation} → ${jobLocation}` }
  }

  for (const cities of Object.values(STATE_CITIES)) {
    const cIn = cities.some(x => c.includes(x)||x.includes(c))
    const jIn = cities.some(x => j.includes(x)||x.includes(j))
    if (cIn && jIn) return { score: 2, location_verdict: `Same state — ${candidateLocation} vs ${jobLocation}` }
  }

  if (/dubai|abu dhabi|uae|singapore|london|usa|uk|germany|australia/i.test(jobLocation))
    return { score: 0, location_verdict: `International role — ${candidateLocation} vs ${jobLocation}` }

  return { score: 0, location_verdict: `Different location — ${candidateLocation} vs ${jobLocation} (relocation needed)` }
}

// ─── Layer 7: Industry Fit (0–5) ─────────────────────────────────────────────

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  'fintech':      ['fintech','banking','payments','neobank','nbfc','insurance','stock','trading','wealth'],
  'saas':         ['saas','b2b software','cloud software','product company','software product'],
  'ecommerce':    ['ecommerce','e-commerce','retail','marketplace','d2c','online shopping'],
  'healthtech':   ['healthtech','healthcare','hospital','pharma','clinical','medical','diagnostics'],
  'edtech':       ['edtech','education','learning','school','university','coaching','lms'],
  'logistics':    ['logistics','supply chain','delivery','courier','freight','transportation'],
  'taxation':     ['ca firm','tax firm','taxation','transfer pricing','big4','deloitte','pwc','ey','kpmg','bdo'],
  'audit':        ['audit firm','statutory audit','assurance','accounting firm'],
  'consulting':   ['consulting','management consulting','advisory','strategy consulting'],
  'manufacturing':['manufacturing','factory','plant','fmcg','industrial','automotive'],
  'realestate':   ['real estate','property','construction','realty','builder'],
  'staffing':     ['staffing','recruitment','rpo','executive search','placement'],
  'it_services':  ['it services','software services','outsourcing','offshore','it company'],
}

function scoreIndustry(
  resumeRawText: string | undefined,
  currentCompany: string | undefined,
  jobTitle: string,
  jobDescription: string | undefined   // ── fix: undefined only (null stripped at call site)
): { score: number; industry_verdict: string } {

  if (!resumeRawText) return { score: 3, industry_verdict: 'Industry data unavailable' }

  const resumeText       = `${resumeRawText} ${currentCompany || ''}`.toLowerCase()
  const jdText           = `${jobTitle} ${jobDescription || ''}`.toLowerCase()
  const resumeIndustries = new Set<string>()
  const jobIndustries    = new Set<string>()

  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some(k => resumeText.includes(k))) resumeIndustries.add(industry)
    if (keywords.some(k => jdText.includes(k)))     jobIndustries.add(industry)
  }

  if (jobIndustries.size === 0) return { score: 3, industry_verdict: 'Industry not specified in job' }

  const overlap = [...jobIndustries].filter(i => resumeIndustries.has(i))
  if (overlap.length > 0)
    return { score: Math.min(5, overlap.length * 3), industry_verdict: `Industry match — ${overlap.join(', ')} background` }

  const ADJACENT: Record<string, string[]> = {
    'fintech':     ['banking','saas','ecommerce'],
    'taxation':    ['audit','consulting','fintech'],
    'audit':       ['taxation','consulting','fintech'],
    'healthtech':  ['pharma','consulting'],
    'edtech':      ['saas','consulting'],
    'it_services': ['saas','consulting'],
  }

  for (const jobInd of jobIndustries) {
    const adj = ADJACENT[jobInd] || []
    if (adj.some(a => resumeIndustries.has(a)))
      return { score: 2, industry_verdict: 'Adjacent industry background — transferable experience possible' }
  }

  return {
    score: 0,
    industry_verdict: `Different industry — ${[...resumeIndustries].slice(0,2).join(', ') || 'background unclear'} vs ${[...jobIndustries].join(', ')}`,
  }
}

// ─── Dynamic Recommendation Thresholds ───────────────────────────────────────

function getThresholds(skillCount: number): { shortlist: number; maybe: number } {
  if (skillCount <= 3)  return { shortlist: 72, maybe: 48 }
  if (skillCount <= 6)  return { shortlist: 65, maybe: 43 }
  if (skillCount <= 9)  return { shortlist: 60, maybe: 38 }
  return                       { shortlist: 55, maybe: 35 }
}

// ─── Summary Generator ───────────────────────────────────────────────────────

function generateSummary(
  r: Omit<MatchResult,'summary'>,
  thresholds: { shortlist: number; maybe: number }
): string {
  const { match_score, matched_skills, missing_skills, text_extracted_skills,
          partial_skills, experience_verdict, education_verdict,
          location_verdict, stability_verdict, industry_verdict } = r

  const parts: string[] = []
  const totalFound = matched_skills.length + partial_skills.length + text_extracted_skills.length

  if (matched_skills.length > 0) {
    const listed = matched_skills.slice(0,3).join(', ')
    const extra  = matched_skills.length > 3 ? ` +${matched_skills.length-3} more` : ''
    parts.push(`Matches ${matched_skills.length} skill${matched_skills.length>1?'s':''} (${listed}${extra})`)
  } else if (totalFound > 0) {
    parts.push(`${totalFound} skill${totalFound>1?'s':''} found via text/alias matching`)
  } else {
    parts.push('No required skills matched')
  }

  if (missing_skills.length > 0) {
    const gaps  = missing_skills.slice(0,2).join(', ')
    const extra = missing_skills.length > 2 ? ` +${missing_skills.length-2} more` : ''
    parts.push(`missing ${gaps}${extra}`)
  }

  if (experience_verdict && !experience_verdict.toLowerCase().includes('not found'))
    parts.push(experience_verdict.toLowerCase())
  if (education_verdict && !education_verdict.toLowerCase().includes('not found'))
    parts.push(education_verdict.toLowerCase())
  if (stability_verdict && !stability_verdict.toLowerCase().includes('not found'))
    parts.push(stability_verdict.toLowerCase())
  if (industry_verdict &&
      !industry_verdict.toLowerCase().includes('unavailable') &&
      !industry_verdict.toLowerCase().includes('not specified'))
    parts.push(industry_verdict.toLowerCase())
  if (location_verdict && !location_verdict.toLowerCase().includes('unavailable'))
    parts.push(location_verdict.toLowerCase())

  const verdict =
    match_score >= thresholds.shortlist ? 'Strong candidate — recommended for shortlist.' :
    match_score >= thresholds.maybe     ? 'Partial match — recommend manual review.'      :
    'Significant gaps — recommend rejecting.'

  return parts.join('; ') + '. ' + verdict
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function matchResumeToJob(input: MatchInput): MatchResult {
  const { resume, job } = input

  const skillsResult    = scoreSkills(resume.skills, job.key_skills, job.nice_to_have_skills, resume.rawText)
  const expResult       = scoreExperience(
    resume.total_experience, job.experience_min, job.experience_max,
    resume.rawText, job.job_title,
    job.job_description ?? undefined    // ── fix: strip null → undefined
  )
  const respResult      = scoreResponsibility(resume.rawText, job.job_description, job.job_title)
  const eduResult       = scoreEducation(resume.education_degree, resume.education_level, job.education_requirement, resume.rawText)
  const stabilityResult = scoreCareerStability(resume.total_experience, resume.rawText)
  const locResult       = scoreLocation(resume.current_location, job.location)
  const industryResult  = scoreIndustry(
    resume.rawText, resume.current_company, job.job_title,
    job.job_description ?? undefined    // ── fix: strip null → undefined
  )

  const breakdown = {
    skills_score:         skillsResult.score,
    experience_score:     expResult.score,
    responsibility_score: respResult.score,
    education_score:      eduResult.score,
    stability_score:      stabilityResult.score,
    location_score:       locResult.score,
    industry_score:       industryResult.score,
  }

  const match_score = Math.min(100,
    breakdown.skills_score +
    breakdown.experience_score +
    breakdown.responsibility_score +
    breakdown.education_score +
    breakdown.stability_score +
    breakdown.location_score +
    breakdown.industry_score
  )

  const skillCount = parseJobSkills(job.key_skills).length
  const thresholds = getThresholds(skillCount)

  const recommendation: MatchResult['recommendation'] =
    match_score >= thresholds.shortlist ? 'shortlist' :
    match_score >= thresholds.maybe     ? 'maybe'     : 'reject'

  const partial: Omit<MatchResult,'summary'> = {
    match_score, recommendation, breakdown,
    matched_skills:        skillsResult.matched_skills,
    missing_skills:        skillsResult.missing_skills,
    partial_skills:        skillsResult.partial_skills,
    text_extracted_skills: skillsResult.text_extracted_skills,
    experience_verdict:    expResult.experience_verdict,
    education_verdict:     eduResult.education_verdict,
    location_verdict:      locResult.location_verdict,
    stability_verdict:     stabilityResult.stability_verdict,
    industry_verdict:      industryResult.industry_verdict,
  }

  return { ...partial, summary: generateSummary(partial, thresholds) }
}