// app/tl/jobs/add/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AddJobPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)

  const [formData, setFormData] = useState({
    client_id: '',
    job_title: '',
    department: '',
    location: '',
    job_type: 'Full-time',
    experience_min: '',
    experience_max: '',
    min_ctc: '',
    max_ctc: '',
    positions: '1',
    job_description: '',
    key_skills: '',
    priority: 'medium',
    target_close_date: '',
  })

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
    loadClients()
  }, [])

  const loadClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, company_name')
      .eq('status', 'active')
      .order('company_name')

    if (data) setClients(data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.from('jobs').insert([{
        ...formData,
        experience_min: parseInt(formData.experience_min) || 0,
        experience_max: parseInt(formData.experience_max) || 0,
        min_ctc: parseFloat(formData.min_ctc) || 0,
        max_ctc: parseFloat(formData.max_ctc) || 0,
        positions: parseInt(formData.positions) || 1,
        assigned_team_id: user.team_id,
        status: 'open',
        created_by: user.id,
      }])

      if (error) throw error

      alert('✅ Job added successfully!')
      router.push('/tl/jobs')
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
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Job</h2>

        <form onSubmit={handleSubmit} className="card space-y-6">
          {/* Basic Info */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client *
                </label>
                <select name="client_id" value={formData.client_id} onChange={handleChange} className="input" required>
                  <option value="">Select Client</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Title *
                </label>
                <input type="text" name="job_title" value={formData.job_title} onChange={handleChange} className="input" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Department
                </label>
                <input type="text" name="department" value={formData.department} onChange={handleChange} className="input" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location *
                </label>
                <input type="text" name="location" value={formData.location} onChange={handleChange} className="input" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Type
                </label>
                <select name="job_type" value={formData.job_type} onChange={handleChange} className="input">
                  <option value="Full-time">Full-time</option>
                  <option value="Contract">Contract</option>
                  <option value="Part-time">Part-time</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Positions
                </label>
                <input type="number" name="positions" value={formData.positions} onChange={handleChange} className="input" />
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Requirements</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Experience (Years)
                </label>
                <input type="number" name="experience_min" value={formData.experience_min} onChange={handleChange} className="input" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Experience (Years)
                </label>
                <input type="number" name="experience_max" value={formData.experience_max} onChange={handleChange} className="input" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min CTC (Lakhs)
                </label>
                <input type="number" step="0.1" name="min_ctc" value={formData.min_ctc} onChange={handleChange} className="input" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max CTC (Lakhs)
                </label>
                <input type="number" step="0.1" name="max_ctc" value={formData.max_ctc} onChange={handleChange} className="input" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select name="priority" value={formData.priority} onChange={handleChange} className="input">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Close Date
                </label>
                <input type="date" name="target_close_date" value={formData.target_close_date} onChange={handleChange} className="input" />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Description
                </label>
                <textarea name="job_description" value={formData.job_description} onChange={handleChange} rows={5} className="input" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Key Skills Required
                </label>
                <textarea name="key_skills" value={formData.key_skills} onChange={handleChange} rows={3} className="input" placeholder="e.g., Java, Spring Boot, Microservices, AWS" />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Adding...' : 'Add Job'}
            </button>
            <button type="button" onClick={() => router.back()} className="bg-white border border-gray-300 px-6 py-2 rounded-lg hover:border-gray-400">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}