// app/tl/candidates/add/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Same form as recruiter - TL can add candidates too
export default function TLAddCandidatePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [jobs, setJobs] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)

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
    const { data } = await supabase
      .from('jobs')
      .select('id, job_title, clients(company_name)')
      .eq('assigned_team_id', teamId)
      .eq('status', 'open')

    if (data) setJobs(data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('candidates')
        .insert([{
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
        }])

      if (error) throw error

      alert('✅ Candidate added successfully!')
      router.push('/tl/candidates')
    } catch (error: any) {
      alert('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Candidate</h2>

        <form onSubmit={handleSubmit} className="card space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
              <input type="text" name="full_name" value={formData.full_name} onChange={handleChange} className="input" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone *</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="input" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Job *</label>
              <select name="job_id" value={formData.job_id} onChange={handleChange} className="input" required>
                <option value="">Select Job</option>
                {jobs.map(job => (
                  <option key={job.id} value={job.id}>{job.job_title} - {job.clients?.company_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Current CTC (Lakhs)</label>
              <input type="number" step="0.1" name="current_ctc" value={formData.current_ctc} onChange={handleChange} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Expected CTC (Lakhs)</label>
              <input type="number" step="0.1" name="expected_ctc" value={formData.expected_ctc} onChange={handleChange} className="input" />
            </div>
          </div>

          <div className="flex gap-4">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Adding...' : 'Add Candidate'}
            </button>
            <button type="button" onClick={() => router.back()} className="bg-white border border-gray-300 px-4 py-2 rounded-lg">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}