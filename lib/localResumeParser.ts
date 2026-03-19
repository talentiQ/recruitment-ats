// lib/localResumeParser.ts  v8
// Fixes in this version:
//   v8-fix-1: Added name/full-name to PERSONAL_INFO_PATTERNS — stops "Name: X" being company
//   v8-fix-2: cleanText() now strips □ and other Unicode junk chars from PDF extraction
//   v8-fix-3: Education "From <University>" pattern handled — strips prefix before institution
//   v8-fix-4: Skills Pass 2 (bullet scan) now has word-count + verb-sentence guards
//             — stops full responsibility sentences from being extracted as skills
//   v8-fix-5: Skills Pass 2 is section-aware — skips bullets inside experience/projects sections

export interface LocalParsedResume {
  full_name: string
  email: string
  phone: string
  gender: string
  date_of_birth: string
  current_location: string
  current_company: string
  current_designation: string
  total_experience: number | null
  current_ctc: number | null
  expected_ctc: number | null
  notice_period: number | null
  education_level: string
  education_degree: string
  education_field: string
  education_institution: string
  skills: string[]
  sector: string
  confidence: number
}

// ─── Section headers ──────────────────────────────────────────────────────────

const SECTION_HEADERS = new Set([
  'personal statement','about me','about','career profile','professional profile',
  'executive summary','executive profile','introduction','bio','profile summary',
  'curriculum vitae','resume','cv',
  'key skills','technical skills','core skills','core competencies','competencies',
  'skills','skills & expertise','skills and expertise','skill set','skillset',
  'work experience','experience','professional experience','employment history',
  'employment','career history','work history',
  'education','academic background','educational qualification','qualifications',
  'academic details','educational details',
  'profile','summary','objective','career summary','professional summary',
  'personal details','personal information','contact','contact information',
  'tools & metrics','tools and metrics','tools','technologies','tech stack',
  'awards','achievements','certifications','projects','references','declaration',
  'languages','hobbies','interests','additional information','publications',
  'volunteering','training','workshops','key achievements','career objective',
  'career highlights','awards & achievement','awards & achievements',
  'personal background','other information','miscellaneous',
  'key responsibilities','responsibilities','roles and responsibilities',
  'role & responsibilities','role and responsibilities','duties',
  'accomplishments','key accomplishments','highlights',
])

// Sections whose bullets should NEVER be extracted as skills (v8-fix-5)
const NON_SKILL_SECTIONS = new Set([
  'work experience','experience','professional experience','employment history',
  'employment','career history','work history',
  'key responsibilities','responsibilities','roles and responsibilities',
  'role & responsibilities','role and responsibilities','duties',
  'accomplishments','key accomplishments','achievements','key achievements',
  'highlights','projects','publications','volunteering',
])

// ─── Personal info line patterns ──────────────────────────────────────────────

const PERSONAL_INFO_PATTERNS = [
  // v8-fix-1: name label lines — must be first
  /^(?:full\s*)?name\s*[:\-]\s*/i,
  /^candidate\s*name\s*[:\-]/i,
  // Languages
  /^languages?\s*(?:known|spoken|proficiency)?\s*[:\-]/i,
  /^known\s*languages?\s*[:\-]/i,
  // Demographics
  /^nationality\s*[:\-]/i,
  /^marital\s*status\s*[:\-]/i,
  /^religion\s*[:\-]/i,
  /^caste\s*[:\-]/i,
  /^date\s*of\s*birth\s*[:\-]/i,
  /^d\.?o\.?b\.?\s*[:\-]/i,
  /^age\s*[:\-]/i,
  /^gender\s*[:\-]/i,
  /^sex\s*[:\-]/i,
  // Address
  /^address\s*[:\-]/i,
  /^permanent\s*address\s*[:\-]/i,
  /^current\s*address\s*[:\-]/i,
  /^pin\s*code\s*[:\-]/i,
  /^passport\s*[:\-]/i,
  // Family
  /^father'?s?\s*name\s*[:\-]/i,
  /^mother'?s?\s*name\s*[:\-]/i,
  /^spouse\s*[:\-]/i,
  // Contact & Social
  /^phone\s*[:\-]/i,
  /^mobile\s*[:\-]/i,
  /^email\s*[:\-]/i,
  /^linkedin\s*[:\-]/i,
  /^github\s*[:\-]/i,
  // Professional fields (labeled)
  /^notice\s*period\s*[:\-]/i,
  /^current\s*ctc\s*[:\-]/i,
  /^expected\s*ctc\s*[:\-]/i,
  /^total\s*experience\s*[:\-]/i,
  /^hobbies?\s*[:\-]/i,
  /^interests?\s*[:\-]/i,
  /^objective\s*[:\-]/i,
  /^declaration\s*[:\-]/i,
  /^reference\s*[:\-]/i,
  // Multi-language list detection
  /\b(?:English|Hindi|Telugu|Tamil|Kannada|Malayalam|Marathi|Bengali|Gujarati|Punjabi|Odia|Urdu)\b.*\b(?:English|Hindi|Telugu|Tamil|Kannada|Malayalam|Marathi|Bengali|Gujarati|Punjabi|Odia|Urdu)\b/i,
]

function isPersonalInfoLine(line: string): boolean {
  // Strip leading Unicode junk before testing
  const clean = line.replace(/^[\u00A0\u2022\u25AA\u25B8\u2610\u2611\u2612\u25A1\u25A0\uFFFD\s]+/, '').trim()
  return PERSONAL_INFO_PATTERNS.some(p => p.test(clean))
}

// ─── Skill line validity guard ─────────────────────────────────────────────────
// v8-fix-4: prevents responsibility sentences from being extracted as skills

