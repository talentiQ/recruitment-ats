// components/AddCandidateForm.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Job {
  id: string
  job_title: string
  clients: {
    company_name: string
  }
}

interface AddCandidateFormProps {
  userRole: 'recruiter' | 'team_leader' | string
  redirectPath?: string
}

export default function AddCandidateForm({ userRole, redirectPath }: AddCandidateFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [user, setUser] = useState<any>(null)

  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    job_id: '',
    current_company: '',
    current_designation: '',
    total_experience: '',
    relevant_experience: '',
    current_ctc: '',
    expected_ctc: '',
    notice_period: '',
    source_portal: 'Naukri',
    notes: '',
  })

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadJobs(parsedUser.team_id)
    }
  }, [])

  const loadJobs = async (teamId: string) => {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_title, clients(company_name)')
      .eq('assigned_team_id', teamId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (data) setJobs(data as Job[])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Insert candidate
      const { data, error } = await supabase
        .from('candidates')
        .insert([
          {
            ...formData,
            total_experience: parseFloat(formData.total_experience) || 0,
            relevant_experience: parseFloat(formData.relevant_experience) || 0,
            current_ctc: parseFloat(formData.current_ctc) || 0,
            expected_ctc: parseFloat(formData.expected_ctc) || 0,
            notice_period: parseInt(formData.notice_period) || 0,
            assigned_to: user.id,
            team_id: user.team_id,
            current_stage: 'sourced',
            date_sourced: new Date().toISOString(),
          },
        ])
        .select()

      if (error) throw error

      // Log activity
      await supabase.from('activity_log').insert([
        {
          user_id: user.id,
          action: 'created_candidate',
          entity_type: 'candidate',
          entity_id: data[0].id,
          new_value: { candidate_name: formData.full_name },
        },
      ])

      alert('Candidate added successfully! ✅')
      
      // Redirect based on role
      if (redirectPath) {
        router.push(redirectPath)
      } else if (userRole === 'team_leader') {
        router.push('/tl/candidates')
      } else {
        router.push('/recruiter/dashboard')
      }
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleCancel = () => {
    if (userRole === 'team_leader') {
      router.push('/tl/candidates')
    } else {
      router.push('/recruiter/dashboard')
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Add New Candidate</h2>
        <p className="text-gray-600">Source a new CV for your team's pipeline</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Basic Information */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone *
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Role *
              </label>
              <select
                name="job_id"
                value={formData.job_id}
                onChange={handleChange}
                className="input"
                required
              >
                <option value="">Select Job</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.job_title} - {job.clients?.company_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Current Details */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Company
              </label>
              <input
                type="text"
                name="current_company"
                value={formData.current_company}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Designation
              </label>
              <input
                type="text"
                name="current_designation"
                value={formData.current_designation}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Experience (Years)
              </label>
              <input
                type="number"
                step="0.5"
                name="total_experience"
                value={formData.total_experience}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Relevant Experience (Years)
              </label>
              <input
                type="number"
                step="0.5"
                name="relevant_experience"
                value={formData.relevant_experience}
                onChange={handleChange}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Compensation */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Compensation</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current CTC (Lakhs)
              </label>
              <input
                type="number"
                step="0.1"
                name="current_ctc"
                value={formData.current_ctc}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expected CTC (Lakhs)
              </label>
              <input
                type="number"
                step="0.1"
                name="expected_ctc"
                value={formData.expected_ctc}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notice Period (Days)
              </label>
              <input
                type="number"
                name="notice_period"
                value={formData.notice_period}
                onChange={handleChange}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Source & Notes */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Source Portal
              </label>
              <select
                name="source_portal"
                value={formData.source_portal}
                onChange={handleChange}
                className="input"
              >
                <option value="Naukri">Naukri</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Indeed">Indeed</option>
                <option value="Monster">Monster</option>
                <option value="Internal DB">Internal DB</option>
                <option value="Referral">Referral</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                className="input"
                placeholder="Any additional notes about the candidate..."
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-4 pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Adding...' : 'Add Candidate'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="bg-white border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:border-gray-400"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}