// app/api/parse-resume/route.ts
// Claude AI resume parser — handles IT, Non-IT, Sales, Finance, Legal, Engineering, Design

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SECTOR_SKILLS_REFERENCE = `
VALID SKILLS BY SECTOR (reference for what counts as a real skill):

SOFTWARE / IT:
Languages: Java, Python, JavaScript, TypeScript, C++, C#, Go, Ruby, PHP, Swift, Kotlin, R, MATLAB
Frontend: React, Angular, Vue.js, Next.js, HTML5, CSS3, Bootstrap, Tailwind, Redux, jQuery
Backend: Node.js, Spring Boot, Django, Flask, FastAPI, Laravel, ASP.NET, Express.js
Database: MySQL, PostgreSQL, MongoDB, Oracle, SQL Server, Redis, Cassandra, Firebase
Cloud: AWS, Azure, GCP, Docker, Kubernetes, Terraform, Jenkins, CI/CD, DevOps
Tools: Git, GitHub, Jira, Postman, Linux, Nginx, Maven
Concepts: Microservices, REST API, GraphQL, Agile, Scrum, OOP, TDD, System Design

DATA / ANALYTICS:
Power BI, Tableau, Excel, SQL, Machine Learning, Deep Learning, NLP, TensorFlow,
PyTorch, Pandas, NumPy, Spark, Hadoop, ETL, Data Modeling, Statistics, Scikit-learn

SALES / BUSINESS DEVELOPMENT:
B2B Sales, B2C Sales, Inside Sales, Field Sales, Key Account Management, CRM, Salesforce,
Lead Generation, Cold Calling, Territory Management, Channel Sales, Sales Strategy,
Revenue Growth, Client Acquisition, Negotiation, Sales Forecasting, Pipeline Management,
Retail Sales, Corporate Sales, FMCG Sales, Pharma Sales, Objection Handling

FINANCE / ACCOUNTS:
Financial Analysis, Financial Modeling, Budgeting, Forecasting, MIS Reporting, Variance Analysis,
Accounts Payable, Accounts Receivable, Bank Reconciliation, GST, TDS, Income Tax, Tally,
SAP FICO, Oracle Financials, QuickBooks, IFRS, GAAP, Audit, Taxation, Cost Accounting,
Treasury Management, Credit Analysis, Risk Management, Investment Banking,
Equity Research, Portfolio Management, FP&A, Derivatives

HUMAN RESOURCES:
Talent Acquisition, Recruitment, Sourcing, Screening, Onboarding, HRMS, SAP HCM,
Payroll Processing, Performance Management, Employee Engagement, Training & Development,
HR Policies, Labour Law, Statutory Compliance, HRBP, Compensation & Benefits,
Workforce Planning, Naukri, LinkedIn Recruiter

MARKETING:
Digital Marketing, SEO, SEM, Google Ads, Facebook Ads, Social Media Marketing,
Content Marketing, Email Marketing, Marketing Automation, HubSpot, Google Analytics,
Brand Management, Market Research, Campaign Management, Product Marketing,
Influencer Marketing, E-commerce, Shopify, CRO, A/B Testing

LEGAL:
Contract Drafting, Legal Research, Litigation, Corporate Law, Mergers & Acquisitions,
Intellectual Property, GDPR, Compliance, Due Diligence, Labour Law, Arbitration,
Real Estate Law, Tax Law, Legal Documentation, Regulatory Compliance, Company Law

ENGINEERING (Mechanical / Civil / Electrical / Chemical):
AutoCAD, SolidWorks, CATIA, ANSYS, MATLAB, Simulink, Revit, STAAD Pro, ETABS,
Project Management, MS Project, Primavera, Quality Control, ISO Standards, Six Sigma,
Lean Manufacturing, Kaizen, 5S, FMEA, GD&T, PLC, SCADA, PID,
Process Engineering, R&D, Formulation, Spectroscopy, Safety Management

DESIGN / CREATIVE:
Figma, Adobe XD, Sketch, Photoshop, Illustrator, InDesign, After Effects, Premiere Pro,
CorelDRAW, Canva, UI/UX Design, Wireframing, Prototyping, Graphic Design,
Motion Graphics, Typography, Branding, Video Editing, Blender, Cinema 4D

OPERATIONS / SUPPLY CHAIN:
Supply Chain Management, Logistics, Inventory Management, Procurement, Vendor Management,
SAP MM, SAP SD, SAP PP, Oracle SCM, Warehouse Management, ERP, Demand Planning,
Import/Export, Customs, Fleet Management, Operations Management

HEALTHCARE / PHARMA:
Clinical Research, Pharmacovigilance, Regulatory Affairs, Drug Safety, Medical Coding,
ICD-10, CPT, EMR, EHR, Medical Writing, Clinical Trials, GCP, GMP,
Quality Assurance, FDA Compliance, Hospital Management

EDUCATION / TRAINING:
Curriculum Development, Instructional Design, E-learning, LMS, Content Development,
Training Delivery, Classroom Management, Educational Technology, Coaching, Mentoring
`