function isValidSkillLine(text: string): boolean {
  const t = text.trim()
  if (t.length < 2 || t.length > 60) return false

  // Too many words = sentence, not a skill (real skills ≤ 6 words)
  const wordCount = t.split(/\s+/).length
  if (wordCount > 6) return false

  // Ends with period = sentence
  if (/\.$/.test(t)) return false

  // Contains verb patterns typical of responsibility sentences
  if (/\b(?:addressing|managing|handling|working|developing|implementing|executing|leading|coordinating|designing|building|maintaining|ensuring|providing|supporting|reporting|preparing|conducting|monitoring|reviewing|resolving|fixing|troubleshooting|planned|managed|addressed|engineered|executed|achieved|delivered)\b/i.test(t)) return false

  // Contains prepositions suggesting it's a phrase, not a skill name
  if (/\b(?:through|across|within|between|against|towards|regarding|related\s+to|in\s+order\s+to)\b/i.test(t)) return false

  return true
}

// ─── Company name positive validation ────────────────────────────────────────

const COMPANY_KEYWORDS = /\b(?:pvt|ltd|inc|corp|llp|llc|limited|solutions|technologies|services|consulting|group|associates|enterprises|systems|global|india|international|infosys|wipro|tcs|accenture|cognizant|capgemini|hcl|tech|software|digital|analytics|finance|capital|ventures|holdings|management|industries|manufacturing|pharmaceuticals|hospitals|healthcare|education|academy)\b/i

function isValidCompanyCandidate(text: string): boolean {
  if (!text || text.length < 2 || text.length > 80) return false
  if (isPersonalInfoLine(text)) return false
  const commaCount = (text.match(/,/g) || []).length
  if (commaCount >= 2) return false
  if (/\b(?:is|are|was|were|have|has|had|will|would|should|could|can|do|does|did)\b/i.test(text)) return false
  if (/\b(?:known|spoken|proficient|fluent|native|mother\s*tongue)\b/i.test(text)) return false
  if (COMPANY_KEYWORDS.test(text)) return true
  const words = text.trim().split(/\s+/)
  if (words.length >= 1 && words.length <= 5) {
    const properNounCount = words.filter(w => /^[A-Z][a-zA-Z]{1,}$/.test(w)).length
    if (properNounCount >= Math.ceil(words.length * 0.6)) return true
  }
  return false
}

// ─── Skill map ────────────────────────────────────────────────────────────────

const SKILL_MAP = new Map<string, string>([
  // HR
  ['talent acquisition','HR'],['recruitment','HR'],['sourcing','HR'],['screening','HR'],
  ['onboarding','HR'],['hrms','HR'],['sap hcm','HR'],['payroll processing','HR'],
  ['performance management','HR'],['employee engagement','HR'],['training & development','HR'],
  ['hr policies','HR'],['labour law','HR'],['statutory compliance','HR'],['hrbp','HR'],
  ['compensation & benefits','HR'],['workforce planning','HR'],['linkedin recruiter','HR'],
  ['exit management','HR'],['grievance handling','HR'],['recruitment strategy','HR'],
  ['recruitment consulting','HR'],['rpo management','HR'],['stakeholder management','HR'],
  ['tech & engineering hiring','HR'],['market mapping','HR'],['talent intelligence','HR'],
  ['niche hiring','HR'],['leadership hiring','HR'],['offer management','HR'],
  ['ats tracking','HR'],['offer-to-join ratio','HR'],['ai-based screening','HR'],
  ['market benchmarking','HR'],['sourcing mix','HR'],['hr analytics','HR'],
  ['employer branding','HR'],['diversity hiring','HR'],['campus hiring','HR'],
  ['lateral hiring','HR'],['headhunting','HR'],['executive search','HR'],
  ['talent mapping','HR'],['joining formalities','HR'],['background verification','HR'],
  ['candidate experience','HR'],['job portals','HR'],
  ['client & stakeholder management','HR'],['market mapping & talent intelligence','HR'],
  ['niche & leadership hiring','HR'],['offer management & negotiations','HR'],
  ['ats tracking & reporting','HR'],
  // IT
  ['java','IT'],['python','IT'],['javascript','IT'],['typescript','IT'],['react','IT'],
  ['angular','IT'],['vue','IT'],['node.js','IT'],['nodejs','IT'],['next.js','IT'],
  ['aws','IT'],['azure','IT'],['gcp','IT'],['docker','IT'],['kubernetes','IT'],
  ['git','IT'],['mysql','IT'],['postgresql','IT'],['mongodb','IT'],['sql','IT'],
  ['microservices','IT'],['rest api','IT'],['graphql','IT'],['devops','IT'],
  ['machine learning','IT'],['deep learning','IT'],['data science','IT'],
  ['power bi','IT'],['tableau','IT'],['spark','IT'],['kafka','IT'],['cloud','IT'],
  ['full stack','IT'],['data architect','IT'],['data scientist','IT'],
  ['html','IT'],['css','IT'],['php','IT'],['c++','IT'],['c#','IT'],['golang','IT'],
  ['flutter','IT'],['react native','IT'],['swift','IT'],['kotlin','IT'],
  ['django','IT'],['flask','IT'],['spring boot','IT'],['laravel','IT'],
  ['selenium','IT'],['jenkins','IT'],['terraform','IT'],['ansible','IT'],
  ['elasticsearch','IT'],['redis','IT'],['linux','IT'],['bash','IT'],
  ['yocto','IT'],['autosar','IT'],['can bus','IT'],['embedded c','IT'],
  ['rtos','IT'],['matlab','IT'],['simulink','IT'],['vhdl','IT'],['fpga','IT'],
  ['qt','IT'],['cmake','IT'],['makefile','IT'],['gdb','IT'],['jira','IT'],
  ['confluence','IT'],['bitbucket','IT'],['svn','IT'],['perforce','IT'],
  // Finance
  ['financial analysis','Finance'],['budgeting','Finance'],['mis reporting','Finance'],
  ['fp&a','Finance'],['gst','Finance'],['tds','Finance'],['accounts payable','Finance'],
  ['accounts receivable','Finance'],['tally','Finance'],['sap fico','Finance'],
  ['financial modeling','Finance'],['variance analysis','Finance'],['forecasting','Finance'],
  ['auditing','Finance'],['taxation','Finance'],['balance sheet','Finance'],
  // Sales / Marketing
  ['b2b sales','Sales'],['b2c sales','Sales'],['business development','Sales'],
  ['key account management','Sales'],['crm','Sales'],['lead generation','Sales'],
  ['territory management','Sales'],['channel sales','Sales'],['retail sales','Sales'],
  ['inside sales','Sales'],['field sales','Sales'],['cold calling','Sales'],
  ['digital marketing','Sales'],['seo','Sales'],['sem','Sales'],['social media','Sales'],
  ['content marketing','Sales'],['email marketing','Sales'],['brand management','Sales'],
  // Operations / Manufacturing
  ['supply chain management','Operations'],['logistics','Operations'],
  ['inventory management','Operations'],['warehouse management','Operations'],
  ['procurement','Operations'],['vendor management','Operations'],['lean','Operations'],
  ['six sigma','Operations'],['kaizen','Operations'],['erp','Operations'],
  ['sap','Operations'],['quality control','Operations'],['quality assurance','Operations'],
  ['production planning','Operations'],['project management','Operations'],
  ['process improvement','Operations'],['autocad','Operations'],['solidworks','Operations'],
])

