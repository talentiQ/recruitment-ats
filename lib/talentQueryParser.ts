// lib/talentQueryParser.ts
// Smart rule-based NLP for recruitment search — no external dependencies

export interface ParsedFilters {
  skills: string[]

  // unified naming
  excludedSkills: string[]

  locations: string[]

  experience: {
    min: number | null
    max: number | null
  }

  ctc: {
    min: number | null
    max: number | null
  }

  noticePeriod: string | null
  domains: string[]
  seniority: 'junior' | 'mid' | 'senior' | 'lead' | null
  skillMode: 'any' | 'all' | 'boolean'
  requirementKeywords: string[]
  rawIntent: string
}

// ── 1. Skill aliases — fuzzy + abbreviation handling ─────────────────────────
// Key = canonical name stored in DB, values = all aliases that should match it
const SKILL_ALIASES: Record<string, string[]> = {
  'JavaScript':       ['js', 'javascript', 'java script', 'es6', 'es2015', 'ecmascript', 'vanilla js'],
  'TypeScript':       ['ts', 'typescript', 'type script'],
  'Java':             ['java', 'core java', 'java8', 'java 8', 'java11'],
  'Python':           ['python', 'python3', 'py'],
  'C++':              ['c++', 'cpp', 'c plus plus'],
  'C#':               ['c#', 'csharp', 'c sharp', 'dotnet', '.net'],
  'Go':               ['go', 'golang'],
  'Ruby':             ['ruby', 'ruby on rails', 'ror'],
  'PHP':              ['php', 'laravel', 'symfony'],
  'Swift':            ['swift', 'ios swift'],
  'Kotlin':           ['kotlin', 'android kotlin'],
  'React':            ['react', 'reactjs', 'react.js', 'react js'],
  'Angular':          ['angular', 'angularjs', 'angular.js', 'ng'],
  'Vue':              ['vue', 'vuejs', 'vue.js'],
  'Next.js':          ['nextjs', 'next.js', 'next js', 'nextjsapp'],
  'Node.js':          ['node', 'nodejs', 'node.js', 'node js', 'express', 'expressjs'],
  'Spring Boot':      ['springboot', 'spring boot', 'spring mvc', 'spring framework', 'spring'],
  'Django':           ['django', 'django rest framework', 'drf'],
  'Flask':            ['flask'],
  'FastAPI':          ['fastapi', 'fast api'],
  'AWS':              ['aws', 'amazon web services', 'amazon cloud', 'ec2', 's3', 'lambda'],
  'Azure':            ['azure', 'microsoft azure', 'azure cloud'],
  'GCP':              ['gcp', 'google cloud', 'google cloud platform'],
  'Docker':           ['docker', 'containerization', 'containers'],
  'Kubernetes':       ['kubernetes', 'k8s', 'k8', 'kube', 'kubectl', 'helm'],
  'DevOps':           ['devops', 'dev ops', 'devsecops', 'site reliability', 'sre'],
  'Terraform':        ['terraform', 'iac', 'infrastructure as code'],
  'Jenkins':          ['jenkins', 'ci/cd', 'cicd', 'ci cd', 'github actions', 'gitlab ci'],
  'Linux':            ['linux', 'unix', 'ubuntu', 'centos', 'bash', 'shell scripting'],
  'MySQL':            ['mysql', 'my sql'],
  'PostgreSQL':       ['postgresql', 'postgres', 'pg', 'psql'],
  'MongoDB':          ['mongodb', 'mongo', 'nosql'],
  'Redis':            ['redis', 'cache', 'caching'],
  'Elasticsearch':    ['elasticsearch', 'elastic search', 'elk', 'kibana', 'logstash'],
  'React Native':     ['react native', 'reactnative', 'rn'],
  'Flutter':          ['flutter', 'dart'],
  'Machine Learning': ['ml', 'machine learning', 'machinelearning'],
  'Deep Learning':    ['dl', 'deep learning', 'deeplearning'],
  'TensorFlow':       ['tensorflow', 'tf', 'keras'],
  'PyTorch':          ['pytorch', 'torch'],
  'Data Science':     ['data science', 'data scientist', 'datascience'],
  'Power BI':         ['power bi', 'powerbi', 'pbi'],
  'Tableau':          ['tableau', 'data visualization', 'data viz'],
  'SQL':              ['sql', 'pl/sql', 'plsql', 't-sql', 'tsql', 'stored procedures'],
  'GraphQL':          ['graphql', 'graph ql', 'apollo'],
  'REST API':         ['rest', 'rest api', 'restful', 'api development', 'restapi'],
  'Microservices':    ['microservices', 'micro services', 'distributed systems'],
  'Salesforce':       ['salesforce', 'sfdc', 'crm salesforce'],
  'SAP':              ['sap', 'sap abap', 'sap hana', 'sap mm', 'sap fi'],
  'Agile':            ['agile', 'scrum', 'kanban', 'jira', 'sprint'],
  'Sales':            ['sales', 'b2b sales', 'b2c sales', 'inside sales', 'field sales', 'enterprise sales'],
  'CRM':              ['crm', 'customer relationship', 'zoho crm', 'hubspot'],
  'HR':               ['hr', 'human resources', 'hrbp', 'human resource'],
  'Recruitment':      ['recruitment', 'talent acquisition', 'ta', 'sourcing', 'headhunting'],
  'Payroll':          ['payroll', 'payroll processing', 'salary processing'],
  'Tally':            ['tally', 'tally erp', 'tally prime'],
  'Excel':            ['excel', 'ms excel', 'advanced excel', 'vlookup', 'pivot table'],
  'Android':          ['android', 'android development'],
  'iOS':              ['ios', 'ios development', 'swift ios', 'objective-c'],
  'Cybersecurity':    ['cybersecurity', 'cyber security', 'infosec', 'information security', 'vapt', 'penetration testing'],
  'Blockchain':       ['blockchain', 'solidity', 'web3', 'ethereum', 'smart contracts'],
  'Figma':            ['figma', 'ui design', 'ux design', 'ui/ux', 'wireframing', 'prototyping'],
}

