// components/CandidateDetail.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
      const updates: any = { current_stage: newStage }

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

      // Log activity
      const userData = JSON.parse(localStorage.getItem('user') || '{}')
      await supabase.from('activity_log').insert([
        {
          user_id: userData.id,
          action: 'updated_stage',
          entity_type: 'candidate',
          entity_id: candidate.id,
          old_value: { stage: candidate.current_stage },
          new_value: { stage: newStage },
        },
      ])

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