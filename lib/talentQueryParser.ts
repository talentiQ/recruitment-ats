// lib/talentQueryParser.ts
// Smart rule-based NLP for recruitment search — no external dependencies

export interface ParsedFilters {
  skills: string[]
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

// ── 1. Skill aliases ──────────────────────────────────────────────────────────

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

// ── 2. Location aliases ───────────────────────────────────────────────────────

const LOCATION_ALIASES: Record<string, string> = {
  'ncr':          'Noida',
  'delhi ncr':    'Delhi',
  'new delhi':    'Delhi',
  'dilli':        'Delhi',
  'gurugram':     'Gurgaon',
  'dl':           'Delhi',
  'bengaluru':    'Bangalore',
  'blr':          'Bangalore',
  'bang':         'Bangalore',
  'bombay':       'Mumbai',
  'mum':          'Mumbai',
  'bom':          'Mumbai',
  'navi mumbai':  'Mumbai',
  'thane':        'Mumbai',
  'hyd':          'Hyderabad',
  'cyberabad':    'Hyderabad',
  'secunderabad': 'Hyderabad',
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

// ── 3. Industry aliases — updated to match expanded DEFAULT_INDUSTRIES ────────
//
// Each alias key maps to the exact canonical string used in DEFAULT_INDUSTRIES.
// Sorted longest-first at runtime in extractIndustry() so multi-word aliases
// ("investment banking") always win over shorter overlapping ones ("banking").

const INDUSTRY_ALIASES: Record<string, string> = {

  // Technology & Digital
  'it':                         'IT / Software Services',
  'tech':                       'IT / Software Services',
  'technology':                 'IT / Software Services',
  'software':                   'IT / Software Services',
  'software services':          'IT / Software Services',
  'it services':                'IT / Software Services',
  'information technology':     'IT / Software Services',
  'product':                    'Product & SaaS',
  'saas':                       'Product & SaaS',
  'product company':            'Product & SaaS',
  'product based':              'Product & SaaS',
  'it consulting':              'IT Consulting / Outsourcing',
  'outsourcing':                'IT Consulting / Outsourcing',
  'it outsourcing':             'IT Consulting / Outsourcing',
  'cloud':                      'Cloud & Infrastructure',
  'cloud computing':            'Cloud & Infrastructure',
  'infrastructure':             'Cloud & Infrastructure',
  'cybersecurity':              'Cybersecurity',
  'cyber security':             'Cybersecurity',
  'infosec':                    'Cybersecurity',
  'data science':               'Data Science & Analytics',
  'analytics':                  'Data Science & Analytics',
  'data analytics':             'Data Science & Analytics',
  'big data':                   'Data Science & Analytics',
  'ai':                         'AI / Machine Learning',
  'artificial intelligence':    'AI / Machine Learning',
  'machine learning':           'AI / Machine Learning',
  'ml':                         'AI / Machine Learning',
  'semiconductor':              'Semiconductors & Hardware',
  'semiconductors':             'Semiconductors & Hardware',
  'hardware':                   'Semiconductors & Hardware',
  'vlsi':                       'Semiconductors & Hardware',
  'telecom':                    'Telecom & Networking',
  'telecommunications':         'Telecom & Networking',
  'networking':                 'Telecom & Networking',
  'network':                    'Telecom & Networking',
  'gaming':                     'Gaming & Interactive Media',
  'game development':           'Gaming & Interactive Media',
  'interactive media':          'Gaming & Interactive Media',

  // Finance & Professional Services
  'banking':                    'Banking / Financial Services',
  'bank':                       'Banking / Financial Services',
  'bfsi':                       'Banking / Financial Services',
  'financial services':         'Banking / Financial Services',
  'nbfc':                       'NBFCs & Microfinance',
  'microfinance':               'NBFCs & Microfinance',
  'investment banking':         'Investment Banking & Capital Markets',
  'capital markets':            'Investment Banking & Capital Markets',
  'equity':                     'Investment Banking & Capital Markets',
  'ib':                         'Investment Banking & Capital Markets',
  'fintech':                    'FinTech & Payments',
  'payments':                   'FinTech & Payments',
  'payment gateway':            'FinTech & Payments',
  'insurance':                  'Insurance',
  'insurtech':                  'Insurance',
  'accounting':                 'Accounting / Audit',
  'audit':                      'Accounting / Audit',
  'ca firm':                    'Accounting / Audit',
  'finance':                    'Accounting / Audit',
  'wealth management':          'Wealth Management & Private Equity',
  'private equity':             'Wealth Management & Private Equity',
  'pe':                         'Wealth Management & Private Equity',
  'asset management':           'Wealth Management & Private Equity',
  'management consulting':      'Management Consulting',
  'strategy consulting':        'Management Consulting',
  'consulting':                 'Management Consulting',
  'legal':                      'Legal & Compliance',
  'law':                        'Legal & Compliance',
  'compliance':                 'Legal & Compliance',
  'tax':                        'Tax & Advisory',
  'taxation':                   'Tax & Advisory',
  'advisory':                   'Tax & Advisory',

  // Sales, Marketing & Media
  'sales':                      'Sales / Business Development',
  'business development':       'Sales / Business Development',
  'bd':                         'Sales / Business Development',
  'inside sales':               'Sales / Business Development',
  'digital marketing':          'Digital Marketing & AdTech',
  'adtech':                     'Digital Marketing & AdTech',
  'performance marketing':      'Digital Marketing & AdTech',
  'seo':                        'Digital Marketing & AdTech',
  'marketing':                  'Brand & Communications',
  'brand':                      'Brand & Communications',
  'communications':             'Brand & Communications',
  'content marketing':          'Brand & Communications',
  'ecommerce':                  'E-commerce & Retail Tech',
  'e-commerce':                 'E-commerce & Retail Tech',
  'retail tech':                'E-commerce & Retail Tech',
  'd2c':                        'E-commerce & Retail Tech',
  'quick commerce':             'E-commerce & Retail Tech',
  'media':                      'Media / Publishing / Broadcasting',
  'publishing':                 'Media / Publishing / Broadcasting',
  'broadcasting':               'Media / Publishing / Broadcasting',
  'news':                       'Media / Publishing / Broadcasting',
  'ott':                        'Media / Publishing / Broadcasting',
  'pr':                         'PR & Events',
  'public relations':           'PR & Events',
  'events':                     'PR & Events',
  'market research':            'Market Research',
  'research':                   'Market Research',

  // Manufacturing & Industrial
  'manufacturing':              'Manufacturing / General',
  'production':                 'Manufacturing / General',
  'industrial':                 'Manufacturing / General',
  'automobile':                 'Automobile & Auto Components',
  'automotive':                 'Automobile & Auto Components',
  'auto components':            'Automobile & Auto Components',
  'ev':                         'Electric Vehicles (EV)',
  'electric vehicle':           'Electric Vehicles (EV)',
  'electric vehicles':          'Electric Vehicles (EV)',
  'aerospace':                  'Aerospace & Defence',
  'defence':                    'Aerospace & Defence',
  'defense':                    'Aerospace & Defence',
  'chemicals':                  'Chemicals & Petrochemicals',
  'petrochemicals':             'Chemicals & Petrochemicals',
  'chemical':                   'Chemicals & Petrochemicals',
  'oil and gas':                'Oil & Gas / Energy',
  'oil & gas':                  'Oil & Gas / Energy',
  'energy':                     'Oil & Gas / Energy',
  'power':                      'Oil & Gas / Energy',
  'renewable energy':           'Renewable Energy / Solar',
  'solar':                      'Renewable Energy / Solar',
  'wind energy':                'Renewable Energy / Solar',
  'green energy':               'Renewable Energy / Solar',
  'metals':                     'Metals & Mining',
  'mining':                     'Metals & Mining',
  'steel':                      'Metals & Mining',
  'textile':                    'Textile & Apparel',
  'apparel':                    'Textile & Apparel',
  'garments':                   'Textile & Apparel',
  'fashion manufacturing':      'Textile & Apparel',
  'packaging':                  'Packaging & Printing',
  'printing':                   'Packaging & Printing',
  'plastics':                   'Plastics & Polymers',
  'polymers':                   'Plastics & Polymers',
  'rubber':                     'Plastics & Polymers',

  // Infrastructure & Construction
  'construction':               'Construction & Real Estate',
  'real estate':                'Construction & Real Estate',
  'realty':                     'Construction & Real Estate',
  'proptech':                   'Construction & Real Estate',
  'epc':                        'Infrastructure / EPC',
  'infra':                      'Infrastructure / EPC',
  'project management':         'Infrastructure / EPC',
  'airport':                    'Airports & Ports',
  'airports':                   'Airports & Ports',
  'ports':                      'Airports & Ports',
  'maritime':                   'Airports & Ports',
  'railways':                   'Railways & Metro',
  'metro':                      'Railways & Metro',
  'rail':                       'Railways & Metro',
  'smart city':                 'Urban Development & Smart Cities',
  'smart cities':               'Urban Development & Smart Cities',
  'urban development':          'Urban Development & Smart Cities',
  'facility management':        'Facility Management',
  'facilities':                 'Facility Management',
  'fm':                         'Facility Management',
  'interior design':            'Interior Design & Architecture',
  'architecture':               'Interior Design & Architecture',
  'interior':                   'Interior Design & Architecture',

  // Healthcare & Life Sciences
  'healthcare':                 'Hospitals & Healthcare Services',
  'hospital':                   'Hospitals & Healthcare Services',
  'health':                     'Hospitals & Healthcare Services',
  'clinical':                   'Hospitals & Healthcare Services',
  'pharma':                     'Pharmaceuticals',
  'pharmaceutical':             'Pharmaceuticals',
  'pharmaceuticals':            'Pharmaceuticals',
  'medical devices':            'Medical Devices & Diagnostics',
  'diagnostics':                'Medical Devices & Diagnostics',
  'medtech':                    'Medical Devices & Diagnostics',
  'biotech':                    'Biotech & Life Sciences',
  'life sciences':              'Biotech & Life Sciences',
  'biotechnology':              'Biotech & Life Sciences',
  'cro':                        'Clinical Research & CRO',
  'clinical research':          'Clinical Research & CRO',
  'clinical trials':            'Clinical Research & CRO',
  'healthtech':                 'HealthTech & Telemedicine',
  'telemedicine':               'HealthTech & Telemedicine',
  'health tech':                'HealthTech & Telemedicine',
  'wellness':                   'Wellness & Nutraceuticals',
  'nutraceuticals':             'Wellness & Nutraceuticals',
  'nutraceutical':              'Wellness & Nutraceuticals',
  'fitness':                    'Wellness & Nutraceuticals',

  // Consumer & Retail
  'retail':                     'Retail / FMCG',
  'fmcg':                       'Retail / FMCG',
  'consumer goods':             'Retail / FMCG',
  'fmcd':                       'Retail / FMCG',
  'food and beverages':         'Food & Beverages',
  'food & beverages':           'Food & Beverages',
  'food':                       'Food & Beverages',
  'beverages':                  'Food & Beverages',
  'fmcg food':                  'Food & Beverages',
  'qsr':                        'Quick Service Restaurants (QSR)',
  'restaurant':                 'Quick Service Restaurants (QSR)',
  'food service':               'Quick Service Restaurants (QSR)',
  'hospitality food':           'Quick Service Restaurants (QSR)',
  'fashion':                    'Fashion & Luxury',
  'luxury':                     'Fashion & Luxury',
  'jewellery':                  'Gems & Jewellery',
  'jewelry':                    'Gems & Jewellery',
  'gems':                       'Gems & Jewellery',
  'consumer electronics':       'Consumer Electronics',
  'electronics':                'Consumer Electronics',
  'white goods':                'Consumer Electronics',
  'building materials':         'Home & Building Materials',
  'home decor':                 'Home & Building Materials',
  'paints':                     'Home & Building Materials',
  'agriculture':                'Agriculture & Agri-Tech',
  'agritech':                   'Agriculture & Agri-Tech',
  'agri':                       'Agriculture & Agri-Tech',
  'agri-tech':                  'Agriculture & Agri-Tech',

  // Logistics, Supply Chain & Travel
  'logistics':                  'Logistics & Supply Chain',
  'supply chain':               'Logistics & Supply Chain',
  'scm':                        'Logistics & Supply Chain',
  'warehousing':                'Warehousing & 3PL',
  '3pl':                        'Warehousing & 3PL',
  'warehouse':                  'Warehousing & 3PL',
  'shipping':                   'Shipping & Freight',
  'freight':                    'Shipping & Freight',
  'courier':                    'Shipping & Freight',
  'aviation':                   'Aviation & Airlines',
  'airline':                    'Aviation & Airlines',
  'airlines':                   'Aviation & Airlines',
  'travel':                     'Travel, Tourism & Hospitality',
  'tourism':                    'Travel, Tourism & Hospitality',
  'hospitality':                'Travel, Tourism & Hospitality',
  'hotel':                      'Travel, Tourism & Hospitality',
  'hotels':                     'Travel, Tourism & Hospitality',

  // HR & Staffing
  'hr':                         'HR / Recruitment',
  'human resources':            'HR / Recruitment',
  'hrbp':                       'HR / Recruitment',
  'recruitment':                'Staffing & Workforce Solutions',
  'staffing':                   'Staffing & Workforce Solutions',
  'talent acquisition':         'Staffing & Workforce Solutions',
  'manpower':                   'Staffing & Workforce Solutions',
  'payroll services':           'Payroll & Compliance Services',
  'payroll':                    'Payroll & Compliance Services',
  'hrms':                       'HR Tech & HRMS',
  'hr tech':                    'HR Tech & HRMS',
  'hrtech':                     'HR Tech & HRMS',
  'worktech':                   'HR Tech & HRMS',

  // Education & Non-profit
  'education':                  'Education / Training',
  'training':                   'Education / Training',
  'learning':                   'Education / Training',
  'edtech':                     'EdTech',
  'ed-tech':                    'EdTech',
  'e-learning':                 'EdTech',
  'elearning':                  'EdTech',
  'online education':           'EdTech',
  'think tank':                 'Research & Think Tanks',
  'research institute':         'Research & Think Tanks',
  'ngo':                        'NGO / Social Sector',
  'social sector':              'NGO / Social Sector',
  'non-profit':                 'NGO / Social Sector',
  'nonprofit':                  'NGO / Social Sector',
  'csr':                        'NGO / Social Sector',
  'government':                 'Government & Public Sector',
  'public sector':              'Government & Public Sector',
  'psu':                        'Government & Public Sector',
  'defence psu':                'Government & Public Sector',

  // Shared Services & Operations
  'bpo':                        'BPO / KPO / ITES',
  'kpo':                        'BPO / KPO / ITES',
  'ites':                       'BPO / KPO / ITES',
  'call center':                'BPO / KPO / ITES',
  'call centre':                'BPO / KPO / ITES',
  'shared services':            'BPO / KPO / ITES',
  'gcc':                        'Global Capability Centre (GCC)',
  'global capability centre':   'Global Capability Centre (GCC)',
  'global capability center':   'Global Capability Centre (GCC)',
  'captive':                    'Global Capability Centre (GCC)',
  'operations':                 'Operations / General Management',
  'general management':         'Operations / General Management',
  'quality':                    'Quality & Compliance',
  'quality assurance':          'Quality & Compliance',
  'qa':                         'Quality & Compliance',
  'customer success':           'Customer Success & Support',
  'customer support':           'Customer Success & Support',
  'customer service':           'Customer Success & Support',
  'cx':                         'Customer Success & Support',
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

  // ── Negation ──────────────────────────────────────────────────────────────
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

  const skills       = extractSkills(cleanedQ, excludedSkills)
  const location     = extractLocation(cleanedQ)
  let { expMin, expMax } = extractExperience(cleanedQ)

  let seniority: ParsedFilters['seniority'] = null
  for (const [key, val] of Object.entries(SENIORITY_MAP)) {
    if (cleanedQ.includes(key)) {
      seniority = val.level
      if (expMin === null && expMax === null) {
        expMin = val.min
        expMax = val.max
      }
      break
    }
  }

  const { ctcMin, ctcMax } = extractCTC(cleanedQ)
  const noticePeriod       = extractNoticePeriod(cleanedQ)
  const industry           = extractIndustry(cleanedQ)

  const hasAnd   = /\b(and|&)\b/.test(cleanedQ) && skills.length > 1
  const hasAll   = /\ball\b/.test(cleanedQ)
  const skillMode: 'any' | 'all' = (hasAnd || hasAll) ? 'all' : 'any'

  const parts: string[] = []
  if (seniority)             parts.push(seniority)
  if (skills.length)         parts.push(`skills: ${skills.join(', ')}`)
  if (excludedSkills.length) parts.push(`excluding: ${excludedSkills.join(', ')}`)
  if (location)              parts.push(`in ${location}`)
  if (expMin || expMax)      parts.push(`${expMin ?? 0}–${expMax ?? '∞'} yrs`)
  if (ctcMax)                parts.push(`CTC ≤${ctcMax} LPA`)
  if (noticePeriod)          parts.push(`notice ${noticePeriod}d`)
  if (industry)              parts.push(`industry: ${industry}`)
  const rawIntent = parts.join(' · ') || original

  return {
    skills,
    excludedSkills,
    locations:           location ? [location] : [],
    experience:          { min: expMin, max: expMax },
    ctc:                 { min: ctcMin, max: ctcMax },
    noticePeriod,
    domains:             industry ? [industry] : [],
    seniority,
    skillMode,
    requirementKeywords: [],
    rawIntent,
  }
}

// Named alias — page.tsx imports parseTalentQuery, parser exports parseRecruitmentQuery
// Both names now work — no changes needed in the page
export const parseTalentQuery = parseRecruitmentQuery

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function resolveSkill(term: string): string | null {
  const t = term.toLowerCase().trim()
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    if (aliases.includes(t)) return canonical
  }
  return null
}

function extractSkills(q: string, exclude: string[]): string[] {
  const found: string[] = []
  const allPairs: Array<{ canonical: string; alias: string }> = []
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    for (const alias of aliases) allPairs.push({ canonical, alias })
  }
  allPairs.sort((a, b) => b.alias.length - a.alias.length)