const SKILL_DISPLAY: Record<string, string> = {
  'talent acquisition':'Talent Acquisition','recruitment strategy':'Recruitment Strategy',
  'recruitment consulting':'Recruitment Consulting','rpo management':'RPO Management',
  'stakeholder management':'Stakeholder Management',
  'client & stakeholder management':'Client & Stakeholder Management',
  'tech & engineering hiring':'Tech & Engineering Hiring',
  'market mapping':'Market Mapping','talent intelligence':'Talent Intelligence',
  'market mapping & talent intelligence':'Market Mapping & Talent Intelligence',
  'niche hiring':'Niche Hiring','leadership hiring':'Leadership Hiring',
  'niche & leadership hiring':'Niche & Leadership Hiring',
  'offer management':'Offer Management',
  'offer management & negotiations':'Offer Management & Negotiations',
  'ats tracking':'ATS Tracking','ats tracking & reporting':'ATS Tracking & Reporting',
  'offer-to-join ratio':'Offer-to-Join Ratio','ai-based screening':'AI-Based Screening',
  'market benchmarking':'Market Benchmarking','sourcing mix':'Sourcing Mix',
  'linkedin recruiter':'LinkedIn Recruiter','hr analytics':'HR Analytics',
  'employer branding':'Employer Branding','diversity hiring':'Diversity Hiring',
  'campus hiring':'Campus Hiring','lateral hiring':'Lateral Hiring',
  'hrbp':'HRBP','hrms':'HRMS','sap hcm':'SAP HCM','sap fico':'SAP FICO','sap':'SAP',
  'power bi':'Power BI','aws':'AWS','azure':'Azure','gcp':'GCP',
  'rest api':'REST API','devops':'DevOps','machine learning':'Machine Learning',
  'deep learning':'Deep Learning','data science':'Data Science',
  'b2b sales':'B2B Sales','b2c sales':'B2C Sales','inside sales':'Inside Sales',
  'key account management':'Key Account Management','crm':'CRM',
  'mis reporting':'MIS Reporting','fp&a':'FP&A','gst':'GST','tds':'TDS',
  'supply chain management':'Supply Chain Management','six sigma':'Six Sigma',
  'node.js':'Node.js','next.js':'Next.js','react native':'React Native',
  'spring boot':'Spring Boot','c++':'C++','c#':'C#','sql':'SQL','html':'HTML',
  'css':'CSS','seo':'SEO','sem':'SEM','erp':'ERP','autocad':'AutoCAD',
  'yocto':'Yocto','autosar':'AUTOSAR','can bus':'CAN Bus','embedded c':'Embedded C',
  'rtos':'RTOS','matlab':'MATLAB','simulink':'Simulink','vhdl':'VHDL','fpga':'FPGA',
  'cmake':'CMake','makefile':'Makefile','gdb':'GDB','jira':'Jira',
  'confluence':'Confluence','bitbucket':'Bitbucket',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // v8-fix-2: strip common Unicode junk from PDF/DOCX extraction
    // □ (U+25A1), ■ (U+25A0), ☐ (U+2610), ☑ (U+2611), ☒ (U+2612),
    // • alt bullets, replacement char, zero-width spaces
    .replace(/[\u2610\u2611\u2612\u25A1\u25A0\u25AA\u2022\u25B8\uFFFD\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

function getLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
}

function isSectionHeader(line: string): boolean {
  return SECTION_HEADERS.has(line.toLowerCase().replace(/[:\-–—]+$/, '').trim())
}

function toTitleCase(str: string): string {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

// Strip leading □ / bullet / whitespace junk from a string
function stripLeadingJunk(s: string): string {
  return s.replace(/^[\s\u00A0\u2022\u25AA\u25B8\u2610\u2611\u2612\u25A1\u25A0\uFFFD\-\*•▪▸]+/, '').trim()
}

const DATE_PATTERN        = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+\d{4}\b/i
const PRESENT_PATTERN     = /\b(?:present|current|till\s+date|till\s+now|ongoing|till date)\b/i
const DATE_RANGE_PATTERN  = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\s*[–\-—to]+\s*(?:Present|Current|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i

// ─── Basic field extractors ───────────────────────────────────────────────────

function extractEmail(text: string): string {
  const VALID_TLDS = ['com','in','net','org','co','io','info','edu','gov','biz','me']
  for (const m of text.matchAll(/\b[A-Za-z0-9][A-Za-z0-9._%+\-]{1,50}@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g)) {
    const email = m[0].toLowerCase()
    if (/linkedin|github|twitter/.test(email)) continue
    const tld = email.split('.').pop() || ''
    if (!VALID_TLDS.includes(tld) && tld.length > 5) continue
    if (email.split('@')[0].length < 2) continue
    return email
  }
  return ''
}

function extractPhone(text: string): string {
  const p1 = text.match(/\+91[\s\-.]*([6-9]\d{4}[\s\-.]*\d{5})/)
  if (p1) { const n = p1[1].replace(/[\s\-.]/g,''); if (n.length===10) return n }
  const p2 = text.match(/\b91([6-9]\d{9})\b/)
  if (p2) return p2[1]
  for (const m of [...text.matchAll(/\b([6-9]\d{4}[\s\-.]*\d{5})\b/g)]) {
    const n = m[1].replace(/[\s\-.]/g,'')
    if (/^[6-9]\d{9}$/.test(n)) return n
  }
  return ''
}

function extractName(text: string): string {
  const lines = getLines(text)
  for (const line of lines.slice(0, 20)) {
    const m = line.match(/^(?:name|full\s*name|candidate\s*name)\s*[:\-]\s*(.+)/i)
    if (m?.[1]) {
      const n = stripLeadingJunk(m[1]).trim()
      if (n.length > 2 && n.length < 50 && !n.includes('@') && !isSectionHeader(n)) return toTitleCase(n)
    }
  }
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const line = lines[i]
    if (line.includes('@') || /\d/.test(line) || line.length > 40 || line.length < 3) continue
    if (isSectionHeader(line)) continue
    if (/www\.|http|linkedin|github/i.test(line)) continue
    const words = line.split(/\s+/)
    if (words.length >= 2 && words.length <= 4 && words.every(w => /^[A-Z]{2,}$/.test(w)))
      return words.map(w => toTitleCase(w)).join(' ')
  }
  for (let i = 0; i < Math.min(12, lines.length); i++) {
    const line = lines[i]
    if (line.includes('@') || /\d{3,}/.test(line) || line.length > 55 || line.length < 3) continue
    if (isSectionHeader(line)) continue
    if (isPersonalInfoLine(line)) continue
    if (/[.,;:!?]/.test(line)) continue
    if (/www\.|http|linkedin|github|profile|summary|statement|about/i.test(line)) continue
    const words = line.split(/\s+/)
    // Reject lines starting with articles/prepositions — "The Greens", "A Block" = address
    if (/^(?:the|a|an|at|in|on|of|for|and|or|near|flat|house|plot|block|sector|phase|tower|wing|apt|suite)\b/i.test(words[0])) continue
    // Reject lines containing common place/building words
    const PLACE_WORDS = /^(?:greens|heights|gardens|residency|nagar|colony|enclave|vihar|apartments?|complex|park|avenue|road|street|lane|cross|main|layout|society|township|villa|palace|towers?|square|plaza|court|terrace|view|hills?|valley|woods?|estate|bay|grove|meadow)$/i
    if (words.some(w => PLACE_WORDS.test(w))) continue
    if (words.length >= 2 && words.length <= 4 && words.every(w => /^[A-Z][a-z]{1,}$/.test(w) || /^[A-Z]{2,5}$/.test(w)))
      return line
  }
  return ''
}

function extractExperience(text: string): number | null {
  const patterns = [
    /total\s+(?:work\s+)?experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?)/i,
    /(\d+(?:\.\d+)?)\s*(?:\+\s*)?years?\s+of\s+(?:total\s+)?(?:work\s+)?experience/i,
    /experience\s+of\s+(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?)/i,
    /(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?)\s+(?:of\s+)?experience/i,
  ]
  for (const p of patterns) {
    const m = text.match(p); if (m) { const v=parseFloat(m[1]); if (v>0&&v<50) return v }
  }
  const months = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
  const ranges = [...text.matchAll(new RegExp(`(${months})\\s+(\\d{4})\\s*[–\\-—to]+\\s*(?:Present|Current|${months}\\s+\\d{4})`, 'gi'))]
  if (ranges.length > 0) {
    const current = new Date().getFullYear(); let earliest = current
    for (const m of ranges) { const yr=parseInt(m[2]); if (yr<earliest&&yr>1970) earliest=yr }
    const exp = current - earliest; if (exp>0&&exp<50) return exp
  }
  return null
}

function extractCTC(text: string): { current: number|null; expected: number|null } {
  const unit = '\\s*(?:lpa|lakhs?|lacs?|l\\.p\\.a|l\\b)'
  const num  = '([\\d.]+)'
  let current=null, expected=null
  const cm = text.match(new RegExp(`current\\s+ctc\\s*[:\\-]?\\s*${num}${unit}`,'i'))
  if (cm) { const v=parseFloat(cm[1]); if (v>0&&v<1000) current=v }
  const em = text.match(new RegExp(`expected\\s+(?:ctc|salary)\\s*[:\\-]?\\s*${num}${unit}`,'i'))
  if (em) { const v=parseFloat(em[1]); if (v>0&&v<1000) expected=v }
  return { current, expected }
}

function extractNoticePeriod(text: string): number | null {
  if (/immediate\s+joiner|immediately\s+available|notice\s*[:\-]\s*nil/i.test(text)) return 0
  const m = text.match(/notice\s+period\s*[:\-]?\s*(\d+)\s*(days?|months?)/i)
  if (m) { const v=parseInt(m[1]); return /month/i.test(m[2]) ? v*30 : v }
  return null
}

function extractLocation(text: string): string {
  const lm = text.match(/(?:location|city|current\s+city|residing|based\s+(?:at|in))\s*[:\-]\s*([^\n,]{2,30})/i)
  if (lm?.[1]) return lm[1].trim().split(',')[0].trim()
  const cities = [
    'Mumbai','Delhi','New Delhi','Bangalore','Bengaluru','Hyderabad','Chennai',
    'Kolkata','Pune','Ahmedabad','Jaipur','Noida','Gurgaon','Gurugram','Lucknow',
    'Indore','Bhopal','Chandigarh','Kochi','Dehradun','Greater Noida','Faridabad',
    'Surat','Vadodara','Nagpur','Nashik','Rajkot','Coimbatore','Visakhapatnam',
    'Patna','Vijayawada','Warangal','Tirupati','Guntur','Nellore','Kakinada',
    'Mangalore','Mysore','Hubli','Belgaum',
  ]
  for (const city of cities) {
    if (new RegExp(`\\b${city}\\b`,'i').test(text)) return city
  }
  return ''
}

function extractGender(text: string): string {
  if (/(?:gender|sex)\s*[:\-]?\s*male\b/i.test(text)) return 'Male'
  if (/(?:gender|sex)\s*[:\-]?\s*female\b/i.test(text)) return 'Female'
  return ''
}

function extractDOB(text: string): string {
  const patterns = [
    /(?:date\s+of\s+birth|dob|d\.o\.b)\s*[:\-]?\s*(\d{1,2}[\-\/\.]\w{2,9}[\-\/\.]\d{2,4})/i,
    /^(\d{1,2}[\/\-]\w{2,9}[\/\-]\d{4})$/m,
    /\b(\d{1,2}[\-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\-]\d{4})\b/i,
  ]
  for (const p of patterns) { const m=text.match(p); if (m?.[1]) return m[1] }
  return ''
}

// ─── Section text extractor ───────────────────────────────────────────────────

function getSectionText(text: string, targetHeaders: string[]): string {
  const lines = text.split('\n')
  let inSection = false
  const sectionLines: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const lower   = trimmed.toLowerCase().replace(/[:\-–—]+$/, '').trim()
    if (targetHeaders.includes(lower)) { inSection = true; continue }
    if (inSection) {
      if (isSectionHeader(trimmed) && trimmed.length < 40) break
      sectionLines.push(trimmed)
    }
  }
  return sectionLines.join('\n')
}

// ─── Skills extraction ────────────────────────────────────────────────────────

function extractSkillsFromSection(text: string): string[] {
  const skillSectionHeaders = [
    'key skills','technical skills','core skills','core competencies',
    'competencies','skills','skills & expertise','skills and expertise',
    'skill set','skillset','tools','technologies','tech stack',
  ]
  const sectionText = getSectionText(text, skillSectionHeaders)
  if (!sectionText.trim()) return []

  const raw: string[] = []
  const lines = sectionText.split('\n')
  for (const line of lines) {
    const trimmed = stripLeadingJunk(line.trim())
    if (!trimmed || trimmed.length < 2 || isSectionHeader(trimmed)) continue
    if (DATE_RANGE_PATTERN.test(trimmed) || DATE_PATTERN.test(trimmed)) continue
    if (isPersonalInfoLine(trimmed)) continue
    if (trimmed.length > 200) continue
    const delimiters = /[,|;•▪▸\t]+/
    if (delimiters.test(trimmed)) {
      const parts = trimmed.split(delimiters)
        .map(p => stripLeadingJunk(p).trim())
        .filter(p => p.length >= 2 && p.length <= 60)
      raw.push(...parts)
    } else {
      if (trimmed.length >= 2 && trimmed.length <= 60) raw.push(trimmed)
    }
  }
  return raw
}

function normalizeSkillDisplay(raw: string): string {
  const lo = raw.toLowerCase().trim()
  if (SKILL_DISPLAY[lo]) return SKILL_DISPLAY[lo]
  return raw.trim().split(/\s+/).map(w => {
    if (/^[A-Z]{2,}$/.test(w)) return w
    return w.charAt(0).toUpperCase() + w.slice(1)
  }).join(' ')
}

function extractSkills(text: string): { skills: string[]; sector: string } {
  const found = new Map<string, string>()

  // Pass 1: skills section free-form extraction (highest signal)
  const sectionSkills = extractSkillsFromSection(text)
  for (const raw of sectionSkills) {
    const lo = raw.toLowerCase()
    found.set(raw, SKILL_MAP.get(lo) || 'Other')
  }

  // Pass 2: bullet-point scan — but ONLY outside non-skill sections (v8-fix-5)
  // Track current section to skip experience/responsibilities bullets
  const lines = text.split('\n')
  let currentSection = ''
  for (let i = 0; i < lines.length - 1; i++) {
    const trimmed = lines[i].trim()
    const lower   = trimmed.toLowerCase().replace(/[:\-–—]+$/, '').trim()

    // Track which section we're in
    if (isSectionHeader(trimmed)) {
      currentSection = lower
      continue
    }

    // Skip bullets inside experience/responsibilities/projects sections (v8-fix-5)
    if (NON_SKILL_SECTIONS.has(currentSection)) continue

    const cleaned = stripLeadingJunk(trimmed)

    // Standalone bullet on its own line → skill on next line (mammoth DOCX quirk)
    if (/^[•\-\*▪▸]$/.test(trimmed)) {
      const nextLine = stripLeadingJunk(lines[i+1]?.trim() || '')
      if (nextLine.length >= 2 && !isSectionHeader(nextLine) &&
          !isPersonalInfoLine(nextLine) && isValidSkillLine(nextLine)) {
        if (!found.has(nextLine)) found.set(nextLine, SKILL_MAP.get(nextLine.toLowerCase()) || 'Other')
      }
    } else if (/^[•\-\*▪▸]\s+.{2,}/.test(trimmed)) {
      // Bullet + content on same line
      const content = cleaned
      if (!isPersonalInfoLine(content) && isValidSkillLine(content) && !found.has(content)) {
        found.set(content, SKILL_MAP.get(content.toLowerCase()) || 'Other')
      }
    }
  }

  // Pass 3: SKILL_MAP full-text scan — add classified skills + upgrade sectors
  const fullLower = text.toLowerCase()
  const sorted = Array.from(SKILL_MAP.entries()).sort((a,b) => b[0].length - a[0].length)
  for (const [skill, sector] of sorted) {
    if (skill.length < 3) continue
    const esc = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re  = skill.includes(' ')
      ? new RegExp(`(?<![a-zA-Z])${esc}(?![a-zA-Z])`, 'i')
      : new RegExp(`\\b${esc}\\b`, 'i')
    if (re.test(fullLower)) {
      const displayKey = Array.from(found.keys()).find(k => k.toLowerCase() === skill)
      if (displayKey) found.set(displayKey, sector)
      else found.set(skill, sector)
    }
  }

  const sectorCount: Record<string,number> = {}
  for (const s of found.values()) {
    if (s !== 'Other') sectorCount[s] = (sectorCount[s] || 0) + 1
  }
  const sector = Object.entries(sectorCount).sort((a,b) => b[1]-a[1])[0]?.[0] || 'Other'

  const skills = Array.from(found.keys())
    .filter(s => s.length >= 2 && s.length <= 60)
    .slice(0, 30)
    .map(s => normalizeSkillDisplay(s))
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .sort()

  return { skills, sector }
}

// ─── Company + Designation ────────────────────────────────────────────────────

interface WorkEntry {
  company: string
  designation: string
  isCurrent: boolean
}

const TITLE_WORDS = [
  'manager','engineer','developer','analyst','consultant','partner','director',
  'head','lead','architect','specialist','executive','officer','recruiter',
  'advisor','associate','coordinator','supervisor','president','vice president',
  'vp','cto','ceo','coo','cfo','founder','co-founder','intern','trainee',
  'assistant','deputy','senior','junior','principal','staff','general',
  'officer','agent','representative','relationship','business','product',
  'project','program','delivery','operations','account','territory',
]

function looksLikeDesignation(text: string): boolean {
  if (isPersonalInfoLine(text)) return false
  const lo = text.toLowerCase()
  return TITLE_WORDS.some(w => lo.includes(w))
}

function stripDateRange(text: string): string {
  return text
    .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+\d{4}\s*[–\-—to]+\s*(?:Present|Current|Till\s+Date|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]*\d{0,4}/gi, '')
    .replace(/\d{4}\s*[–\-—to]+\s*(?:\d{4}|Present|Current)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function parseWorkEntries(text: string): WorkEntry[] {
  const entries: WorkEntry[] = []
  const lines = getLines(text)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isPersonalInfoLine(line)) continue

    // Format 1: pipe-separated
    if (line.includes('|')) {
      const parts = line.split('|').map(p => p.trim()).filter(p => p.length > 0)
      if (parts.length >= 2) {
        const isCurrent = PRESENT_PATTERN.test(line)
        let role = '', company = ''
        for (const part of parts) {
          const clean = stripDateRange(part)
          if (!clean || DATE_PATTERN.test(clean) || PRESENT_PATTERN.test(clean)) continue
          if (isPersonalInfoLine(clean)) continue
          if (looksLikeDesignation(clean) && !role) role = clean
          else if (!company && isValidCompanyCandidate(clean)) company = clean
          else if (!company && clean.length > 2) company = clean
        }
        if (!role && parts[0]) role = stripDateRange(parts[0])
        if (!company && parts[1]) {
          const c = stripDateRange(parts[1])
          if (!isPersonalInfoLine(c) && !DATE_PATTERN.test(c) && !PRESENT_PATTERN.test(c)) company = c
        }
        if (role.length > 2 || company.length > 2) entries.push({ designation: role, company, isCurrent })
        continue
      }
    }

    // Format 2: "Role at Company"
    const atMatch = line.match(/^(.+?)\s+(?:at|with|@)\s+(.+?)(?:\s*[\|,]\s*.+)?$/i)
    if (atMatch && looksLikeDesignation(atMatch[1]) && !isPersonalInfoLine(atMatch[2])) {
      const isCurrent = PRESENT_PATTERN.test(text.slice(Math.max(0, text.indexOf(line)), text.indexOf(line) + 300))
      const company = stripDateRange(atMatch[2].trim())
      if (isValidCompanyCandidate(company) || company.length > 2)
        entries.push({ designation: atMatch[1].trim(), company, isCurrent })
      continue
    }

    // Format 3: "Company Name (Jan 2020 – Present)"
    if (PRESENT_PATTERN.test(line) && !looksLikeDesignation(line) && !isPersonalInfoLine(line)) {
      const company = stripDateRange(line).replace(/\(.*\)/, '').trim()
      if (isValidCompanyCandidate(company) || company.length > 2) {
        let role = ''
        for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
          if (isPersonalInfoLine(lines[j])) continue
          if (looksLikeDesignation(lines[j]) && !DATE_PATTERN.test(lines[j])) { role = lines[j]; break }
        }
        if (!role) {
          for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
            if (isPersonalInfoLine(lines[j])) continue
            if (looksLikeDesignation(lines[j]) && !DATE_PATTERN.test(lines[j])) { role = lines[j]; break }
          }
        }
        entries.push({ company, designation: role, isCurrent: true })
        continue
      }
    }

    // Format 4: date-range line with Present — window scan
    if (PRESENT_PATTERN.test(line) && DATE_PATTERN.test(line)) {
      let company = '', role = ''
      const windowLines = lines.slice(Math.max(0, i - 6), i + 3)
      for (const wline of windowLines) {
        if (wline === line || isPersonalInfoLine(wline)) continue
        if (DATE_PATTERN.test(wline) || PRESENT_PATTERN.test(wline)) continue
        if (isSectionHeader(wline) || /^[•\-\*▪▸]/.test(wline)) continue
        if (!role && looksLikeDesignation(wline) && wline.length < 80) role = wline
        // v9-fix: require isValidCompanyCandidate — rejects skill lists like "Python, Golang, PHP"
        else if (!company && isValidCompanyCandidate(wline) && wline.length < 80) company = wline
      }
      if (role || company) entries.push({ company, designation: role, isCurrent: true })
      continue
    }

    // Format 5: year-only range "2019 – Present"
    if (/\b\d{4}\s*[–\-—]\s*(?:Present|Current)\b/i.test(line) && !DATE_PATTERN.test(line)) {
      let company = '', role = ''
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        if (isPersonalInfoLine(lines[j])) continue
        if (isSectionHeader(lines[j])) break
        if (!role && looksLikeDesignation(lines[j]) && lines[j].length < 80) role = lines[j]
        else if (!company && isValidCompanyCandidate(lines[j])) company = lines[j]
      }
      if (role || company) entries.push({ company, designation: role, isCurrent: true })
    }
  }

  return entries
}

