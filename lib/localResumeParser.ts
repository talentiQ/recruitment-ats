// lib/localResumeParser.ts  v4 — fixed for actual mammoth output

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

const SECTION_HEADERS = new Set([
  'key skills','technical skills','core skills','skills','work experience',
  'experience','education','employment','profile','summary','objective',
  'career summary','professional summary','personal details','personal information',
  'contact','contact information','tools & metrics','tools and metrics',
  'awards','achievements','certifications','projects','references','declaration',
  'languages','hobbies','interests','additional information','publications',
  'volunteering','training','workshops','key achievements','career objective',
  'professional experience','academic background','career highlights',
  'awards & achievement','awards & achievements',
])

const SKILL_MAP = new Map<string, string>([
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
  // Multi-word compound skills from Shikha's CV bullets
  ['client & stakeholder management','HR'],['market mapping & talent intelligence','HR'],
  ['niche & leadership hiring','HR'],['offer management & negotiations','HR'],
  ['ats tracking & reporting','HR'],['recruitment strategy','HR'],
  // IT
  ['java','IT'],['python','IT'],['javascript','IT'],['typescript','IT'],['react','IT'],
  ['angular','IT'],['node.js','IT'],['aws','IT'],['azure','IT'],['gcp','IT'],
  ['docker','IT'],['kubernetes','IT'],['git','IT'],['mysql','IT'],['postgresql','IT'],
  ['mongodb','IT'],['sql','IT'],['microservices','IT'],['rest api','IT'],['graphql','IT'],
  ['devops','IT'],['machine learning','IT'],['deep learning','IT'],['data science','IT'],
  ['power bi','IT'],['tableau','IT'],['spark','IT'],['kafka','IT'],['cloud','IT'],
  ['full stack','IT'],['data architect','IT'],['data scientist','IT'],
  // Finance/Sales/Ops
  ['financial analysis','Finance'],['budgeting','Finance'],['mis reporting','Finance'],
  ['fp&a','Finance'],['gst','Finance'],['tds','Finance'],
  ['b2b sales','Sales'],['b2c sales','Sales'],['business development','Sales'],
  ['key account management','Sales'],['crm','Sales'],['supply chain management','Operations'],
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
  'hrbp':'HRBP','hrms':'HRMS','sap hcm':'SAP HCM',
  'power bi':'Power BI','aws':'AWS','azure':'Azure','gcp':'GCP',
  'rest api':'REST API','devops':'DevOps','machine learning':'Machine Learning',
  'data science':'Data Science','b2b sales':'B2B Sales','b2c sales':'B2C Sales',
  'key account management':'Key Account Management','crm':'CRM',
  'mis reporting':'MIS Reporting','fp&a':'FP&A','gst':'GST','tds':'TDS',
  'supply chain management':'Supply Chain Management',
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/g, '')
    .replace(/[ \t]{3,}/g, '  ').replace(/\n{4,}/g, '\n\n\n').trim()
}

function getLines(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
}

function isSectionHeader(line: string): boolean {
  return SECTION_HEADERS.has(line.toLowerCase().trim())
}

function toTitleCase(str: string): string {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

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
  for (const line of lines.slice(0,20)) {
    const m = line.match(/^(?:name|full\s*name)\s*[:\-]\s*(.+)/i)
    if (m?.[1]) {
      const n = m[1].trim()
      if (n.length>2 && n.length<50 && !n.includes('@') && !isSectionHeader(n)) return toTitleCase(n)
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
    if (/www\.|http|linkedin|github|profile|summary/i.test(line)) continue
    const words = line.split(/\s+/)
    if (words.length >= 2 && words.length <= 4 && words.every(w => /^[A-Z][a-z]{1,}$/.test(w) || /^[A-Z]{2,5}$/.test(w)))
      return line
  }
  return ''
}

function extractExperience(text: string): number | null {
  const patterns = [
    /total\s+(?:work\s+)?experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?)/i,
    /(\d+(?:\.\d+)?)\s*(?:\+\s*)?years?\s+of\s+(?:total\s+)?experience/i,
  ]
  for (const p of patterns) {
    const m = text.match(p); if (m) { const v=parseFloat(m[1]); if (v>0&&v<50) return v }
  }
  const months = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
  const ranges = [...text.matchAll(new RegExp(`(${months})\\s+(\\d{4})\\s*[\u2013\\-\u2014]\\s*(?:Present|${months}\\s+\\d{4})`, 'gi'))]
  if (ranges.length > 0) {
    const current = new Date().getFullYear(); let earliest = current
    for (const m of ranges) { const yr=parseInt(m[2]); if (yr<earliest&&yr>1970) earliest=yr }
    const exp = current - earliest; if (exp>0&&exp<50) return exp
  }
  return null
}