// ── 2. Location aliases — city nicknames + regions ────────────────────────────
const LOCATION_ALIASES: Record<string, string> = {
  // NCR region
  'ncr':          'Noida',
  'delhi ncr':    'Delhi',
  'new delhi':    'Delhi',
  'dilli':        'Delhi',
  'gurugram':     'Gurgaon',
  'dl':           'Delhi',
  // Bangalore
  'bengaluru':    'Bangalore',
  'blr':          'Bangalore',
  'bang':         'Bangalore',
  // Mumbai
  'bombay':       'Mumbai',
  'mum':          'Mumbai',
  'bom':          'Mumbai',
  'navi mumbai':  'Mumbai',
  'thane':        'Mumbai',
  // Hyderabad
  'hyd':          'Hyderabad',
  'cyberabad':    'Hyderabad',
  'secunderabad': 'Hyderabad',
  // Others
  'pune':         'Pune',
  'chennai':      'Chennai',
  'madras':       'Chennai',
  'kolkata':      'Kolkata',
  'calcutta':     'Kolkata',
  'ahmedabad':    'Ahmedabad',
  'amdavad':      'Ahmedabad',
  'jaipur':       'Jaipur',
  'pink city':    'Jaipur',
  'lucknow':      'Lucknow',
  'chandigarh':   'Chandigarh',
  'indore':       'Indore',
  'coimbatore':   'Coimbatore',
  'cbe':          'Coimbatore',
  'kochi':        'Kochi',
  'cochin':       'Kochi',
  'noida':        'Noida',
  'gurgaon':      'Gurgaon',
  'delhi':        'Delhi',
  'bangalore':    'Bangalore',
  'mumbai':       'Mumbai',
  'hyderabad':    'Hyderabad',
}