function extractCurrentCompany(text: string): string {
  const lm = text.match(/(?:current\s+(?:company|employer|organization)|currently\s+(?:working|employed)\s+(?:at|with))\s*[:\-]?\s*([^\n,]{3,60})/i)
  if (lm?.[1] && !isPersonalInfoLine(lm[1])) return lm[1].trim()

  const expSection = getSectionText(text, [
    'work experience','experience','professional experience','employment history',
    'employment','career history','work history',
  ])
  const entries = parseWorkEntries(expSection.length > 100 ? expSection : text)
  const current = entries.find(e => e.isCurrent && e.company.length > 1)
  if (current?.company) return current.company

  const lines = getLines(text)
  for (let i = 0; i < lines.length; i++) {
    if (!PRESENT_PATTERN.test(lines[i])) continue
    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      const candidate = lines[j]
      if (!candidate || candidate.length < 2 || candidate.length > 80) continue
      if (isSectionHeader(candidate)) continue
      if (isPersonalInfoLine(candidate)) continue
      if (candidate.includes('@') || /^\d/.test(candidate)) continue
      if (/^[•\-\*▪▸]/.test(candidate)) continue
      if (DATE_PATTERN.test(candidate)) continue
      if (looksLikeDesignation(candidate)) continue
      if ((candidate.match(/,/g) || []).length >= 2) continue
      if (isValidCompanyCandidate(candidate)) return candidate
    }
  }
  return ''
}

