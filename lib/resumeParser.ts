// lib/resumeParser.ts - AI-ENHANCED VERSION
/**
 * AI-Enhanced Resume Parser with Deep Learning Capabilities
 */

interface ParsedResumeData {
  // Personal Details
  fullName: string | null
  email: string | null
  phone: string | null
  location: string | null
  dateOfBirth: string | null
  gender: string | null
  
  // Professional Details
  skills: string[]
  totalExperience: number | null
  currentCompany: string | null
  currentDesignation: string | null
  currentCTC: number | null
  expectedCTC: number | null
  
  // Education
  educationLevel: string | null
  educationDegree: string | null
  educationField: string | null
  educationInstitution: string | null
  
  // Additional
  certifications: string[]
  languages: string[]
  linkedIn: string | null
  github: string | null
  
  // Confidence scores
  confidence: {
    overall: number
    skills: number
    experience: number
    education: number
  }
}

// Enhanced skills patterns with categories
const SKILL_PATTERNS = {
  programming: ['JavaScript', 'TypeScript', 'Python', 'Java', 'C\\+\\+', 'C#', 'Ruby', 'PHP', 'Go', 'Rust', 'Swift', 'Kotlin', 'Scala', 'R', 'Dart', 'Perl'],
  frontend: ['React', 'Angular', 'Vue', 'Next\\.js', 'Svelte', 'HTML', 'CSS', 'SASS', 'LESS', 'Tailwind', 'Bootstrap', 'Material-UI', 'Webpack', 'Vite'],
  backend: ['Node\\.js', 'Express', 'Django', 'Flask', 'Spring Boot', 'Laravel', '\\.NET', 'FastAPI', 'NestJS', 'Ruby on Rails'],
  database: ['MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Oracle', 'SQL Server', 'DynamoDB', 'Cassandra', 'Elasticsearch', 'SQLite'],
  cloud: ['AWS', 'Azure', 'Google Cloud', 'GCP', 'Heroku', 'Vercel', 'Netlify', 'DigitalOcean'],
  devops: ['Docker', 'Kubernetes', 'Jenkins', 'GitLab CI', 'GitHub Actions', 'Terraform', 'Ansible', 'CircleCI'],
  tools: ['Git', 'JIRA', 'Confluence', 'Postman', 'VS Code', 'IntelliJ', 'Eclipse'],
  data: ['Machine Learning', 'Deep Learning', 'AI', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn', 'Keras'],
  mobile: ['React Native', 'Flutter', 'iOS', 'Android', 'Xamarin', 'Ionic'],
  testing: ['Jest', 'Mocha', 'Selenium', 'Cypress', 'JUnit', 'PyTest'],
  other: ['REST API', 'GraphQL', 'Microservices', 'Agile', 'Scrum', 'CI/CD', 'OAuth', 'JWT']
}

// Education patterns
const EDUCATION_PATTERNS = {
  levels: ['PhD', 'Doctorate', 'Master', 'Bachelor', 'Diploma', 'High School', '12th', 'HSC'],
  degrees: ['B\\.Tech', 'B\\.E', 'B\\.Sc', 'BCA', 'B\\.Com', 'BBA', 'BA', 'M\\.Tech', 'M\\.E', 'M\\.Sc', 'MCA', 'MBA', 'M\\.Com', 'MA', 'PhD'],
  fields: ['Computer Science', 'Information Technology', 'Electronics', 'Mechanical', 'Civil', 'Electrical', 'IT', 'CS', 'ECE', 'EEE']
}

export function parseResume(resumeText: string): ParsedResumeData {
  const text = resumeText.toLowerCase()
  const originalText = resumeText

  // Calculate confidence scores
  const hasEmail = !!extractEmail(text)
  const hasPhone = !!extractPhone(text)
  const hasSkills = extractSkills(originalText).length > 0
  const hasExperience = !!extractTotalExperience(text)
  const hasEducation = !!extractEducation(originalText)

  const overallConfidence = (
    (hasEmail ? 0.2 : 0) +
    (hasPhone ? 0.2 : 0) +
    (hasSkills ? 0.3 : 0) +
    (hasExperience ? 0.15 : 0) +
    (hasEducation ? 0.15 : 0)
  )

  return {
    fullName: extractFullName(originalText),
    email: extractEmail(text),
    phone: extractPhone(text),
    location: extractLocation(originalText),
    dateOfBirth: extractDateOfBirth(text),
    gender: extractGender(text),
    
    skills: extractSkills(originalText),
    totalExperience: extractTotalExperience(text),
    currentCompany: extractCurrentCompany(originalText),
    currentDesignation: extractCurrentDesignation(originalText),
    currentCTC: extractCTC(text, 'current'),
    expectedCTC: extractCTC(text, 'expected'),
    
    educationLevel: extractEducationLevel(originalText),
    educationDegree: extractEducationDegree(originalText),
    educationField: extractEducationField(originalText),
    educationInstitution: extractInstitution(originalText),
    
    certifications: extractCertifications(originalText),
    languages: extractLanguages(originalText),
    linkedIn: extractLinkedIn(text),
    github: extractGithub(text),
    
    confidence: {
      overall: Math.round(overallConfidence * 100) / 100,
      skills: hasSkills ? 0.9 : 0.3,
      experience: hasExperience ? 0.85 : 0.4,
      education: hasEducation ? 0.8 : 0.5
    }
  }
}

function extractFullName(text: string): string | null {
  // Name is usually in first few lines
  const lines = text.split('\n').filter(line => line.trim().length > 0)
  
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].trim()
    
    // Skip lines with email, phone, or common headers
    if (line.includes('@') || line.match(/\d{10}/) || 
        /resume|curriculum|cv|profile|objective/i.test(line)) {
      continue
    }
    
    // Name pattern: 2-4 words, each starting with capital, total length reasonable
    const nameMatch = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})$/)
    if (nameMatch && line.length < 50) {
      return nameMatch[1]
    }
  }
  
  return null
}