// ── 3. Industry aliases ───────────────────────────────────────────────────────
const INDUSTRY_ALIASES: Record<string, string> = {
  'it':             'IT / Technology',
  'tech':           'IT / Technology',
  'technology':     'IT / Technology',
  'software':       'IT / Technology',
  'fintech':        'Finance / Accounting',
  'finance':        'Finance / Accounting',
  'banking':        'Banking / Financial Services',
  'bfsi':           'Banking / Financial Services',
  'insurance':      'Banking / Financial Services',
  'sales':          'Sales / Marketing',
  'marketing':      'Sales / Marketing',
  'digital marketing': 'Sales / Marketing',
  'ecommerce':      'Sales / Marketing',
  'e-commerce':     'Sales / Marketing',
  'retail':         'Sales / Marketing',
  'healthcare':     'Healthcare / Pharma',
  'pharma':         'Healthcare / Pharma',
  'pharmaceutical': 'Healthcare / Pharma',
  'hospital':       'Healthcare / Pharma',
  'manufacturing':  'Manufacturing / Engineering',
  'engineering':    'Manufacturing / Engineering',
  'automobile':     'Manufacturing / Engineering',
  'automotive':     'Manufacturing / Engineering',
  'hr':             'HR / Recruitment',
  'recruitment':    'HR / Recruitment',
  'staffing':       'HR / Recruitment',
  'education':      'Education / Training',
  'edtech':         'Education / Training',
  'logistics':      'Operations / Supply Chain',
  'supply chain':   'Operations / Supply Chain',
  'operations':     'Operations / Supply Chain',
  'legal':          'Legal / Compliance',
  'consulting':     'Consulting',
}