function extractDesignation(text: string): string {
  const lm = text.match(/(?:designation|current\s+(?:title|role|position))\s*[:\-]\s*([^\n,]{3,70})/i)
  if (lm?.[1] && looksLikeDesignation(lm[1])) return lm[1].trim()

  const expSection = getSectionText(text, [
    'work experience','experience','professional experience','employment history',
    'employment','career history','work history',
  ])
  const entries = parseWorkEntries(expSection.length > 100 ? expSection : text)
  const current = entries.find(e => e.isCurrent && e.designation.length > 1)
  if (current?.designation) return current.designation

  const lines = getLines(text)
  for (let i = 0; i < lines.length; i++) {
    if (!PRESENT_PATTERN.test(lines[i])) continue
    const sameLine = stripDateRange(lines[i])
    if (looksLikeDesignation(sameLine) && sameLine.length > 3) return sameLine
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const line = lines[j]
      if (isPersonalInfoLine(line)) continue
      if (isSectionHeader(line)) break
      if (looksLikeDesignation(line) && line.length < 80 && line.length > 3 &&
          !DATE_PATTERN.test(line) && !/^[•\-\*▪▸]/.test(line)) return line
    }
  }

  for (const line of lines.slice(0, 30)) {
    if (isSectionHeader(line) || isPersonalInfoLine(line)) continue
    if (!looksLikeDesignation(line)) continue
    if (line.length < 4 || line.length > 70) continue
    if (line.includes('@') || DATE_PATTERN.test(line)) continue
    if (/^[•\-\*▪▸]/.test(line)) continue
    if (/\s(?:is|are|was|were|have|has|had|will|would|should|could|can)\s/i.test(line)) continue
    if ((line.match(/,/g) || []).length >= 2) continue
    return line
  }
  return ''
}

