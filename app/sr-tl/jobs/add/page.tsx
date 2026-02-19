'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SrTLAddJobPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [teamMembers, setTeamMembers] = useState<any[]>([]) // Changed from teamRecruiters
  const [user, setUser] = useState<any>(null)
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]) // Changed from selectedRecruiters

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
      loadTeamMembers(parsedUser.team_id) // Changed function name
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

// Load TLs from ALL teams + Recruiters from own team
const loadTeamMembers = async (teamId: string) => {
  // Get all TLs from any team
  const { data: allTLs } = await supabase
    .from('users')
    .select('id, full_name, email, role, team_id')
    .eq('role', 'team_leader')
    .order('full_name')
  // Get recruiters from own team
  const { data: ownRecruiters } = await supabase
    .from('users')
    .select('id, full_name, email, role, team_id')
    .eq('team_id', teamId)
    .eq('role', 'recruiter')
    .order('full_name')
  // Combine them
  const combined = [...(allTLs || []), ...(ownRecruiters || [])]
  setTeamMembers(combined)
}
  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev => 
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (selectedMembers.length === 0) {
      alert('Please assign at least one team member to this job')
      return
    }

    setLoading(true)

    try {
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

      if (jobError) throw jobError

      const jobId = jobData[0].id
      const jobCode = jobData[0].job_code

      const assignments = selectedMembers.map(memberId => ({
        job_id: jobId,
        recruiter_id: memberId, // This column handles both TLs and Recruiters
        assigned_by: user.id,
        is_active: true,
        positions_allocated: parseInt(formData.positions) || 1,
      }))

      const { error: assignError } = await supabase
        .from('job_recruiter_assignments')
        .insert(assignments)

      if (assignError) throw assignError

      alert(
        `âœ… Job created successfully!\n\nJob Code: ${jobCode}\nPositions: ${formData.positions}\nAssigned to ${selectedMembers.length} team member(s)`
      )
      
      router.push('/sr-tl/jobs')
    } catch (error: any) {
      console.error('Error creating job:', error)
      alert('Error: ' + (error.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  // Helper to get role badge
  const getRoleBadge = (role: string) => {
    if (role === 'team_leader') {
      return (
        <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-semibold rounded">
          TL
        </span>
      )
    }
    return (
      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
        Recruiter
      </span>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            â† Back to Jobs
          </button>
          <h2 className="text-2xl font-bold text-gray-900">Add New Job</h2>
          <p className="text-gray-600">Create a job opening and assign team members</p>
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

          {/* UPDATED: Team Member Assignment (TLs + Recruiters) */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              ðŸ‘¥ Assign Team Members (TLs & Recruiters) *
              {selectedMembers.length > 0 && (
                <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  {selectedMembers.length} selected
                </span>
              )}
            </h3>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
              ðŸ’¡ Assign this job to Team Leaders and/or Recruiters. All assigned members can add CVs.
            </div>
            
            {teamMembers.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                No team members available
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {teamMembers.map(member => (
                  <label
                    key={member.id}
                    className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition ${
                      selectedMembers.includes(member.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(member.id)}
                      onChange={() => toggleMember(member.id)}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-medium text-gray-900">
                          {member.full_name}
                        </div>
                        {getRoleBadge(member.role)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {member.email}
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
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t border-gray-200">
            <button 
              type="submit" 
              disabled={loading || selectedMembers.length === 0} 
              className="btn-primary disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Job & Assign Team'}
            </button>
            <button 
              type="button" 
              onClick={() => router.back()} 
              className="bg-white border border-gray-300 px-6 py-2 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}
