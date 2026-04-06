// components/agent/AiShortlistPanel.helpers.ts
// buildJdText — builds a rich JD text block from all available job fields.
// Extracted as a separate file so it can be imported in both the panel
// and anywhere else that needs to construct JD text (e.g. tests).

export function buildJdText(job: {
  job_title?:              string | null
  job_description?:        string | null
  key_skills?:             string | null
  nice_to_have_skills?:    string | null
  education_requirement?:  string | null
  experience_min?:         number | null
  experience_max?:         number | null
  location?:               string | null
  work_mode?:              string | null
  notice_period_pref?:     string | null
  department?:             string | null
  job_type?:               string | null
}): string {
  const parts: string[] = []

  if (job.job_title)             parts.push(`Job Title: ${job.job_title}`)
  if (job.department)            parts.push(`Department: ${job.department}`)
  if (job.location)              parts.push(`Location: ${job.location}`)
  if (job.work_mode)             parts.push(`Work Mode: ${job.work_mode}`)
  if (job.job_type)              parts.push(`Job Type: ${job.job_type}`)

  if (job.experience_min != null && job.experience_max != null)
    parts.push(`Experience Required: ${job.experience_min}–${job.experience_max} years`)

  if (job.notice_period_pref)    parts.push(`Notice Period Preference: ${job.notice_period_pref}`)
  if (job.education_requirement) parts.push(`Education Requirement: ${job.education_requirement}`)
  if (job.key_skills)            parts.push(`Key Skills Required:\n${job.key_skills}`)
  if (job.nice_to_have_skills)   parts.push(`Nice to Have Skills:\n${job.nice_to_have_skills}`)
  if (job.job_description)       parts.push(`Job Description:\n${job.job_description}`)

  return parts.join('\n\n')
}