export async function POST(request: NextRequest) {
  try {
    const { resumeText } = await request.json()

    if (!resumeText || resumeText.trim().length < 30) {
      return NextResponse.json({ error: 'Resume text too short or empty' }, { status: 400 })
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You are a senior recruitment expert with 20 years experience across IT, Sales, Finance, Legal, Engineering, Design, HR, Marketing, and Operations. Parse the resume below and extract structured data accurately.

${SECTOR_SKILLS_REFERENCE}

EXTRACTION RULES:

1. SKILLS (most critical):
   - First detect the sector/domain from the resume content
   - Extract ONLY real, professional skills: tools, software, technologies, methodologies, domain expertise, certifications
   - Cross-reference with the sector skills list above
   - NEVER include as skills: company names, city names, college names, full sentences, job descriptions, random words, encoding garbage like "Ã—" or "â€"
   - Each skill must be 1–4 words, under 40 characters
   - Max 25 skills, prioritize the most relevant and recognizable ones
   - VALID examples: "Python", "B2B Sales", "SAP FICO", "AutoCAD", "Six Sigma", "Google Ads", "Contract Drafting"
   - INVALID examples: "Established in 2004", "Mumbai", "Working with clients", "R Ã—â€"", "National Paints Factory"

2. EXPERIENCE:
   - total_experience: total years as decimal (5.5 = 5 years 6 months)
   - Calculate from work history dates if not stated explicitly
   - Return null only if truly impossible to determine

3. CTC:
   - Values in Lakhs Per Annum as decimal number
   - If stated monthly: multiply by 12 and divide by 100000
   - Return null if not mentioned

4. NOTICE PERIOD: number in days (30, 45, 60, 90). Return null if not found.

5. EDUCATION:
   - education_level: exactly one of "High School", "Diploma", "Bachelor", "Master", "PhD" or ""
   - education_institution: only the college/university name, no address, max 60 chars

6. LOCATION: city name only (e.g. "Mumbai", "Bangalore", "Dubai", "Sharjah")

7. DATE OF BIRTH: YYYY-MM-DD format or ""

8. SECTOR: detect and return one of: "IT", "Sales", "Finance", "HR", "Marketing", "Legal", "Engineering", "Design", "Operations", "Healthcare", "Education", "Other"

9. CONFIDENCE: 0.0–1.0 based on how completely the resume was parsed

RETURN ONLY VALID JSON — no markdown fences, no explanation, no text outside the JSON:
{
  "full_name": "",
  "email": "",
  "phone": "",
  "gender": "",
  "date_of_birth": "",
  "current_location": "",
  "current_company": "",
  "current_designation": "",
  "total_experience": null,
  "current_ctc": null,
  "expected_ctc": null,
  "notice_period": null,
  "education_level": "",
  "education_degree": "",
  "education_field": "",
  "education_institution": "",
  "skills": [],
  "sector": "",
  "confidence": 0.0
}

RESUME TEXT:
${resumeText.slice(0, 9000)}`
        }
      ]
    })

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : ''

    const cleanedResponse = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const parsed = JSON.parse(cleanedResponse)

    // Safety filter on skills
    if (Array.isArray(parsed.skills)) {
      parsed.skills = parsed.skills
        .filter(
          (s: any) =>
            typeof s === 'string' &&
            s.length > 1 &&
            s.length < 40 &&
            s.split(' ').length <= 4 &&
            !s.match(/^\d+$/) &&
            !s.match(/^(and|the|for|with|in|at|of|to|a|an)$/i) &&
            !s.match(/[Ã©â€œâ€™â€"Â]/) // reject encoding artifacts
        )
        .slice(0, 25)
    }

    // Sanitize institution
    if (
      parsed.education_institution &&
      (parsed.education_institution.split(' ').length > 10 ||
        parsed.education_institution.length > 80)
    ) {
      parsed.education_institution = ''
    }

    // Sanitize phone
    if (parsed.phone) {
      parsed.phone = parsed.phone.replace(/[\s\-().+]/g, '')
      if (parsed.phone.length < 7 || parsed.phone.length > 15) parsed.phone = ''
    }

    return NextResponse.json({ success: true, data: parsed })
  } catch (error: any) {
    console.error('Resume parse error:', error)
    return NextResponse.json(
      { error: 'Failed to parse resume: ' + error.message },
      { status: 500 }
    )
  }
}