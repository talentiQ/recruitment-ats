// app/admin/users/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function UsersManagementPage() {
  const router = useRouter()
  const [loading,      setLoading]      = useState(true)
  const [users,        setUsers]        = useState<any[]>([])
  const [teams,        setTeams]        = useState<any[]>([])
  const [managers,     setManagers]     = useState<any[]>([])
  const [showAddForm,  setShowAddForm]  = useState(false)
  const [editingUser,  setEditingUser]  = useState<any>(null)

  const [resettingId,  setResettingId]  = useState<string | null>(null)

  const [formData, setFormData] = useState({
    email:              '',
    full_name:          '',
    role:               'recruiter',
    team_id:            '',
    reports_to:         '',
    job_title:          '',
    monthly_target:     '',
    quarterly_target:   '',
    annual_target:      '',
    target_start_date:  '',
    target_end_date:    '',
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
      const [usersRes, teamsRes] = await Promise.all([
        supabase
          .from('users')
          .select('*, teams(name), manager:reports_to(full_name)')
          .order('created_at', { ascending: false }),
        supabase
          .from('teams')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
      ])

      if (usersRes.data)  setUsers(usersRes.data)
      if (teamsRes.data)  setTeams(teamsRes.data)

      const { data: managersData } = await supabase
        .from('users')
        .select('id, full_name, role, team_id')
        .in('role', ['team_leader', 'sr_team_leader'])
        .eq('is_active', true)
        .order('full_name')
      if (managersData) setManagers(managersData)

    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (email: string, userId: string, isNewUser = false) => {
    if (!confirm(
      `${isNewUser ? 'Send invite email' : 'Send password reset email'} to ${email}?\n\n` +
      `The user will receive an email with a link to ${isNewUser ? 'set' : 'reset'} their password.`
    )) return

    setResettingId(userId)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      })

      if (error) throw error

      alert(
        `✅ Email sent successfully!\n\n` +
        `${email} will receive a link to ${isNewUser ? 'set their password and activate their account' : 'reset their password'}.\n\n` +
        `The link expires in 24 hours.`
      )
    } catch (error: any) {
      console.error('Reset password error:', error)
      alert(`❌ Failed to send email: ${error.message}`)
    } finally {
      setResettingId(null)
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
        const { data, error } = await supabase
          .from('users')
          .update({
            full_name:        formData.full_name,
            role:             formData.role,
            team_id:          formData.team_id       || null,
            reports_to:       formData.reports_to    || null,
            job_title:        formData.job_title,
            monthly_target:   formData.monthly_target   ? parseFloat(formData.monthly_target)   : null,
            quarterly_target: formData.quarterly_target ? parseFloat(formData.quarterly_target) : null,
            annual_target:    formData.annual_target    ? parseFloat(formData.annual_target)    : null,
            target_start_date:formData.target_start_date || null,
            target_end_date:  formData.target_end_date  || null,
            hierarchy_level:  getHierarchyLevel(formData.role),
            updated_at:       new Date().toISOString(),
          })
          .eq('id', editingUser.id)
          .select()

        if (error) throw new Error(`Database error: ${error.message}`)
        if (!data || data.length === 0) throw new Error('Update failed — no rows returned')

        alert('✅ User updated successfully!')
        setShowAddForm(false)
        setEditingUser(null)
        resetForm()
        await loadData()

      } else {
        const newUserId = crypto.randomUUID()

        const { error: insertError } = await supabase
          .from('users')
          .insert([{
            id:               newUserId,
            email:            formData.email,
            full_name:        formData.full_name,
            role:             formData.role,
            team_id:          formData.team_id       || null,
            reports_to:       formData.reports_to    || null,
            job_title:        formData.job_title,
            monthly_target:   formData.monthly_target   ? parseFloat(formData.monthly_target)   : null,
            quarterly_target: formData.quarterly_target ? parseFloat(formData.quarterly_target) : null,
            annual_target:    formData.annual_target    ? parseFloat(formData.annual_target)    : null,
            target_start_date:formData.target_start_date || null,
            target_end_date:  formData.target_end_date  || null,
            hierarchy_level:  getHierarchyLevel(formData.role),
            is_active:        true,
            created_at:       new Date().toISOString(),
            updated_at:       new Date().toISOString(),
          }])

        if (insertError) throw new Error(`Database error: ${insertError.message}`)

        alert(
          `✅ User profile created successfully!\n\n` +
          `Next step: Click the "Reset Password" button next to ${formData.full_name} in the user list ` +
          `to send them an invite email so they can set their password.`
        )

        setShowAddForm(false)
        resetForm()
        await loadData()
      }

    } catch (error: any) {
      console.error('handleSubmit error:', error)
      alert('❌ Error: ' + (error.message || 'Unknown error occurred'))
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => setFormData({
    email: '', full_name: '', role: 'recruiter',
    team_id: '', reports_to: '', job_title: '',
    monthly_target: '', quarterly_target: '', annual_target: '',
    target_start_date: '', target_end_date: '',
  })

  const getHierarchyLevel = (role: string): number => {
    switch (role) {
      case 'sr_team_leader': return 0
      case 'team_leader':    return 1
      case 'recruiter':      return 2
      default:               return 3
    }
  }

  const handleEdit = (user: any) => {
    setEditingUser(user)
    setFormData({
      email:              user.email,
      full_name:          user.full_name,
      role:               user.role,
      team_id:            user.team_id    || '',
      reports_to:         user.reports_to || '',
      job_title:          user.job_title  || '',
      monthly_target:     user.monthly_target?.toString()   || '',
      quarterly_target:   user.quarterly_target?.toString() || '',
      annual_target:      user.annual_target?.toString()    || '',
      target_start_date:  user.target_start_date || '',
      target_end_date:    user.target_end_date   || '',
    })
    setShowAddForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeactivate = async (userId: string) => {
    if (!confirm('Are you sure you want to deactivate this user?')) return
    try {
      const { error } = await supabase
        .from('users').update({ is_active: false }).eq('id', userId)
      if (error) throw error
      alert('User deactivated')
      await loadData()
    } catch (error: any) {
      alert('Error: ' + error.message)
    }
  }

  // ── FIXED: Sr. TLs are org-wide — no longer filtered by team_id ────────────
  const getFilteredManagers = () => {
    if (formData.role === 'team_leader') {
      return managers.filter(m => m.role === 'sr_team_leader')
    }
    if (formData.role === 'recruiter') {
      if (!formData.team_id) return []
      return managers.filter(m =>
        m.role === 'team_leader' ? m.team_id === formData.team_id : m.role === 'sr_team_leader'
      )
    }
    return managers
  }

  const getRoleBadge = (role: string) => ({
    system_admin:   'bg-purple-100 text-purple-800',
    ceo:            'bg-red-100 text-red-800',
    ops_head:       'bg-orange-100 text-orange-800',
    sr_team_leader: 'bg-indigo-100 text-indigo-800',
    team_leader:    'bg-blue-100 text-blue-800',
    recruiter:      'bg-green-100 text-green-800',
  }[role] || 'bg-gray-100 text-gray-800')

  const getRoleLabel = (role: string) => ({
    system_admin:   'SYSTEM ADMIN',
    ceo:            'CEO',
    ops_head:       'OPS HEAD',
    sr_team_leader: 'SR. TEAM LEADER',
    team_leader:    'SBU LEADER',
    recruiter:      'RECRUITER',
  }[role] || role.toUpperCase())

  const getTeamName = (teamId: string) =>
    teams.find(t => t.id === teamId)?.name || ''

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
            onClick={() => { setShowAddForm(true); setEditingUser(null); resetForm() }}
            className="btn-primary"
          >
            + Create New User
          </button>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <span className="text-xl mt-0.5">ℹ️</span>
          <div className="text-sm text-blue-800">
            <strong>How user password setup works:</strong> Create the user profile first, then click
            <strong> "Reset Password"</strong> next to their name. They'll receive an email with a secure
            link to set their own password. The same button resets passwords for existing users.
          </div>
        </div>

        {/* Add / Edit Form */}
        {showAddForm && (
          <div className="card bg-blue-50 border-2 border-blue-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingUser ? 'Edit User' : 'Create New User'}
              </h3>
              {editingUser && (
                <span className="text-sm text-gray-600">
                  Editing: <strong>{editingUser.email}</strong>
                </span>
              )}
            </div>

            {!editingUser && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                <strong>📋 Two steps to create a user:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-0.5">
                  <li>Fill this form and click <strong>Create User</strong> — saves their profile</li>
                  <li>Click <strong>Reset Password</strong> in the user list — sends them an invite email</li>
                </ol>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">

              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Basic Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="input"
                      required
                      disabled={!!editingUser}
                      placeholder="user@company.com"
                    />
                    {editingUser && (
                      <p className="text-xs text-gray-500 mt-1">Email cannot be changed after creation</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Job Title</label>
                    <input
                      type="text"
                      value={formData.job_title}
                      onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                      className="input"
                      placeholder="e.g., Senior Recruiter"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role *</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value, reports_to: '' })}
                      className="input"
                      required
                    >
                      <option value="recruiter">Recruiter</option>
                      <option value="team_leader">SBU Leader</option>
                      <option value="sr_team_leader">Sr. Team Leader</option>
                      <option value="ops_head">Operations Head</option>
                      <option value="ceo">CEO</option>
                      <option value="system_admin">System Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Team</label>
                    <select
                      value={formData.team_id}
                      onChange={(e) => setFormData({ ...formData, team_id: e.target.value, reports_to: '' })}
                      className="input"
                    >
                      <option value="">No Team</option>
                      {teams.map(team => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Reports To</label>
                    <select
                      value={formData.reports_to}
                      onChange={(e) => setFormData({ ...formData, reports_to: e.target.value })}
                      className="input"
                    >
                      <option value="">No Direct Manager</option>
                      {getFilteredManagers().map(manager => (
                        <option key={manager.id} value={manager.id}>
                          {manager.full_name} ({getRoleLabel(manager.role)})
                          {manager.team_id && ` — ${getTeamName(manager.team_id)}`}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.role === 'recruiter'      && formData.team_id && 'Can report to TL (same team) or any Sr. TL'}
                      {formData.role === 'team_leader'    && 'Can report to any Sr. TL'}
                      {formData.role === 'sr_team_leader' && 'Reports to management'}
                      {!formData.team_id && !['system_admin','ceo','ops_head','sr_team_leader','team_leader'].includes(formData.role) && 'Select a team first'}
                    </p>
                  </div>

                </div>
              </div>

              {/* Targets */}
              <div className="border-t border-gray-300 pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Revenue Targets <span className="text-gray-400 font-normal text-sm">(optional)</span></h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Monthly Target (₹)</label>
                    <input type="number" step="0.01" value={formData.monthly_target}
                      onChange={(e) => setFormData({ ...formData, monthly_target: e.target.value })}
                      className="input" placeholder="e.g., 150000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quarterly Target (₹)</label>
                    <input type="number" step="0.01" value={formData.quarterly_target}
                      onChange={(e) => setFormData({ ...formData, quarterly_target: e.target.value })}
                      className="input" placeholder="e.g., 450000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Annual Target (₹)</label>
                    <input type="number" step="0.01" value={formData.annual_target}
                      onChange={(e) => setFormData({ ...formData, annual_target: e.target.value })}
                      className="input" placeholder="e.g., 1800000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Target Start Date</label>
                    <input type="date" value={formData.target_start_date}
                      onChange={(e) => setFormData({ ...formData, target_start_date: e.target.value })}
                      className="input" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Target End Date</label>
                    <input type="date" value={formData.target_end_date}
                      onChange={(e) => setFormData({ ...formData, target_end_date: e.target.value })}
                      className="input" />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-4 pt-4 border-t border-gray-300">
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? 'Saving...' : editingUser ? '💾 Update User' : '✅ Create User'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setEditingUser(null); resetForm() }}
                  className="bg-white border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users Table */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading users...</p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Team</th>
                  <th>Monthly Target</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td className="font-medium">{user.full_name}</td>
                    <td className="text-sm text-gray-600">{user.email}</td>
                    <td>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadge(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="text-sm">{user.teams?.name || '—'}</td>
                    <td className="text-sm font-medium">
                      {user.monthly_target ? `₹${Number(user.monthly_target).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td>
                      {user.is_active
                        ? <span className="badge-success">Active</span>
                        : <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs">Inactive</span>
                      }
                    </td>
                    <td>
                      <div className="flex items-center gap-3">

                        <button
                          onClick={() => handleEdit(user)}
                          className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => handleResetPassword(user.email, user.id)}
                          disabled={resettingId === user.id}
                          className="text-sm font-medium text-amber-600 hover:text-amber-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                          title={`Send password reset email to ${user.email}`}
                        >
                          {resettingId === user.id
                            ? <><span className="animate-spin inline-block w-3 h-3 border border-amber-600 border-t-transparent rounded-full" /> Sending…</>
                            : '🔑 Reset Password'
                          }
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

                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}