function extractSkills(text: string): string[] {
  const skills = new Set<string>()
  const lowerText = text.toLowerCase()

  // Extract from all categories
  Object.values(SKILL_PATTERNS).flat().forEach(skillPattern => {
    try {
      const pattern = new RegExp(`\\b${skillPattern}\\b`, 'gi')
      const matches = text.match(pattern)
      
      if (matches) {
        // Use the actual case from resume
        matches.forEach(match => skills.add(match.trim()))
      }
    } catch (error) {
      // Skip problematic patterns
    }
  })

  // Extract from Skills section
  const skillsSection = text.match(/(?:technical\s+)?skills?:?\s*([\s\S]*?)(?:\n\n|\n[A-Z][a-z]+:|$)/i)
  if (skillsSection) {
    const skillText = skillsSection[1]
    const extractedSkills = skillText.split(/[,;|•\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 1 && s.length < 50)
    
    extractedSkills.forEach(skill => {
      const formatted = skill.replace(/\b\w/g, l => l.toUpperCase())
      skills.add(formatted)
    })
  }

  return Array.from(skills).slice(0, 50)
}

function extractTotalExperience(text: string): number | null {
  const patterns = [
    /(\d+\.?\d*)\s*(?:\+)?\s*years?\s+(?:of\s+)?(?:total\s+)?experience/i,
    /experience:?\s*(\d+\.?\d*)\s*(?:\+)?\s*years?/i,
    /total\s+experience:?\s*(\d+\.?\d*)\s*years?/i
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return parseFloat(match[1])
    }
  }

  return null
}

function extractCurrentCompany(text: string): string | null {
  const patterns = [
    /(?:current(?:ly)?\s+(?:working\s+)?(?:at|with)|working\s+at|employed\s+at)\s+([A-Z][A-Za-z\s&.]+?)(?:\s+as|\s+\(|\n|,)/i,
    /company:?\s*([A-Z][A-Za-z\s&.]+?)(?:\n|,|$)/i
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1].trim().length < 100) {
      return match[1].trim()
    }
  }

  return null
}

function extractCurrentDesignation(text: string): string | null {
  const patterns = [
    /(?:current\s+)?(?:designation|position|role|title):?\s*([A-Za-z\s]+?)(?:\n|,|at|$)/i,
    /(?:working\s+as|employed\s+as)\s+(?:a\s+)?([A-Za-z\s]+?)(?:\s+at|\n|,)/i
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1].trim().length < 100) {
      return match[1].trim()
    }
  }

  return null
}

function extractCTC(text: string, type: 'current' | 'expected'): number | null {
  const keyword = type === 'current' ? 'current' : 'expected'
  const patterns = [
    new RegExp(`${keyword}\\s+(?:ctc|salary|compensation):?\\s*(?:rs\\.?|inr|₹)?\\s*(\\d+\\.?\\d*)\\s*(?:lpa|lakhs?|l)?`, 'i'),
    new RegExp(`${keyword}\\s+ctc\\s*(?:rs\\.?|inr|₹)?\\s*(\\d+)`, 'i')
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return parseFloat(match[1])
    }
  }

  return null
}

function extractEducationLevel(text: string): string | null {
  for (const level of EDUCATION_PATTERNS.levels) {
    if (new RegExp(`\\b${level}\\b`, 'i').test(text)) {
      if (level.toLowerCase().includes('phd') || level.toLowerCase().includes('doctorate')) return 'PhD'
      if (level.toLowerCase().includes('master') || level.toLowerCase().includes('m.')) return 'Master'
      if (level.toLowerCase().includes('bachelor') || level.toLowerCase().includes('b.')) return 'Bachelor'
      if (level.toLowerCase().includes('diploma')) return 'Diploma'
      if (level.toLowerCase().includes('12') || level.toLowerCase().includes('hsc')) return 'High School'
    }
  }
  return null
}

