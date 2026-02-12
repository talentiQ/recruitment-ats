// app/tl/jobs/[id]/candidates/page.tsx - VIEW ALL CANDIDATES FOR A JOB
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function JobCandidatesPage() {
  const params = useParams()
  const router = useRouter()
  const [job, setJob] = useState<any>(null)
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      loadJobAndCandidates(params.id as string)
    }
  }, [params.id])

  const loadJobAndCandidates = async (jobId: string) => {
    try {
      // Load job
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select(`
          *,
          clients (
            company_name
          )
        `)
        .eq('id', jobId)
        .single()

      if (jobError) throw jobError
      setJob(jobData)

      // Load candidates for this job
      const { data: candidatesData, error: candidatesError } = await supabase
        .from('candidates')
        .select(`
          *,
          users:assigned_to (
            full_name
          )
        `)
        .eq('job_id', jobId)
        .order('date_sourced', { ascending: false })

      if (candidatesError) throw candidatesError
      setCandidates(candidatesData || [])
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStageColor = (stage: string) => {
    const colors: { [key: string]: string } = {
      sourced: 'bg-gray-100 text-gray-800',
      screening: 'bg-yellow-100 text-yellow-800',
      interview_scheduled: 'bg-purple-100 text-purple-800',
      interview_completed: 'bg-blue-100 text-blue-800',
      offer_made: 'bg-indigo-100 text-indigo-800',
      offer_accepted: 'bg-green-100 text-green-800',
      joined: 'bg-green-200 text-green-900',
      rejected: 'bg-red-100 text-red-800',
      dropped: 'bg-gray-200 text-gray-600',
    }
    return colors[stage] || 'bg-gray-100 text-gray-800'
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
        <div className="text-center py-12">
          <p className="text-gray-600">Job not found</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Job Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono font-bold text-blue-900 text-xl">
                  {job.job_code}
                </span>
                <span className="text-gray-400">•</span>
                <h2 className="text-2xl font-bold text-gray-900">
                  {job.job_title}
                </h2>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>🏢 {job.clients?.company_name}</span>
                <span>📍 {job.location}</span>
                <span>💰 ₹{job.min_ctc}-{job.max_ctc}L</span>
                <span>📅 {job.experience_min}-{job.experience_max} yrs exp</span>
              </div>
            </div>
            <button
              onClick={() => router.push('/tl/jobs')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              ← Back to Jobs
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="bg-white rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {candidates.length}
              </div>
              <div className="text-sm text-gray-600">Total Candidates</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">
                {candidates.filter(c => c.current_stage === 'joined').length}
              </div>
              <div className="text-sm text-gray-600">Joined</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">
                {candidates.filter(c => c.current_stage.includes('interview')).length}
              </div>
              <div className="text-sm text-gray-600">In Interview</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {candidates.filter(c => c.current_stage === 'sourced').length}
              </div>
              <div className="text-sm text-gray-600">Sourced</div>
            </div>
          </div>
        </div>

        {/* Add Candidate Button */}
        <div className="flex justify-end">
          <button
            onClick={() => router.push(`/tl/jobs/${job.id}/add-candidate`)}
            className="btn-primary"
          >
            + Add Candidate for this Job
          </button>
        </div>

        {/* Candidates Table */}
        {candidates.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600 mb-4">No candidates added yet for this job</p>
            <button
              onClick={() => router.push(`/tl/jobs/${job.id}/add-candidate`)}
              className="btn-primary"
            >
              Add First Candidate
            </button>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Candidate Name</th>
                  <th>Phone</th>
                  <th>Current Company</th>
                  <th>Experience</th>
                  <th>Expected CTC</th>
                  <th>Stage</th>
                  <th>Assigned To</th>
                  <th>Sourced Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(candidate => (
                  <tr key={candidate.id}>
                    <td className="font-medium text-gray-900">
                      {candidate.full_name}
                    </td>
                    <td className="text-sm">{candidate.phone}</td>
                    <td className="text-sm">{candidate.current_company || 'N/A'}</td>
                    <td className="text-sm">{candidate.total_experience} yrs</td>
                    <td className="text-sm font-medium">₹{candidate.expected_ctc}L</td>
                    <td>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStageColor(candidate.current_stage)}`}>
                        {candidate.current_stage.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="text-sm">{candidate.users?.full_name}</td>
                    <td className="text-sm">
                      {new Date(candidate.date_sourced).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        onClick={() => router.push(`/tl/candidates/${candidate.id}`)}
                        className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}