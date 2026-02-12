// components/CandidateDetail.tsx - COMPLETE ENHANCED VERSION
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ResumeUpload from '@/components/ResumeUpload'
import CandidateTimeline from '@/components/CandidateTimeline'
import InterviewScheduler from '@/components/InterviewScheduler'
import SubmitToClient from '@/components/SubmitToClient'

interface Candidate {
  id: string
  full_name: string
  email: string
  phone: string
  current_company: string
  current_designation: string
  total_experience: number
  relevant_experience: number
  current_ctc: number
  expected_ctc: number
  notice_period: number
  current_stage: string
  source_portal: string
  notes: string
  date_sourced: string
  job_id: string
  
  // Resume fields
  resume_url: string
  resume_file_name: string
  resume_file_size: number
  resume_uploaded_at: string
  resume_parsed: boolean
  
  // Parsed resume data
  date_of_birth: string
  current_location: string
  parsed_skills: string[]
  parsed_education: string
  parsed_certifications: string[]
  linkedin_url: string
  github_url: string
  portfolio_url: string
  languages_known: string[]
  
  jobs: {
    job_title: string
    location: string
    min_ctc: number
    max_ctc: number
    clients: {
      company_name: string
      contact_person: string
    }
  }
  users: {
    full_name: string
    email: string
  }
}

interface CandidateDetailProps {
  candidateId: string
  userRole: 'recruiter' | 'team_leader' | string
}