// ── 4. Seniority → experience range mapping ───────────────────────────────────
const SENIORITY_MAP: Record<string, { min: number; max: number; level: 'junior' | 'mid' | 'senior' | 'lead' }> = {
  'fresher':      { min: 0,  max: 1,  level: 'junior' },
  'entry level':  { min: 0,  max: 2,  level: 'junior' },
  'junior':       { min: 1,  max: 3,  level: 'junior' },
  'associate':    { min: 1,  max: 4,  level: 'junior' },
  'mid level':    { min: 3,  max: 6,  level: 'mid'    },
  'mid-level':    { min: 3,  max: 6,  level: 'mid'    },
  'experienced':  { min: 4,  max: 8,  level: 'mid'    },
  'senior':       { min: 5,  max: 12, level: 'senior' },
  'sr':           { min: 5,  max: 12, level: 'senior' },
  'lead':         { min: 6,  max: 15, level: 'lead'   },
  'tech lead':    { min: 6,  max: 15, level: 'lead'   },
  'principal':    { min: 8,  max: 20, level: 'lead'   },
  'staff':        { min: 7,  max: 18, level: 'lead'   },
  'architect':    { min: 8,  max: 25, level: 'lead'   },
  'manager':      { min: 5,  max: 15, level: 'lead'   },
  'vp':           { min: 10, max: 30, level: 'lead'   },
  'director':     { min: 10, max: 30, level: 'lead'   },
  'head':         { min: 8,  max: 25, level: 'lead'   },
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PARSER
// ─────────────────────────────────────────────────────────────────────────────

export function parseRecruitmentQuery(query: string): ParsedFilters {
  const original = query
  const q        = query.toLowerCase().trim()

  // ── Negation: extract NOT/no/without phrases before main parsing ──────────
  const excludedSkills: string[] = []
  const negationPattern = /(?:not|no|without|except|excluding|avoid)\s+([a-z][a-z0-9\s.#+]*?)(?=\s+(?:and|or|with|from|in|,)|$)/gi
  let cleanedQ = q
  let negMatch: RegExpExecArray | null
  while ((negMatch = negationPattern.exec(q)) !== null) {
    const negatedTerm = negMatch[1].trim()
    const canonical   = resolveSkill(negatedTerm)
    if (canonical) {
      excludedSkills.push(canonical)
      cleanedQ = cleanedQ.replace(negMatch[0], ' ')
    }
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  const skills = extractSkills(cleanedQ, excludedSkills)

  // ── Location ──────────────────────────────────────────────────────────────
  const location = extractLocation(cleanedQ)

  // ── Experience ────────────────────────────────────────────────────────────
  let { expMin, expMax } = extractExperience(cleanedQ)

  // ── Seniority — infer exp range if not explicitly stated ─────────────────
  let seniority: ParsedFilters['seniority'] = null
  for (const [key, val] of Object.entries(SENIORITY_MAP)) {
    if (cleanedQ.includes(key)) {
      seniority = val.level
      // Only override exp if not already specified
      if (expMin === null && expMax === null) {
        expMin = val.min
        expMax = val.max
      }
      break
    }
  }

  // ── CTC ───────────────────────────────────────────────────────────────────
  const { ctcMin, ctcMax } = extractCTC(cleanedQ)

  // ── Notice period ─────────────────────────────────────────────────────────
  const noticePeriod = extractNoticePeriod(cleanedQ)

  // ── Industry ──────────────────────────────────────────────────────────────
  const industry = extractIndustry(cleanedQ)

  // ── Skill mode — ALL if "and" appears between skill terms ─────────────────
  const hasAnd = /\b(and|&)\b/.test(cleanedQ) && skills.length > 1
  const hasAll = /\ball\b/.test(cleanedQ)
  const skillMode: 'any' | 'all' = (hasAnd || hasAll) ? 'all' : 'any'

  // ── Build human-readable intent string ───────────────────────────────────
  const parts: string[] = []
  if (seniority)            parts.push(seniority)
  if (skills.length)        parts.push(`skills: ${skills.join(', ')}`)
  if (excludedSkills.length) parts.push(`excluding: ${excludedSkills.join(', ')}`)
  if (location)             parts.push(`in ${location}`)
  if (expMin || expMax)     parts.push(`${expMin ?? 0}–${expMax ?? '∞'} yrs`)
  if (ctcMax)               parts.push(`CTC ≤${ctcMax} LPA`)
  if (noticePeriod)         parts.push(`notice ${noticePeriod}d`)
  if (industry)             parts.push(`industry: ${industry}`)
  const rawIntent = parts.join(' · ') || original

  return {
  skills,
  excludedSkills,
  locations: location ? [location] : [],
  experience: {min: expMin,max: expMax,},
  ctc: {min: ctcMin,max: ctcMax,},
  noticePeriod,
  domains: industry ? [industry] : [],
  seniority,
  skillMode,
  requirementKeywords: [],
  rawIntent,
}
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Resolve a raw term to its canonical skill name
function resolveSkill(term: string): string | null {
  const t = term.toLowerCase().trim()
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    if (aliases.includes(t)) return canonical
  }
  return null
}

function extractSkills(q: string, exclude: string[]): string[] {
  const found: string[] = []

  // Sort by alias length descending — match longest first to avoid "node" eating "node.js"
  const allPairs: Array<{ canonical: string; alias: string }> = []
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    for (const alias of aliases) {
      allPairs.push({ canonical, alias })
    }
  }
  allPairs.sort((a, b) => b.alias.length - a.alias.length)

  let remaining = q
  for (const { canonical, alias } of allPairs) {
    // Word-boundary aware match
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re      = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`)
    if (re.test(remaining)) {
      if (!found.includes(canonical) && !exclude.includes(canonical)) {
        found.push(canonical)
      }
      // Remove matched alias from string to avoid double-matching
      remaining = remaining.replace(new RegExp(escaped, 'g'), ' ')
    }
  }

  return found
}

function extractLocation(q: string): string | null {
  // Check aliases first (longest first for multi-word like "delhi ncr")
  const sortedAliases = Object.entries(LOCATION_ALIASES)
    .sort((a, b) => b[0].length - a[0].length)

  for (const [alias, canonical] of sortedAliases) {
    if (q.includes(alias)) return canonical
  }

  // Fallback: "from X", "in X", "at X", "based in X"
  const locMatch = q.match(/(?:from|in|at|based\s+in|location[:\s]+)\s+([a-z]+(?:\s+[a-z]+)?)/)
  if (locMatch) {
    const raw       = locMatch[1].trim()
    const canonical = LOCATION_ALIASES[raw]
    if (canonical) return canonical
    // Return title-cased if not in our list (e.g. smaller cities)
    return raw.replace(/\b\w/g, c => c.toUpperCase())
  }

  return null
}

function extractExperience(q: string): { expMin: number | null; expMax: number | null } {
  // "3-6 yrs", "3–6 years", "3 to 6 yrs"
  const rangeMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:yr|year|yrs|years|y\b)/)
  if (rangeMatch) return { expMin: parseFloat(rangeMatch[1]), expMax: parseFloat(rangeMatch[2]) }

  let expMin: number | null = null
  let expMax: number | null = null

  // "5+ years", "minimum 5 years", "at least 5 years", "over 5 years"
  const minMatch = q.match(/(\d+(?:\.\d+)?)\s*\+\s*(?:yr|year|yrs|years|y\b)|(?:min(?:imum)?|at\s+least|over|more\s+than)\s+(\d+(?:\.\d+)?)\s*(?:yr|year|yrs|years)/)
  if (minMatch) expMin = parseFloat(minMatch[1] ?? minMatch[2])

  // "up to 8 yrs", "max 8", "under 10 years", "less than 5 years"
  const maxMatch = q.match(/(?:up\s+to|max(?:imum)?|under|less\s+than|below|upto)\s+(\d+(?:\.\d+)?)\s*(?:yr|year|yrs|years|y\b)/)
  if (maxMatch) expMax = parseFloat(maxMatch[1])

  // Standalone: "8 years experience" / "experience: 8"
  if (!expMin && !expMax) {
    const standalone = q.match(/(\d+(?:\.\d+)?)\s*(?:yr|year|yrs|years)\s*(?:of\s+)?exp/)
                    || q.match(/exp(?:erience)?[:\s]+(\d+(?:\.\d+)?)/)
    if (standalone) {
      const v   = parseFloat(standalone[1])
      expMin    = Math.max(0, v - 1)
      expMax    = v + 2
    }
  }

  return { expMin, expMax }
}

function extractCTC(q: string): { ctcMin: number | null; ctcMax: number | null } {
  // Normalize "k" → treat as thousands if < 100, else as-is
  // "15 LPA", "15L", "15 lakh", "1500000"

  const normalizeCTC = (val: string): number => {
    const n = parseFloat(val)
    // If value > 100, assume it's in thousands (e.g. "800k" = 800k INR ≈ 8 LPA)
    if (n > 100) return Math.round(n / 100000 * 10) / 10
    return n
  }

  // Range: "10-15 LPA", "10 to 15 lakhs"
  const rangeMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|l\b|lac|ctc)/)
  if (rangeMatch) return { ctcMin: normalizeCTC(rangeMatch[1]), ctcMax: normalizeCTC(rangeMatch[2]) }

  let ctcMin: number | null = null
  let ctcMax: number | null = null

  // Max: "under 15 LPA", "below 20", "up to 12 LPA", "budget 15"
  const maxMatch = q.match(/(?:under|below|less\s+than|up\s+to|upto|max(?:imum)?|budget)\s+(\d+(?:\.\d+)?)\s*(?:lpa|lakh|l\b|lac|ctc)?/)
  if (maxMatch) ctcMax = normalizeCTC(maxMatch[1])

  // Min: "above 10 LPA", "min 8 LPA", "at least 12", "more than 10"
  const minMatch = q.match(/(?:above|over|min(?:imum)?|at\s+least|more\s+than)\s+(\d+(?:\.\d+)?)\s*(?:lpa|lakh|l\b|lac|ctc)?/)
  if (minMatch) ctcMin = normalizeCTC(minMatch[1])

  return { ctcMin, ctcMax }
}

function extractNoticePeriod(q: string): string | null {
  if (/\b(?:immediate|immediately|serving\s+notice|no\s+notice|0\s*day|zero\s+notice|instant)\b/.test(q))
    return '0-15'
  if (/\b(?:within|under|less\s+than|below|max(?:imum)?|upto|up\s+to)\s+15\s*(?:day|d\b)/.test(q))
    return '0-15'
  if (/\b(?:within|under|less\s+than|below|max(?:imum)?|upto|up\s+to)\s+30\s*(?:day|d\b)|30\s*day\s*notice/.test(q))
    return '15-30'
  if (/\b(?:within|under|less\s+than|below|max(?:imum)?)\s+60\s*(?:day|d\b)|60\s*day\s*notice|2\s*month\s*notice/.test(q))
    return '30-60'
  if (/60\+|more\s+than\s+60|3\s*month|long\s+notice|serving/.test(q))
    return '60-999'
  return null
}

function extractIndustry(q: string): string | null {
  // Sort by length descending — match "banking fintech" before "banking"
  const sorted = Object.entries(INDUSTRY_ALIASES).sort((a, b) => b[0].length - a[0].length)
  for (const [alias, canonical] of sorted) {
    if (q.includes(alias)) return canonical
  }
  return null
}