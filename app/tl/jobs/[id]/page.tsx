// app/tl/jobs/[id]/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function JobDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [assignedRecruiters, setAssignedRecruiters] = useState<string[]>([])

  useEffect(() => {
    if (params.id) {
      loadJob(params.id as string)
      loadTeamMembers()
    }
  }, [params.id])

  const loadJob = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          clients (
            id,
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
      
      // Load candidates to see who's working on this job
      const { data: candidates } = await supabase
        .from('candidates')
        .select('assigned_to')
        .eq('job_id', id)
      
      if (candidates) {
        const uniqueRecruiters = [...new Set(candidates.map(c => c.assigned_to))]
        setAssignedRecruiters(uniqueRecruiters as string[])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTeamMembers = async () => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}')
    const { data } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('team_id', userData.team_id)
      .eq('role', 'recruiter')

    if (data) setTeamMembers(data)
  }

  const handleUpdate = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          job_title: job.job_title,
          department: job.department,
          location: job.location,
          experience_min: job.experience_min,
          experience_max: job.experience_max,
          min_ctc: job.min_ctc,
          max_ctc: job.max_ctc,
          positions: job.positions,
          status: job.status,
          priority: job.priority,
          job_description: job.job_description,
          key_skills: job.key_skills,
        })
        .eq('id', job.id)

      if (error) throw error
      
      alert('✅ Job updated successfully!')
      setEditing(false)
      loadJob(job.id)
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setSaving(false)
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
        <div className="text-center py-12">
          <p className="text-gray-600">Job not found</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <button
              onClick={() => router.push('/tl/jobs')}
              className="text-sm text-gray-600 hover:text-gray-900 mb-2"
            >
              ← Back to Jobs
            </button>
            <h2 className="text-2xl font-bold text-gray-900">{job.job_title}</h2>
            <p className="text-gray-600">{job.clients?.company_name}</p>
          </div>
          <div className="flex gap-2">
            {!editing ? (
              <button onClick={() => setEditing(true)} className="btn-primary">
                Edit Job
              </button>
            ) : (
              <>
                <button onClick={handleUpdate} disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditing(false)} className="bg-gray-200 px-4 py-2 rounded-lg">
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Job Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="kpi-card">
            <div className="kpi-title">Positions</div>
            <div className="kpi-value">{job.positions_filled}/{job.positions}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Candidates</div>
            <div className="kpi-value">{assignedRecruiters.length * 10}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Priority</div>
            <div className="kpi-value text-xl">{job.priority.toUpperCase()}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Status</div>
            <div className="kpi-value text-xl">{job.status.toUpperCase()}</div>
          </div>
        </div>

        {/* Job Details */}
        <div className="grid grid-cols-2 gap-6">
          <div className="card">
            <h3 className="card-title">Job Information</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Department</dt>
                <dd className="mt-1">
                  {editing ? (
                    <input
                      type="text"
                      value={job.department || ''}
                      onChange={e => setJob({...job, department: e.target.value})}
                      className="input"
                    />
                  ) : (
                    <span className="text-sm text-gray-900">{job.department || 'N/A'}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Location</dt>
                <dd className="mt-1">
                  {editing ? (
                    <input
                      type="text"
                      value={job.location}
                      onChange={e => setJob({...job, location: e.target.value})}
                      className="input"
                    />
                  ) : (
                    <span className="text-sm text-gray-900">{job.location}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Experience Range</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {job.experience_min}-{job.experience_max} years
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">CTC Range</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  ₹{job.min_ctc}-{job.max_ctc} Lakhs
                </dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <h3 className="card-title">Client Information</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Company</dt>
                <dd className="mt-1 text-sm text-gray-900">{job.clients?.company_name}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Contact Person</dt>
                <dd className="mt-1 text-sm text-gray-900">{job.clients?.contact_person || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Contact Email</dt>
                <dd className="mt-1 text-sm text-gray-900">{job.clients?.contact_email || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Fee Structure</dt>
                <dd className="mt-1 text-sm text-gray-900">{job.clients?.fee_percentage}%</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Job Description */}
        <div className="card">
          <h3 className="card-title">Job Description</h3>
          {editing ? (
            <textarea
              value={job.job_description || ''}
              onChange={e => setJob({...job, job_description: e.target.value})}
              rows={6}
              className="input"
            />
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {job.job_description || 'No description provided'}
            </p>
          )}
        </div>

        {/* Key Skills */}
        <div className="card">
          <h3 className="card-title">Key Skills Required</h3>
          {editing ? (
            <textarea
              value={job.key_skills || ''}
              onChange={e => setJob({...job, key_skills: e.target.value})}
              rows={3}
              className="input"
              placeholder="e.g., Java, Spring Boot, Microservices, AWS"
            />
          ) : (
            <p className="text-sm text-gray-700">{job.key_skills || 'No skills specified'}</p>
          )}
        </div>

        {/* Assigned Recruiters */}
        <div className="card">
          <h3 className="card-title">Team Members Working on This Job</h3>
          <div className="space-y-2">
            {assignedRecruiters.length > 0 ? (
              teamMembers
                .filter(m => assignedRecruiters.includes(m.id))
                .map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">{member.full_name}</span>
                    <span className="text-sm text-gray-600">Active</span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-gray-600">No recruiters assigned yet</p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}