// ─── Education ────────────────────────────────────────────────────────────────

const DEGREE_MAP: Record<string, {level:string; degree:string}> = {
  'phd':{level:'PhD',degree:'PhD'},'ph.d':{level:'PhD',degree:'PhD'},
  'doctor of philosophy':{level:'PhD',degree:'PhD'},
  'mba':{level:'Master',degree:'MBA'},'pgdm':{level:'Master',degree:'PGDM'},
  'mca':{level:'Master',degree:'MCA'},'m.tech':{level:'Master',degree:'M.Tech'},
  'mtech':{level:'Master',degree:'M.Tech'},'m.sc':{level:'Master',degree:'M.Sc'},
  'msc':{level:'Master',degree:'M.Sc'},'m.com':{level:'Master',degree:'M.Com'},
  'mcom':{level:'Master',degree:'M.Com'},'m.e':{level:'Master',degree:'M.E'},
  'm.a':{level:'Master',degree:'M.A'},'ma':{level:'Master',degree:'M.A'},
  'post graduate':{level:'Master',degree:'Post Graduate'},
  'postgraduate':{level:'Master',degree:'Post Graduate'},
  'master of business administration':{level:'Master',degree:'MBA'},
  'master of computer application':{level:'Master',degree:'MCA'},
  'master of computer applications':{level:'Master',degree:'MCA'},
  'master of technology':{level:'Master',degree:'M.Tech'},
  'master of engineering':{level:'Master',degree:'M.E'},
  'master of science':{level:'Master',degree:'M.Sc'},
  'master of commerce':{level:'Master',degree:'M.Com'},
  'master of arts':{level:'Master',degree:'M.A'},
  'masters in':{level:'Master',degree:'Masters'},
  'master in':{level:'Master',degree:'Masters'},
  'b.tech':{level:'Bachelor',degree:'B.Tech'},'btech':{level:'Bachelor',degree:'B.Tech'},
  'b.e':{level:'Bachelor',degree:'B.E'},'be':{level:'Bachelor',degree:'B.E'},
  'bca':{level:'Bachelor',degree:'BCA'},'bba':{level:'Bachelor',degree:'BBA'},
  'b.sc':{level:'Bachelor',degree:'B.Sc'},'bsc':{level:'Bachelor',degree:'B.Sc'},
  'b.com':{level:'Bachelor',degree:'B.Com'},'bcom':{level:'Bachelor',degree:'B.Com'},
  'b.a':{level:'Bachelor',degree:'B.A'},'ba':{level:'Bachelor',degree:'B.A'},
  'bachelor of technology':{level:'Bachelor',degree:'B.Tech'},
  'bachelor of engineering':{level:'Bachelor',degree:'B.E'},
  'bachelor of science':{level:'Bachelor',degree:'B.Sc'},
  'bachelor of commerce':{level:'Bachelor',degree:'B.Com'},
  'bachelor of arts':{level:'Bachelor',degree:'B.A'},
  'bachelor of computer application':{level:'Bachelor',degree:'BCA'},
  'bachelor of computer applications':{level:'Bachelor',degree:'BCA'},
  'bachelor of business administration':{level:'Bachelor',degree:'BBA'},
  'diploma':{level:'Diploma',degree:'Diploma'},
  'polytechnic':{level:'Diploma',degree:'Diploma'},
}