export default function CandidateDetail({ candidateId, userRole }: CandidateDetailProps) {
  const router = useRouter()
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [newStage, setNewStage] = useState('')
  const [showScheduler, setShowScheduler] = useState(false)
  const [showClientSubmit, setShowClientSubmit] = useState(false)

  useEffect(() => {
    if (candidateId) {
      loadCandidate(candidateId)
    }
  }, [candidateId])

  const loadCandidate = async (id: string) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select(`
          *,
          jobs (
            job_title,
            location,
            min_ctc,
            max_ctc,
            clients (
              company_name,
              contact_person
            )
          ),
          users:assigned_to (
            full_name,
            email
          )
        `)
        .eq('id', id)
        .single()

      if (error) throw error

      setCandidate(data)
      setNewStage(data.current_stage)
    } catch (error) {
      console.error('Error loading candidate:', error)
      alert('Error loading candidate details')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStage = async () => {
    if (!candidate || newStage === candidate.current_stage) return

    setUpdating(true)
    try {
      const updates: any = { 
        current_stage: newStage,
        last_activity_date: new Date().toISOString(),
      }

      // Auto-set timestamp based on stage
      const now = new Date().toISOString()
      if (newStage === 'screening') updates.date_screening_started = now
      if (newStage === 'interview_scheduled') updates.date_interview_scheduled = now
      if (newStage === 'interview_completed') updates.date_interview_completed = now
      if (newStage === 'offer_made') updates.date_offer_made = now
      if (newStage === 'offer_accepted') updates.date_offer_accepted = now
      if (newStage === 'joined') updates.date_joined = now
      if (newStage === 'dropped') updates.date_dropped = now

      const { error } = await supabase
        .from('candidates')
        .update(updates)
        .eq('id', candidate.id)

      if (error) throw error

      // Add to timeline
      const userData = JSON.parse(localStorage.getItem('user') || '{}')
      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidate.id,
        activity_type: 'stage_changed',
        activity_title: 'Stage Updated',
        activity_description: `Stage changed from "${candidate.current_stage}" to "${newStage}"`,
        metadata: {
          old_stage: candidate.current_stage,
          new_stage: newStage,
        },
        performed_by: userData.id,
      }])

      // Log activity (old system)
      await supabase.from('activity_log').insert([{
        user_id: userData.id,
        action: 'updated_stage',
        entity_type: 'candidate',
        entity_id: candidate.id,
        old_value: { stage: candidate.current_stage },
        new_value: { stage: newStage },
      }])

      alert('Stage updated successfully! ✅')
      loadCandidate(candidate.id)
    } catch (error: any) {
      alert('Error updating stage: ' + error.message)
    } finally {
      setUpdating(false)
    }
  }

  const handleBack = () => {
    if (userRole === 'team_leader') {
      router.push('/tl/candidates')
    } else {
      router.push('/recruiter/candidates')
    }
  }

  const formatDate = (date: string) => {
    if (!date) return 'Not set'
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  const formatFileSize = (bytes: number) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(2)} MB`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Candidate not found</p>
        <button
          onClick={handleBack}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          ← Go Back
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <button
            onClick={handleBack}
            className="text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            ← Back to List
          </button>
          <h2 className="text-2xl font-bold text-gray-900">
            {candidate.full_name}
          </h2>
          <p className="text-gray-600">{candidate.jobs?.job_title || 'N/A'}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Sourced on</div>
          <div className="text-sm font-medium text-gray-900">
            {formatDate(candidate.date_sourced)}
          </div>
        </div>
      </div>

      {/* Update Stage Section */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-3">
          Update Pipeline Stage
        </h3>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Stage
            </label>
            <select
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              className="input"
            >
              <option value="sourced">Sourced</option>
              <option value="screening">Screening</option>
              <option value="interview_scheduled">Interview Scheduled</option>
              <option value="interview_completed">Interview Completed</option>
              <option value="offer_made">Offer Made</option>
              <option value="offer_accepted">Offer Accepted</option>
              <option value="documentation">Documentation</option>
              <option value="joined">Joined</option>
              <option value="rejected">Rejected</option>
              <option value="dropped">Dropped</option>
            </select>
          </div>
          <button
            onClick={handleUpdateStage}
            disabled={updating || newStage === candidate.current_stage}
            className="btn-primary"
          >
            {updating ? 'Updating...' : 'Update Stage'}
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowScheduler(!showScheduler)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          {showScheduler ? 'Cancel' : '📅 Schedule Interview'}
        </button>
        <button
          onClick={() => setShowClientSubmit(!showClientSubmit)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          {showClientSubmit ? 'Cancel' : '📧 Submit to Client'}
        </button>
      </div>

      {/* Interview Scheduler */}
      {showScheduler && (
        <div className="card bg-purple-50">
          <h3 className="card-title">Schedule Interview</h3>
          <InterviewScheduler
            candidateId={candidate.id}
            candidateName={candidate.full_name}
            jobId={candidate.job_id}
            onScheduled={() => {
              setShowScheduler(false)
              loadCandidate(candidate.id)
            }}
          />
        </div>
      )}

      {/* Client Submission */}
      {showClientSubmit && (
        <div className="card bg-green-50">
          <h3 className="card-title">Submit to Client</h3>
          <SubmitToClient
            candidateId={candidate.id}
            jobId={candidate.job_id}
            candidateName={candidate.full_name}
            onSubmitted={() => {
              setShowClientSubmit(false)
              loadCandidate(candidate.id)
            }}
          />
        </div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Information */}
        <div className="card">
          <h3 className="card-title">Contact Information</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {candidate.email || 'N/A'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Phone</dt>
              <dd className="mt-1 text-sm text-gray-900">{candidate.phone}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Source</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {candidate.source_portal}
              </dd>
            </div>
            {candidate.current_location && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Location</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  📍 {candidate.current_location}
                </dd>
              </div>
            )}
            {candidate.date_of_birth && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Date of Birth</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDate(candidate.date_of_birth)}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Current Details */}
        <div className="card">
          <h3 className="card-title">Current Details</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Company</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {candidate.current_company || 'N/A'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Designation</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {candidate.current_designation || 'N/A'}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Total Experience
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {candidate.total_experience} years
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Relevant Exp.
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {candidate.relevant_experience} years
                </dd>
              </div>
            </div>
          </dl>
        </div>

        {/* Compensation */}
        <div className="card">
          <h3 className="card-title">Compensation</h3>
          <dl className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Current CTC</dt>
                <dd className="mt-1 text-lg font-semibold text-gray-900">
                  ₹{candidate.current_ctc}L
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Expected CTC</dt>
                <dd className="mt-1 text-lg font-semibold text-blue-600">
                  ₹{candidate.expected_ctc}L
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Notice Period</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {candidate.notice_period} days
              </dd>
            </div>
          </dl>
        </div>

        {/* Job Details */}
        <div className="card">
          <h3 className="card-title">Job Details</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Position</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {candidate.jobs?.job_title || 'N/A'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Client</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {candidate.jobs?.clients?.company_name || 'N/A'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Location</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {candidate.jobs?.location || 'N/A'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Budget Range</dt>
              <dd className="mt-1 text-sm text-gray-900">
                ₹{candidate.jobs?.min_ctc}L - ₹{candidate.jobs?.max_ctc}L
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Notes */}
      {candidate.notes && (
        <div className="card">
          <h3 className="card-title">Notes</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {candidate.notes}
          </p>
        </div>
      )}

      {/* Resume Section */}
      <div className="card">
        <h3 className="card-title">Resume / CV</h3>
        
        {candidate.resume_url ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">
                  {candidate.resume_file_name || 'Resume.pdf'}
                </p>
                <p className="text-sm text-gray-500">
                  {formatFileSize(candidate.resume_file_size)} • Uploaded on {formatDate(candidate.resume_uploaded_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={candidate.resume_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  View
                </a>
                <a
                  href={candidate.resume_url}
                  download
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:border-gray-400 text-sm font-medium"
                >
                  Download
                </a>
              </div>
            </div>

            {/* Upload new version */}
            <details className="border-t border-gray-200 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                Upload New Version
              </summary>
              <div className="mt-4">
                <ResumeUpload 
                  candidateId={candidate.id} 
                  candidateName={candidate.full_name}
                  currentCandidateData={candidate}
                  onUploadComplete={() => loadCandidate(candidate.id)}
                />
              </div>
            </details>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">No resume uploaded yet</p>
            <ResumeUpload 
              candidateId={candidate.id} 
              candidateName={candidate.full_name}
              currentCandidateData={candidate}
              onUploadComplete={() => loadCandidate(candidate.id)}
            />
          </div>
        )}
      </div>

      {/* Parsed Resume Information */}
      {candidate.resume_parsed && (
        <div className="card">
          <h3 className="card-title">📄 Parsed Resume Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Skills */}
            {candidate.parsed_skills && candidate.parsed_skills.length > 0 && (
              <div className="col-span-2">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Key Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {candidate.parsed_skills.map((skill: string, i: number) => (
                    <span key={i} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {candidate.parsed_education && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Education</h4>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{candidate.parsed_education}</p>
              </div>
            )}

            {/* Certifications */}
            {candidate.parsed_certifications && candidate.parsed_certifications.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Certifications</h4>
                <ul className="text-sm text-gray-900 space-y-1">
                  {candidate.parsed_certifications.map((cert: string, i: number) => (
                    <li key={i}>• {cert}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Languages */}
            {candidate.languages_known && candidate.languages_known.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Languages</h4>
                <p className="text-sm text-gray-900">{candidate.languages_known.join(', ')}</p>
              </div>
            )}

            {/* Social Links */}
            {(candidate.linkedin_url || candidate.github_url || candidate.portfolio_url) && (
              <div className="col-span-2">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Professional Links</h4>
                <div className="flex gap-4">
                  {candidate.linkedin_url && (
                    <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                      🔗 LinkedIn
                    </a>
                  )}
                  {candidate.github_url && (
                    <a href={candidate.github_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                      🔗 GitHub
                    </a>
                  )}
                  {candidate.portfolio_url && (
                    <a href={candidate.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                      🔗 Portfolio
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      <div className="card">
        <h3 className="card-title">📋 Activity History & Timeline</h3>
        <CandidateTimeline candidateId={candidate.id} />
      </div>

      {/* Assigned Recruiter */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Assigned Recruiter</p>
            <p className="text-sm font-medium text-gray-900">
              {candidate.users?.full_name || 'Unknown'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Email</p>
            <p className="text-sm font-medium text-gray-900">
              {candidate.users?.email || 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}