  let remaining = q
  for (const { canonical, alias } of allPairs) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re      = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`)
    if (re.test(remaining)) {
      if (!found.includes(canonical) && !exclude.includes(canonical)) {
        found.push(canonical)
      }
      remaining = remaining.replace(new RegExp(escaped, 'g'), ' ')
    }
  }
  return found
}

function extractLocation(q: string): string | null {
  const sortedAliases = Object.entries(LOCATION_ALIASES)
    .sort((a, b) => b[0].length - a[0].length)
  for (const [alias, canonical] of sortedAliases) {
    if (q.includes(alias)) return canonical
  }
  const locMatch = q.match(/(?:from|in|at|based\s+in|location[:\s]+)\s+([a-z]+(?:\s+[a-z]+)?)/)
  if (locMatch) {
    const raw       = locMatch[1].trim()
    const canonical = LOCATION_ALIASES[raw]
    if (canonical) return canonical
    return raw.replace(/\b\w/g, c => c.toUpperCase())
  }
  return null
}

function extractExperience(q: string): { expMin: number | null; expMax: number | null } {
  const rangeMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:yr|year|yrs|years|y\b)/)
  if (rangeMatch) return { expMin: parseFloat(rangeMatch[1]), expMax: parseFloat(rangeMatch[2]) }

  let expMin: number | null = null
  let expMax: number | null = null

  const minMatch = q.match(/(\d+(?:\.\d+)?)\s*\+\s*(?:yr|year|yrs|years|y\b)|(?:min(?:imum)?|at\s+least|over|more\s+than)\s+(\d+(?:\.\d+)?)\s*(?:yr|year|yrs|years)/)
  if (minMatch) expMin = parseFloat(minMatch[1] ?? minMatch[2])

  const maxMatch = q.match(/(?:up\s+to|max(?:imum)?|under|less\s+than|below|upto)\s+(\d+(?:\.\d+)?)\s*(?:yr|year|yrs|years|y\b)/)
  if (maxMatch) expMax = parseFloat(maxMatch[1])

  if (!expMin && !expMax) {
    const standalone = q.match(/(\d+(?:\.\d+)?)\s*(?:yr|year|yrs|years)\s*(?:of\s+)?exp/)
                    || q.match(/exp(?:erience)?[:\s]+(\d+(?:\.\d+)?)/)
    if (standalone) {
      const v = parseFloat(standalone[1])
      expMin  = Math.max(0, v - 1)
      expMax  = v + 2
    }
  }
  return { expMin, expMax }
}

function extractCTC(q: string): { ctcMin: number | null; ctcMax: number | null } {
  const normalizeCTC = (val: string): number => {
    const n = parseFloat(val)
    if (n > 100) return Math.round(n / 100000 * 10) / 10
    return n
  }

  const rangeMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|l\b|lac|ctc)/)
  if (rangeMatch) return { ctcMin: normalizeCTC(rangeMatch[1]), ctcMax: normalizeCTC(rangeMatch[2]) }

  let ctcMin: number | null = null
  let ctcMax: number | null = null

  const maxMatch = q.match(/(?:under|below|less\s+than|up\s+to|upto|max(?:imum)?|budget)\s+(\d+(?:\.\d+)?)\s*(?:lpa|lakh|l\b|lac|ctc)?/)
  if (maxMatch) ctcMax = normalizeCTC(maxMatch[1])

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
  // Longest alias first — prevents "banking" matching before "investment banking"
  const sorted = Object.entries(INDUSTRY_ALIASES).sort((a, b) => b[0].length - a[0].length)
  for (const [alias, canonical] of sorted) {
    if (q.includes(alias)) return canonical
  }
  return null
}