const DEGREE_ORDER = Object.keys(DEGREE_MAP).sort((a, b) => b.length - a.length)

const INST_PATTERN = /(?:University|College|Institute(?:\s+of\s+[A-Za-z\s]+)?|School\s+of|Academy|Polytechnic|IIT|NIT|BITS|Symbiosis|Amity|Manipal|VIT|SRM|XLRI|TISS|ISB|ICAI|ICSI|IMT|IIPM|MDI|SPJIMR|NMIMS|SIBM|SCMHRD|Woxsen|Shoolini|Chitkara)\b/i

// Strip degree prefix and "From" keyword from education lines (v8-fix-3)
const DEGREE_PREFIX_RE = /^(?:bachelor\s+of\s+\w[\w\s]*?|master\s+of\s+\w[\w\s]*?|b\.tech|b\.e|b\.sc|b\.com|b\.a|bca|bba|mba|pgdm|mca|m\.tech|m\.sc|m\.com|m\.e|m\.a|diploma)\s*[\(\):\-–—,]?\s*/i
const FROM_RE          = /\bfrom\s+/i

function extractEducation(text: string) {
  const eduSection = getSectionText(text, [
    'education','academic background','educational qualification',
    'qualifications','academic details','educational details',
  ])
  const searchText = eduSection.length > 50 ? eduSection : text
  const lower = searchText.toLowerCase()
  let level = '', degree = '', field = '', institution = ''

  for (const key of DEGREE_ORDER) {
    if (lower.includes(key)) { level = DEGREE_MAP[key].level; degree = DEGREE_MAP[key].degree; break }
  }

  const eduLines = searchText.split('\n')
  for (let i = 0; i < eduLines.length; i++) {
    // v8-fix-2: strip junk from each line before processing
    const raw     = stripLeadingJunk(eduLines[i].trim())
    const trimmed = raw
    if (trimmed.length < 5 || isPersonalInfoLine(trimmed)) continue

    if (INST_PATTERN.test(trimmed)) {
      // v8-fix-3: strip "From " prefix and degree abbreviation prefix before institution
      let instLine = trimmed
      instLine = instLine.replace(DEGREE_PREFIX_RE, '')
      instLine = instLine.replace(FROM_RE, '')
      instLine = instLine.replace(/\s*\(?\d{4}[\s–\-—]*\d{0,4}\)?/g, '').trim()

      // Extract the institution portion (from the keyword onwards)
      const instStart = instLine.search(INST_PATTERN)
      if (instStart >= 0) {
        const beforeInst = instLine.slice(0, instStart).trim()
        const instRaw    = instLine.slice(instStart).trim()

        // Field = what's before the institution name (after degree prefix stripped)
        if (beforeInst.length > 2 && beforeInst.length < 50 &&
            !/\d{4}/.test(beforeInst) && !INST_PATTERN.test(beforeInst) &&
            !FROM_RE.test(beforeInst)) {
          field = beforeInst
        }

        if (instRaw.length > 3 && instRaw.length < 120) {
          institution = instRaw
        }
      } else if (instLine.length > 3 && instLine.length < 120) {
        institution = instLine
      }

      // Also check line above for field/specialization
      if (!field && i > 0) {
        const above = stripLeadingJunk(eduLines[i - 1].trim())
        if (above.length > 3 && above.length < 60 && !INST_PATTERN.test(above) &&
            !isSectionHeader(above) && !/\d{4}/.test(above) && !isPersonalInfoLine(above)) {
          const fieldRaw = above
            .replace(DEGREE_PREFIX_RE, '')
            .replace(FROM_RE, '')
            .trim()
          if (fieldRaw.length > 2 && fieldRaw.length < 50) field = fieldRaw
        }
      }

      if (institution) break
    }
  }

  // Fallback institution regex
  if (!institution) {
    const fallback = /\b([A-Z][A-Za-z\s&]{2,50}(?:University|College|Institute|Symbiosis|Amity|Manipal|VIT|XLRI|ISB|IIT|NIT|BITS)(?:\s+of\s+[A-Za-z\s]{2,30})?)\b/g
    for (const m of [...text.matchAll(fallback)]) {
      const inst = m[1].trim().replace(/\s+/g,' ')
      if (inst.length > 5 && inst.length < 100 && /^[A-Za-z\s,().&\-]+$/.test(inst)) { institution = inst; break }
    }
  }

  return { level, degree, field, institution }
}