function extractCTC(text: string): { current: number|null; expected: number|null } {
  const unit = '\\s*(?:lpa|lakhs?|lacs?|l\\.p\\.a|l\\b)'
  const num = '([\\d.]+)'
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
  const cities = ['Mumbai','Delhi','New Delhi','Bangalore','Bengaluru','Hyderabad','Chennai',
    'Kolkata','Pune','Ahmedabad','Jaipur','Noida','Gurgaon','Gurugram','Lucknow',
    'Indore','Bhopal','Chandigarh','Kochi','Dehradun','Greater Noida','Faridabad']
  for (const city of cities) {
    if (new RegExp(`\\b${city}\\b`,'i').test(text)) return city
  }
  return ''
}

function extractCurrentCompany(text: string): string {
  const lines = getLines(text)
  for (let i = 0; i < lines.length; i++) {
    if (/Present/i.test(lines[i])) {
      for (let j = i-1; j >= Math.max(0, i-4); j--) {
        const candidate = lines[j]
        if (candidate.length>2 && candidate.length<80 && !isSectionHeader(candidate) &&
            !candidate.includes('@') && !/^\d/.test(candidate) && !/^[•\-\*]/.test(candidate) &&
            !/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i.test(candidate))
          return candidate
      }
    }
  }
  const lm = text.match(/(?:current\s+(?:company|employer)|currently\s+working\s+(?:at|with))\s*[:\-]?\s*([^\n,]{3,60})/i)
  if (lm?.[1]) return lm[1].trim()
  return ''
}

function extractDesignation(text: string): string {
  const lm = text.match(/(?:designation|current\s+(?:title|role|position))\s*[:\-]\s*([^\n,]{3,70})/i)
  if (lm?.[1]) return lm[1].trim()
  const lines = getLines(text)
  const titleWords = ['manager','engineer','developer','analyst','consultant','partner',
    'director','head','lead','architect','specialist','executive','officer',
    'recruiter','advisor','associate','coordinator','supervisor']
  for (let i = 0; i < lines.length; i++) {
    if (/Present/i.test(lines[i])) {
      for (let j = i-1; j >= Math.max(0, i-3); j--) {
        const line = lines[j]
        if (titleWords.some(k=>line.toLowerCase().includes(k)) &&
            line.length<80 && line.length>4 && !isSectionHeader(line) &&
            !/^\d/.test(line) && !/\d{4}/.test(line)) return line
      }
    }
  }
  for (const line of lines.slice(0,40)) {
    if (isSectionHeader(line)) continue
    if (titleWords.some(k=>line.toLowerCase().includes(k)) &&
        line.length<80 && line.length>4 && !line.includes('@') &&
        !/^\d/.test(line) && !/\d{4}/.test(line) && !/^[•\-\*]/.test(line)) return line
  }
  return ''
}

function extractEducation(text: string) {
  const degreeMap: Record<string,{level:string;degree:string}> = {
    'mba':{level:'Master',degree:'MBA'},'pgdm':{level:'Master',degree:'PGDM'},
    'mca':{level:'Master',degree:'MCA'},'m.tech':{level:'Master',degree:'M.Tech'},
    'm.sc':{level:'Master',degree:'M.Sc'},'m.com':{level:'Master',degree:'M.Com'},
    'm.e':{level:'Master',degree:'M.E'},'m.a':{level:'Master',degree:'M.A'},
    'pg \u2013':{level:'Master',degree:'PG'},'pg -':{level:'Master',degree:'PG'},
    'pg \u2014':{level:'Master',degree:'PG'},'pg\u2013':{level:'Master',degree:'PG'},
    'post graduate':{level:'Master',degree:'Post Graduate'},
    'phd':{level:'PhD',degree:'PhD'},'ph.d':{level:'PhD',degree:'PhD'},
    'b.tech':{level:'Bachelor',degree:'B.Tech'},'b.e':{level:'Bachelor',degree:'B.E'},
    'bca':{level:'Bachelor',degree:'BCA'},'bba':{level:'Bachelor',degree:'BBA'},
    'b.sc':{level:'Bachelor',degree:'B.Sc'},'b.com':{level:'Bachelor',degree:'B.Com'},
    'b.a':{level:'Bachelor',degree:'B.A'},'diploma':{level:'Diploma',degree:'Diploma'},
  }
  const lower = text.toLowerCase()
  let level='', degree='', field='', institution=''
  const ordered = ['phd','ph.d','mba','pgdm','mca','m.tech','m.sc','m.com','m.e','m.a',
    'pg \u2013','pg -','pg \u2014','pg\u2013','post graduate',
    'b.tech','b.e','bca','bba','b.sc','b.com','b.a','diploma']
  for (const key of ordered) { if (lower.includes(key)) { level=degreeMap[key].level; degree=degreeMap[key].degree; break } }

  const instKeywords = /(?:University|College|Institute(?:\s+of)?|School|IIT|NIT|BITS|Symbiosis|Amity|Manipal|VIT|SRM|XLRI|TISS|ISB)/i
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length < 5) continue
    if (!instKeywords.test(trimmed)) continue
    const instStart = trimmed.search(instKeywords)
    if (instStart < 0) continue
    const beforeInst = trimmed.slice(0, instStart).trim()
    // Strip degree prefix to get field
    const fieldRaw = beforeInst
      .replace(/^(?:PG|MBA|PGDM|B\.Com|B\.Tech|B\.Sc|B\.A|BCA|BBA|B\.E|M\.Com|M\.A|M\.Sc)\s*[\u2013\-\u2014\u2012]?\s*/i, '')
      .trim()
    if (fieldRaw.length > 2 && fieldRaw.length < 50 && !/\d{4}/.test(fieldRaw) &&
        !instKeywords.test(fieldRaw)) field = fieldRaw
    const instRaw = trimmed.slice(instStart).replace(/\s*\(\d{4}[\s\u2013\-\u2014]*\d{4}\)/, '').trim()
    if (instRaw.length > 3 && instRaw.length < 100) institution = instRaw
    if (field || institution) break
  }

  if (!institution) {
    for (const m of [...text.matchAll(/([A-Z][A-Za-z\s]+(?:University|College|Institute(?:\s+of\s+[A-Za-z\s]+)?|Symbiosis|Amity|Manipal|VIT|XLRI)[A-Za-z\s,]*)/g)]) {
      const inst = m[1].trim().replace(/\s+/g,' ')
      if (inst.length>5 && inst.length<100 && /^[A-Za-z\s,().&\-]+$/.test(inst)) { institution=inst; break }
    }
  }
  return { level, degree, field, institution }
}

