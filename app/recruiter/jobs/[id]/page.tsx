// app/recruiter/jobs/[id]/page.tsx - VIEW JOB DETAILS
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function RecruiterJobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      loadJob(params.id as string)
    }
  }, [params.id])

  const loadJob = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          clients (
            company_name,
            contact_person,
            contact_email,
            fee_percentage
          )
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setJob(data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  if (!job) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto text-center py-12">
          <p className="text-gray-600">Job not found</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-600 hover:text-gray-900 mb-3"
          >
            ← Back
          </button>
          <div className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-mono font-bold mb-2">
            {job.job_code}
          </div>
          <h2 className="text-3xl font-bold text-gray-900">{job.job_title}</h2>
          <p className="text-gray-600">{job.clients?.company_name}</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="card text-center">
            <div className="text-sm text-gray-600">Location</div>
            <div className="font-bold text-gray-900 mt-1">📍 {job.location}</div>
          </div>
          <div className="card text-center">
            <div className="text-sm text-gray-600">Experience</div>
            <div className="font-bold text-gray-900 mt-1">{job.experience_min}-{job.experience_max} yrs</div>
          </div>
          <div className="card text-center">
            <div className="text-sm text-gray-600">CTC Range</div>
            <div className="font-bold text-gray-900 mt-1">₹{job.min_ctc}-{job.max_ctc}L</div>
          </div>
          <div className="card text-center">
            <div className="text-sm text-gray-600">Positions</div>
            <div className="font-bold text-gray-900 mt-1">{job.positions_filled}/{job.positions}</div>
          </div>
        </div>

        {/* Job Description */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Job Description</h3>
          <p className="text-gray-700 whitespace-pre-wrap">
            {job.job_description || 'No description available'}
          </p>
        </div>

        {/* Key Skills */}
        {job.key_skills && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Key Skills Required</h3>
            <p className="text-gray-700">{job.key_skills}</p>
          </div>
        )}

        {/* Client Info */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Client Information</h3>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-gray-600">Company</dt>
              <dd className="font-medium text-gray-900">{job.clients?.company_name}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Contact Person</dt>
              <dd className="font-medium text-gray-900">{job.clients?.contact_person || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Contact Email</dt>
              <dd className="font-medium text-gray-900">{job.clients?.contact_email || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-600">Fee Percentage</dt>
              <dd className="font-medium text-gray-900">{job.clients?.fee_percentage}%</dd>
            </div>
          </dl>
        </div>

        {/* Action Button */}
        <div className="text-center">
          <button
            onClick={() => router.push(`/recruiter/jobs/${job.id}/add-candidate`)}
            className="btn-primary px-8 py-3"
          >
            + Add Candidate for this Job
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}