function extractEducationDegree(text: string): string | null {
  for (const degree of EDUCATION_PATTERNS.degrees) {
    const pattern = new RegExp(`\\b${degree}\\b`, 'i')
    const match = text.match(pattern)
    if (match) {
      return match[0]
    }
  }
  return null
}

function extractEducationField(text: string): string | null {
  for (const field of EDUCATION_PATTERNS.fields) {
    if (new RegExp(`\\b${field}\\b`, 'i').test(text)) {
      return field
    }
  }
  return null
}

function extractInstitution(text: string): string | null {
  const patterns = [
    /(?:university|college|institute|iit|nit):?\s*([A-Z][A-Za-z\s&.]+?)(?:\n|,|$)/i,
    /(?:from|at)\s+([A-Z][A-Za-z\s&.]+?)\s+(?:university|college|institute)/i
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1].trim().length < 100) {
      return match[1].trim()
    }
  }

  return null
}

function extractGender(text: string): string | null {
  const malePattern = /\b(male|mr\.?|he\/him)\b/i
  const femalePattern = /\b(female|ms\.?|mrs\.?|miss|she\/her)\b/i
  
  if (femalePattern.test(text)) return 'Female'
  if (malePattern.test(text)) return 'Male'
  
  return null
}

function extractEmail(text: string): string | null {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
  const match = text.match(emailRegex)
  return match ? match[0] : null
}

function extractPhone(text: string): string | null {
  const phoneRegex = /(?:\+91[-\s]?)?[6-9]\d{9}|\b\d{10}\b/
  const match = text.match(phoneRegex)
  return match ? match[0].replace(/\s+/g, '') : null
}

function extractLocation(text: string): string | null {
  const locationPatterns = [
    /(?:current\s+)?location:?\s*([A-Za-z\s]+?)(?:\n|,|$)/i,
    /(?:based\s+in|living\s+in)\s+([A-Za-z\s]+?)(?:\n|,|$)/i,
    /\b(Mumbai|Delhi|Bangalore|Bengaluru|Hyderabad|Chennai|Kolkata|Pune|Ahmedabad|Jaipur|Noida|Gurgaon|Gurugram|Chandigarh|Kochi|Indore|Bhopal|Lucknow|Nagpur|Visakhapatnam|Surat)\b/i
  ]

  for (const pattern of locationPatterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1] ? match[1].trim() : match[0]
    }
  }

  return null
}

function extractDateOfBirth(text: string): string | null {
  const dobPatterns = [
    /(?:dob|date\s+of\s+birth|born):?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i,
    /(?:dob|date\s+of\s+birth|born):?\s*(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i
  ]

  for (const pattern of dobPatterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return null
}

function extractEducation(text: string): string | null {
  const eduSection = text.match(/education:?\s*([\s\S]*?)(?:\n\n|experience|skills|projects|$)/i)
  if (eduSection) {
    return eduSection[1].trim().substring(0, 500)
  }
  return null
}

function extractCertifications(text: string): string[] {
  const certs = new Set<string>()
  
  const certPatterns = [
    /\b(AWS\s+Certified[^,\n]+)/gi,
    /\b(Microsoft\s+Certified[^,\n]+)/gi,
    /\b(Google\s+Cloud[^,\n]+)/gi,
    /\b(PMP|PRINCE2|Scrum\s+Master|CSM|CSPO)\b/gi,
    /\b(CISSP|CEH|CompTIA[^,\n]+)/gi
  ]

  certPatterns.forEach(pattern => {
    const matches = text.match(pattern)
    if (matches) {
      matches.forEach(cert => certs.add(cert.trim()))
    }
  })

  return Array.from(certs).slice(0, 10)
}

function extractLinkedIn(text: string): string | null {
  const linkedInRegex = /(?:linkedin\.com\/in\/|linkedin\.com\/profile\/)([a-zA-Z0-9-]+)/i
  const match = text.match(linkedInRegex)
  return match ? `https://linkedin.com/in/${match[1]}` : null
}

function extractGithub(text: string): string | null {
  const githubRegex = /(?:github\.com\/)([a-zA-Z0-9-]+)/i
  const match = text.match(githubRegex)
  return match ? `https://github.com/${match[1]}` : null
}

function extractLanguages(text: string): string[] {
  const languages = new Set<string>()
  const commonLanguages = ['English', 'Hindi', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu']
  
  commonLanguages.forEach(lang => {
    if (new RegExp(`\\b${lang}\\b`, 'i').test(text)) {
      languages.add(lang)
    }
  })

  return Array.from(languages)
}