function extractSkills(text: string): { skills: string[]; sector: string } {
  const found = new Map<string, string>()
  const lines = text.split('\n')

  // KEY FIX: bullet char is on its own line, skill text is on the NEXT line
  // Pattern: lines[i] = "•"  and  lines[i+1] = "Recruitment Strategy"
  for (let i = 0; i < lines.length - 1; i++) {
    const trimmed = lines[i].trim()
    // Standalone bullet char OR bullet+text on same line
    if (trimmed === '•' || trimmed === '-' || trimmed === '*' || trimmed === '\u25aa' || trimmed === '\u25b8') {
      // Skill is on the next non-empty line
      const nextLine = lines[i+1]?.trim() || ''
      if (nextLine.length > 2 && nextLine.length < 80 && !isSectionHeader(nextLine)) {
        const lo = nextLine.toLowerCase()
        if (SKILL_MAP.has(lo)) {
          found.set(lo, SKILL_MAP.get(lo)!)
        } else {
          // partial match
          for (const [skill, sector] of SKILL_MAP.entries()) {
            if (skill.length < 4) continue
            if (lo === skill || lo.includes(skill) || skill.includes(lo)) {
              found.set(skill, sector); break
            }
          }
        }
      }
    } else if (/^[•\-\*\u25aa\u25b8]\s+.{2,}/.test(trimmed)) {
      // Bullet + text on same line
      const content = trimmed.replace(/^[•\-\*\u25aa\u25b8]\s+/, '').trim()
      const lo = content.toLowerCase()
      if (SKILL_MAP.has(lo)) found.set(lo, SKILL_MAP.get(lo)!)
      else {
        for (const [skill, sector] of SKILL_MAP.entries()) {
          if (skill.length < 4 || !lo.includes(skill)) continue
          found.set(skill, sector)
        }
      }
    }
  }

  // Full-text scan for skills not caught by bullets
  const fullLower = text.toLowerCase()
  const sorted = Array.from(SKILL_MAP.entries()).sort((a,b)=>b[0].length-a[0].length)
  for (const [skill, sector] of sorted) {
    if (found.has(skill) || skill.length < 4) continue
    const esc = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = skill.includes(' ')
      ? new RegExp(`(?<![a-zA-Z])${esc}(?![a-zA-Z])`, 'i')
      : new RegExp(`\\b${esc}\\b`, 'i')
    if (re.test(fullLower)) found.set(skill, sector)
  }

  const sectorCount: Record<string,number> = {}
  for (const s of found.values()) sectorCount[s]=(sectorCount[s]||0)+1
  const sector = Object.entries(sectorCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Other'
  const skills = Array.from(found.keys()).slice(0,25)
    .map(s=>SKILL_DISPLAY[s.toLowerCase()]||s.split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '))
    .sort()
  return { skills, sector }
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

function calcConfidence(p: LocalParsedResume): number {
  const checks = [
    {v:p.full_name,w:2},{v:p.phone,w:2},{v:p.email,w:2},
    {v:p.current_designation,w:1},{v:p.current_company,w:1},
    {v:p.total_experience!==null?'1':'',w:1},{v:p.skills.length>2?'1':'',w:2},
    {v:p.education_degree,w:1},{v:p.current_location,w:1},
  ]
  const total=checks.reduce((s,c)=>s+c.w,0)
  const scored=checks.reduce((s,c)=>s+(c.v?c.w:0),0)
  return Math.round((scored/total)*100)/100
}

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