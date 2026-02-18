'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function TeamsManagementPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<any[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingTeam, setEditingTeam] = useState<any>(null)

  const [formData, setFormData] = useState({
    name: '',
    specialization: '',
    description: '',
  })

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      if (parsedUser.role !== 'system_admin') {
        alert('Access denied')
        router.push('/')
        return
      }
    }
    loadTeams()
  }, [])

  const loadTeams = async () => {
    setLoading(true)
    try {
      const { data: teamsData } = await supabase
        .from('teams')
        .select('*')
        .order('name')

      if (teamsData) {
        const teamsWithCounts = await Promise.all(
          teamsData.map(async (team) => {
            const { data: users } = await supabase
              .from('users')
              .select('id, full_name, role')
              .eq('team_id', team.id)

            const teamLeader = users?.find(u => u.role === 'team_leader')

            return {
              ...team,
              userCount: users?.length || 0,
              teamLeaderName: teamLeader?.full_name || 'Not assigned',
            }
          })
        )

        setTeams(teamsWithCounts)
      }
    } catch (error) {
      console.error('Error loading teams:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name) {
      alert('Please enter team name')
      return
    }

    setLoading(true)

    try {
      if (editingTeam) {
        const { error } = await supabase
          .from('teams')
          .update({
            name: formData.name,
            specialization: formData.specialization,
            description: formData.description,
          })
          .eq('id', editingTeam.id)

        if (error) throw error
        alert('✅ Team updated successfully!')
      } else {
        const { error } = await supabase
          .from('teams')
          .insert([{
            name: formData.name,
            specialization: formData.specialization,
            description: formData.description,
            is_active: true,
          }])

        if (error) throw error
        alert('✅ Team created successfully!')
      }

      setFormData({ name: '', specialization: '', description: '' })
      setShowAddForm(false)
      setEditingTeam(null)
      loadTeams()
    } catch (error: any) {
      console.error('Error:', error)
      alert('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (team: any) => {
    setEditingTeam(team)
    setFormData({
      name: team.name,
      specialization: team.specialization || '',
      description: team.description || '',
    })
    setShowAddForm(true)
  }

  const handleDeactivate = async (teamId: string) => {
    if (!confirm('Are you sure you want to deactivate this team?')) return

    try {
      const { error } = await supabase
        .from('teams')
        .update({ is_active: false })
        .eq('id', teamId)

      if (error) throw error
      alert('✅ Team deactivated')
      loadTeams()
    } catch (error: any) {
      alert('Error: ' + error.message)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Teams Management</h2>
            <p className="text-gray-600">Create and manage recruitment teams</p>
          </div>
          <button
            onClick={() => {
              setShowAddForm(true)
              setEditingTeam(null)
              setFormData({ name: '', specialization: '', description: '' })
            }}
            className="btn-primary"
          >
            + Create New Team
          </button>
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingTeam ? 'Edit Team' : 'Create New Team'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input"
                    placeholder="e.g., IT Recruitment Team"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Specialization
                  </label>
                  <input
                    type="text"
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                    className="input"
                    placeholder="e.g., IT, BFSI, Non-IT"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="input"
                  placeholder="Brief description of team focus..."
                />
              </div>

              <div className="flex gap-4">
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? 'Saving...' : editingTeam ? 'Update Team' : 'Create Team'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false)
                    setEditingTeam(null)
                    setFormData({ name: '', specialization: '', description: '' })
                  }}
                  className="bg-white border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Teams List */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Team Name</th>
                  <th>Specialization</th>
                  <th>Team Leader</th>
                  <th>Members</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.id}>
                    <td className="font-medium text-gray-900">{team.name}</td>
                    <td className="text-sm text-gray-600">{team.specialization || '-'}</td>
                    <td className="text-sm text-gray-600">{team.teamLeaderName}</td>
                    <td>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                        👥 {team.userCount}
                      </span>
                    </td>
                    <td>
                      {team.is_active ? (
                        <span className="badge-success">Active</span>
                      ) : (
                        <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-semibold">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(team)}
                          className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                        >
                          Edit
                        </button>
                        {team.is_active && (
                          <button
                            onClick={() => handleDeactivate(team.id)}
                            className="text-red-600 hover:text-red-900 text-sm font-medium"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
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