// app/admin/dashboard/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function UsersManagementPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [managers, setManagers] = useState<any[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'recruiter',
    team_id: '',
    reports_to: '',
    job_title: '',
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
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      console.log('🔄 Loading users data...')

      const [usersData, teamsData] = await Promise.all([
        supabase
          .from('users')
          .select(`
            *,
            teams (name),
            manager:reports_to (full_name)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('teams')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
      ])

      console.log('✅ Users loaded:', usersData.data?.length)
      console.log('✅ Teams loaded:', teamsData.data?.length)

      if (usersData.data) setUsers(usersData.data)
      if (teamsData.data) setTeams(teamsData.data)

      // Get potential managers (Team Leaders and Sr. Team Leaders)
      const { data: managersData } = await supabase
        .from('users')
        .select('id, full_name, role, team_id')
        .in('role', ['team_leader', 'sr_team_leader'])
        .eq('is_active', true)
        .order('full_name')

      console.log('✅ Managers loaded:', managersData?.length)

      if (managersData) setManagers(managersData)
    } catch (error) {
      console.error('❌ Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.email || !formData.full_name) {
      alert('Please fill all required fields')
      return
    }

    setLoading(true)

    try {
      if (editingUser) {
        // ========================================
        // UPDATE EXISTING USER
        // ========================================
        console.log('🔄 Updating user:', editingUser.id)
        console.log('👤 User email:', editingUser.email)
        console.log('📝 Update data:', {
          full_name: formData.full_name,
          role: formData.role,
          team_id: formData.team_id || null,
          reports_to: formData.reports_to || null,
          job_title: formData.job_title,
          hierarchy_level: getHierarchyLevel(formData.role),
        })

        const updateData = {
          full_name: formData.full_name,
          role: formData.role,
          team_id: formData.team_id || null,
          reports_to: formData.reports_to || null,
          job_title: formData.job_title,
          hierarchy_level: getHierarchyLevel(formData.role),
          updated_at: new Date().toISOString(),
        }

        const { data, error } = await supabase
          .from('users')
          .update(updateData)
          .eq('id', editingUser.id)
          .select()

        console.log('📊 Update response:', { data, error })

        if (error) {
          console.error('❌ Database error:', error)
          throw new Error(`Database error: ${error.message}\nCode: ${error.code}\nDetails: ${error.details}`)
        }

        if (!data || data.length === 0) {
          console.error('❌ No data returned from update')
          throw new Error('Update failed: No data returned. User might not exist or RLS policy is blocking the update.')
        }

        console.log('✅ User updated successfully:', data[0])
        alert('✅ User updated successfully!')
        
        // Reset form state
        setShowAddForm(false)
        setEditingUser(null)
        setFormData({
          email: '',
          password: '',
          full_name: '',
          role: 'recruiter',
          team_id: '',
          reports_to: '',
          job_title: '',
        })
        
        // Force reload data
        console.log('🔄 Reloading user data...')
        await loadData()
        
      } else {
        // ========================================
        // CREATE NEW USER
        // ========================================
        if (!formData.password) {
          alert('Password is required for new users')
          setLoading(false)
          return
        }

        alert(
          '⚠️ MANUAL STEP REQUIRED:\n\n' +
          '1. Go to Supabase Dashboard → Authentication → Users\n' +
          '2. Click "Add user"\n' +
          '3. Email: ' + formData.email + '\n' +
          '4. Password: ' + formData.password + '\n' +
          '5. ✓ Check "Auto Confirm User"\n' +
          '6. Create user and COPY THE UUID\n' +
          '7. Come back and paste the UUID in the next prompt'
        )

        const authUUID = prompt('Paste the UUID from Supabase Auth:')
        
        if (!authUUID) {
          alert('User creation cancelled')
          setLoading(false)
          return
        }

        console.log('➕ Creating new user with UUID:', authUUID)

        const insertData = {
          id: authUUID,
          email: formData.email,
          full_name: formData.full_name,
          role: formData.role,
          team_id: formData.team_id || null,
          reports_to: formData.reports_to || null,
          job_title: formData.job_title,
          hierarchy_level: getHierarchyLevel(formData.role),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        const { data, error } = await supabase
          .from('users')
          .insert([insertData])
          .select()

        console.log('📊 Insert response:', { data, error })

        if (error) {
          console.error('❌ Database error:', error)
          throw new Error(`Database error: ${error.message}\nCode: ${error.code}`)
        }

        console.log('✅ User created successfully:', data[0])
        alert('✅ User created successfully!')
        
        setShowAddForm(false)
        setFormData({
          email: '',
          password: '',
          full_name: '',
          role: 'recruiter',
          team_id: '',
          reports_to: '',
          job_title: '',
        })
        
        await loadData()
      }

    } catch (error: any) {
      console.error('💥 Error in handleSubmit:', error)
      alert('❌ Error: ' + (error.message || 'Unknown error occurred'))
    } finally {
      setLoading(false)
    }
  }

  const getHierarchyLevel = (role: string): number => {
    switch (role) {
      case 'sr_team_leader': return 0
      case 'team_leader': return 1
      case 'recruiter': return 2
      default: return 3
    }
  }

  const handleEdit = (user: any) => {
    console.log('✏️ Editing user:', user)
    setEditingUser(user)
    setFormData({
      email: user.email,
      password: '',
      full_name: user.full_name,
      role: user.role,
      team_id: user.team_id || '',
      reports_to: user.reports_to || '',
      job_title: user.job_title || '',
    })
    setShowAddForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeactivate = async (userId: string) => {
    if (!confirm('Are you sure you want to deactivate this user?')) return

    try {
      console.log('🚫 Deactivating user:', userId)

      const { data, error } = await supabase
        .from('users')
        .update({ is_active: false })
        .eq('id', userId)
        .select()

      if (error) throw error

      console.log('✅ User deactivated:', data)
      alert('✅ User deactivated')
      await loadData()
    } catch (error: any) {
      console.error('❌ Deactivation error:', error)
      alert('Error: ' + error.message)
    }
  }

  const getRoleBadge = (role: string) => {
    const badges: { [key: string]: string } = {
      system_admin: 'bg-purple-100 text-purple-800',
      ceo: 'bg-red-100 text-red-800',
      ops_head: 'bg-orange-100 text-orange-800',
      sr_team_leader: 'bg-indigo-100 text-indigo-800',
      team_leader: 'bg-blue-100 text-blue-800',
      recruiter: 'bg-green-100 text-green-800',
    }
    return badges[role] || 'bg-gray-100 text-gray-800'
  }

  const getRoleLabel = (role: string) => {
    const labels: { [key: string]: string } = {
      system_admin: 'SYSTEM ADMIN',
      ceo: 'CEO',
      ops_head: 'OPS HEAD',
      sr_team_leader: 'SR. TEAM LEADER',
      team_leader: 'TEAM LEADER',
      recruiter: 'RECRUITER',
    }
    return labels[role] || role.toUpperCase()
  }

  const getFilteredManagers = () => {
    if (!formData.team_id) return managers

    return managers.filter(m => {
      // If assigning Team Leader, show only Sr. Team Leaders from same team
      if (formData.role === 'team_leader') {
        return m.role === 'sr_team_leader' && m.team_id === formData.team_id
      }
      // If assigning Recruiter, show Team Leaders from same team
      if (formData.role === 'recruiter') {
        return m.role === 'team_leader' && m.team_id === formData.team_id
      }
      return true
    })
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Users Management</h2>
            <p className="text-gray-600">Create and manage system users with hierarchy</p>
          </div>
          <button
            onClick={() => {
              setShowAddForm(true)
              setEditingUser(null)
              setFormData({
                email: '',
                password: '',
                full_name: '',
                role: 'recruiter',
                team_id: '',
                reports_to: '',
                job_title: '',
              })
            }}
            className="btn-primary"
          >
            + Create New User
          </button>
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="card bg-blue-50 border-2 border-blue-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingUser ? '✏️ Edit User' : '➕ Create New User'}
              </h3>
              {editingUser && (
                <span className="text-sm text-gray-600">
                  Editing: <strong>{editingUser.email}</strong>
                </span>
              )}
            </div>
            
            {!editingUser && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800">
                ⚠️ <strong>Important:</strong> User must be created in Supabase Authentication first!
                <br />
                <span className="text-xs">Go to Supabase Dashboard → Authentication → Users → Add user</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="input"
                    required
                    disabled={!!editingUser}
                  />
                  {editingUser && (
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                  )}
                </div>

                {!editingUser && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Temporary Password *
                    </label>
                    <input
                      type="text"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="input"
                      placeholder="For Supabase Auth"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Use in Supabase Auth creation</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="input"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={formData.job_title}
                    onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                    className="input"
                    placeholder="e.g., Team Leader - IT"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value, reports_to: '' })}
                    className="input"
                    required
                  >
                    <option value="recruiter">Recruiter</option>
                    <option value="team_leader">Team Leader</option>
                    <option value="sr_team_leader">Sr. Team Leader</option>
                    <option value="ops_head">Operations Head</option>
                    <option value="ceo">CEO</option>
                    <option value="system_admin">System Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team
                  </label>
                  <select
                    value={formData.team_id}
                    onChange={(e) => setFormData({ ...formData, team_id: e.target.value, reports_to: '' })}
                    className="input"
                  >
                    <option value="">No Team (Admin/Management)</option>
                    {teams.map(team => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reports To (Manager)
                  </label>
                  <select
                    value={formData.reports_to}
                    onChange={(e) => setFormData({ ...formData, reports_to: e.target.value })}
                    className="input"
                  >
                    <option value="">No Direct Manager</option>
                    {getFilteredManagers().map(manager => (
                      <option key={manager.id} value={manager.id}>
                        {manager.full_name} ({getRoleLabel(manager.role)})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.role === 'recruiter' && '💡 Select a Team Leader'}
                    {formData.role === 'team_leader' && '💡 Select a Sr. Team Leader (optional)'}
                    {formData.role === 'sr_team_leader' && '💡 Typically reports to management'}
                    {!formData.team_id && formData.role !== 'system_admin' && ' ⚠️ Select a team first'}
                  </p>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-gray-300">
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </span>
                  ) : (
                    editingUser ? '💾 Update User' : '➕ Create User'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false)
                    setEditingUser(null)
                    setFormData({
                      email: '',
                      password: '',
                      full_name: '',
                      role: 'recruiter',
                      team_id: '',
                      reports_to: '',
                      job_title: '',
                    })
                  }}
                  className="bg-white border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users List */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600 mb-4">No users found</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="btn-primary"
            >
              Create First User
            </button>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <div className="mb-4 text-sm text-gray-600">
              Showing <strong>{users.length}</strong> user{users.length !== 1 ? 's' : ''}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Job Title</th>
                  <th>Role</th>
                  <th>Team</th>
                  <th>Reports To</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td className="font-medium text-gray-900">{user.full_name}</td>
                    <td className="text-sm text-gray-600">{user.email}</td>
                    <td className="text-sm text-gray-600">{user.job_title || '-'}</td>
                    <td>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadge(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="text-sm text-gray-600">{user.teams?.name || 'No Team'}</td>
                    <td className="text-sm text-gray-600">{user.manager?.full_name || '-'}</td>
                    <td>
                      {user.is_active ? (
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
                          onClick={() => handleEdit(user)}
                          className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                        >
                          Edit
                        </button>
                        {user.is_active && user.role !== 'system_admin' && (
                          <button
                            onClick={() => handleDeactivate(user.id)}
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