// ─── Confidence ───────────────────────────────────────────────────────────────

function calcConfidence(p: LocalParsedResume): number {
  const checks = [
    {v:p.full_name,w:2},{v:p.phone,w:2},{v:p.email,w:2},
    {v:p.current_designation,w:1},{v:p.current_company,w:1},
    {v:p.total_experience!==null?'1':'',w:1},{v:p.skills.length>2?'1':'',w:2},
    {v:p.education_degree,w:1},{v:p.current_location,w:1},
  ]
  const total  = checks.reduce((s,c) => s+c.w, 0)
  const scored = checks.reduce((s,c) => s+(c.v?c.w:0), 0)
  return Math.round((scored/total)*100)/100
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function parseResumeLocally(rawText: string): LocalParsedResume {
  const text = cleanText(rawText)
  const ctc  = extractCTC(text)
  const { skills, sector } = extractSkills(text)
  const edu  = extractEducation(text)

  const parsed: LocalParsedResume = {
    full_name:             extractName(text),
    email:                 extractEmail(text),
    phone:                 extractPhone(text),
    gender:                extractGender(text),
    date_of_birth:         extractDOB(text),
    current_location:      extractLocation(text),
    current_company:       extractCurrentCompany(text),
    current_designation:   extractDesignation(text),
    total_experience:      extractExperience(text),
    current_ctc:           ctc.current,
    expected_ctc:          ctc.expected,
    notice_period:         extractNoticePeriod(text),
    education_level:       edu.level,
    education_degree:      edu.degree,
    education_field:       edu.field,
    education_institution: edu.institution,
    skills,
    sector,
    confidence:            0,
  }
  parsed.confidence = calcConfidence(parsed)
  return parsed
}