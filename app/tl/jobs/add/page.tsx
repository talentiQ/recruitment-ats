// app/tl/jobs/add/page.tsx - SIMPLIFIED: Multiple recruiters per job, no position limits
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AddJobPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [teamRecruiters, setTeamRecruiters] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)
  const [selectedRecruiters, setSelectedRecruiters] = useState<string[]>([])

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
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadClients()
      loadTeamRecruiters(parsedUser)
    }
  }, [])

  const loadClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, company_name')
      .eq('status', 'active')
      .order('company_name')

    if (data) setClients(data)
  }

const loadTeamRecruiters = async (currentUser: any) => {
  try {
    console.log('🔍 Current user ID:', currentUser.id, '| Role:', currentUser.role)
       // DEBUG: See ALL users to check what's in the table
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, full_name, role, reports_to')
    console.log('📋 All users in DB:', allUsers)

    // Actual query
    const { data: recruiters, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, reports_to')
      .eq('reports_to', currentUser.id)
      .eq('role', 'recruiter')
      .order('full_name')

    console.log('👥 Recruiters found:', recruiters)
    console.log('❌ Error (if any):', error)

    if (error) throw error

    const teamMembers = [
      { id: currentUser.id, full_name: currentUser.full_name + ' (You)', email: currentUser.email, role: 'team_leader' },
      ...(recruiters || [])
    ]
    setTeamRecruiters(teamMembers)

  } catch (err) {
    console.error(err)
  }
}

  const toggleRecruiter = (recruiterId: string) => {
    setSelectedRecruiters(prev => 
      prev.includes(recruiterId)
        ? prev.filter(id => id !== recruiterId)
        : [...prev, recruiterId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (selectedRecruiters.length === 0) {
      alert('Please assign at least one recruiter to this job')
      return
    }

    setLoading(true)

    try {

      // Step 1: Insert job
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .insert([{
          client_id: formData.client_id,
          job_title: formData.job_title,
          department: formData.department,
          location: formData.location,
          job_type: formData.job_type,
          experience_min: parseInt(formData.experience_min) || 0,
          experience_max: parseInt(formData.experience_max) || 0,
          min_ctc: parseFloat(formData.min_ctc) || 0,
          max_ctc: parseFloat(formData.max_ctc) || 0,
          positions: parseInt(formData.positions) || 1,
          job_description: formData.job_description,
          key_skills: formData.key_skills,
          priority: formData.priority,
          target_close_date: formData.target_close_date || null,
          assigned_team_id: user.team_id,
          status: 'open',
          created_by: user.id,
        }])
        .select()

      if (jobError) {
        console.error('Job insert error:', jobError)
        throw jobError
      }
      const jobId = jobData[0].id
      const jobCode = jobData[0].job_code

      // Step 2: Insert recruiter assignments
      // All recruiters can work on all positions (no allocation limit)
      const assignments = selectedRecruiters.map(recruiterId => ({
        job_id: jobId,
        recruiter_id: recruiterId,
        assigned_by: user.id,
        is_active: true,
        positions_allocated: parseInt(formData.positions) || 1, // Each recruiter works on all positions
      }))
      const { error: assignError } = await supabase
        .from('job_recruiter_assignments')
        .insert(assignments)

      if (assignError) {
        console.error('Assignment insert error:', assignError)
        throw assignError
      }
      alert(
        `âœ… Job created successfully!\n\n` +
        `Job Code: ${jobCode}\n` +
        `Positions: ${formData.positions}\n` +
        `Assigned to ${selectedRecruiters.length} recruiter(s)\n\n` +
        `All recruiters can add CVs for this job!`
      )
      
      router.push('/tl/jobs')
    } catch (error: any) {
      console.error('Error creating job:', error)
      alert('Error creating job: ' + (error.message || 'Unknown error'))
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
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            ← Back to Jobs
          </button>
          <h2 className="text-2xl font-bold text-gray-900">Add New Job</h2>
          <p className="text-gray-600">Create a job opening and assign recruiters</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-6">
          {/* Basic Info */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client *
                </label>
                <select 
                  name="client_id" 
                  value={formData.client_id} 
                  onChange={handleChange} 
                  className="input" 
                  required
                >
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
                <input 
                  type="text" 
                  name="job_title" 
                  value={formData.job_title} 
                  onChange={handleChange} 
                  className="input" 
                  placeholder="e.g., Senior Java Developer"
                  required 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Department
                </label>
                <input 
                  type="text" 
                  name="department" 
                  value={formData.department} 
                  onChange={handleChange} 
                  className="input" 
                  placeholder="e.g., Engineering"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location *
                </label>
                <input 
                  type="text" 
                  name="location" 
                  value={formData.location} 
                  onChange={handleChange} 
                  className="input" 
                  placeholder="e.g., Bangalore, Mumbai"
                  required 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Type
                </label>
                <select 
                  name="job_type" 
                  value={formData.job_type} 
                  onChange={handleChange} 
                  className="input"
                >
                  <option value="Full-time">Full-time</option>
                  <option value="Contract">Contract</option>
                  <option value="Part-time">Part-time</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Positions
                </label>
                <input 
                  type="number" 
                  name="positions" 
                  value={formData.positions} 
                  onChange={handleChange} 
                  className="input" 
                  min="1"
                />
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
                <input 
                  type="number" 
                  name="experience_min" 
                  value={formData.experience_min} 
                  onChange={handleChange} 
                  className="input" 
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Experience (Years)
                </label>
                <input 
                  type="number" 
                  name="experience_max" 
                  value={formData.experience_max} 
                  onChange={handleChange} 
                  className="input" 
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min CTC (Lakhs)
                </label>
                <input 
                  type="number" 
                  step="0.1" 
                  name="min_ctc" 
                  value={formData.min_ctc} 
                  onChange={handleChange} 
                  className="input" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max CTC (Lakhs)
                </label>
                <input 
                  type="number" 
                  step="0.1" 
                  name="max_ctc" 
                  value={formData.max_ctc} 
                  onChange={handleChange} 
                  className="input" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select 
                  name="priority" 
                  value={formData.priority} 
                  onChange={handleChange} 
                  className="input"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Close Date
                </label>
                <input 
                  type="date" 
                  name="target_close_date" 
                  value={formData.target_close_date} 
                  onChange={handleChange} 
                  className="input" 
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
          </div>

          {/* RECRUITER ASSIGNMENT (Simplified - No Position Allocation) */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              Assign Recruiters *
              {selectedRecruiters.length > 0 && (
                <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  {selectedRecruiters.length} selected
                </span>
              )}
            </h3>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
             All assigned recruiters can add CVs for this job. Multiple recruiters working = better results!
            </div>
            
            {teamRecruiters.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                No recruiters available in your team. Please add recruiters first.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {teamRecruiters.map(recruiter => (
                  <label
                    key={recruiter.id}
                    className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition ${
                      selectedRecruiters.includes(recruiter.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRecruiters.includes(recruiter.id)}
                      onChange={() => toggleRecruiter(recruiter.id)}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {recruiter.full_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {recruiter.email}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Job Details */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Description
                </label>
                <textarea 
                  name="job_description" 
                  value={formData.job_description} 
                  onChange={handleChange} 
                  rows={5} 
                  className="input"
                  placeholder="Describe the role, responsibilities, and what the ideal candidate looks like..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Key Skills Required
                </label>
                <textarea 
                  name="key_skills" 
                  value={formData.key_skills} 
                  onChange={handleChange} 
                  rows={3} 
                  className="input" 
                  placeholder="e.g., Java, Spring Boot, Microservices, AWS, React"
                />
                <p className="text-xs text-gray-500 mt-1">
                These skills will be used for AI-powered candidate matching
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t border-gray-200">
            <button 
              type="submit" 
              disabled={loading || selectedRecruiters.length === 0} 
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Job & Assign Recruiters'}
            </button>
            <button 
              type="button" 
              onClick={() => router.back()} 
              className="bg-white border border-gray-300 px-6 py-2 rounded-lg hover:border-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
