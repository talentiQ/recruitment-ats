// app/admin/users/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Exit / Offboarding Modal ──────────────────────────────────────────────────
// Enforces the correct sequence before is_active = false is set.
// Rule: targets freeze from exit month; achievements preserved forever.

function ExitModal({
  user,
  allUsers,
  onClose,
  onConfirm,
}: {
  user: any
  allUsers: any[]
  onClose: () => void
  onConfirm: (data: ExitPayload) => Promise<void>
}) {
  const [lwDate,       setLwDate]       = useState('')
  const [reassignTo,   setReassignTo]   = useState('')
  const [exitReason,   setExitReason]   = useState<'resigned'|'terminated'|'contract_end'|''>('')
  const [step,         setStep]         = useState<1|2|3>(1)
  const [submitting,   setSubmitting]   = useState(false)
  const [openCands,    setOpenCands]    = useState<any[]>([])
  const [loadingCands, setLoadingCands] = useState(false)

  // Potential reassignees: active TLs / Sr.TLs who aren't this user
  const tls = allUsers.filter(u =>
    u.is_active &&
    u.id !== user.id &&
    ['team_leader', 'sr_team_leader', 'management', 'ops_head'].includes(u.role)
  )

  useEffect(() => {
    if (step === 2) fetchOpenCandidates()
  }, [step])

  const fetchOpenCandidates = async () => {
    setLoadingCands(true)
    const TERMINAL = ['joined','renege','screening_rejected','interview_rejected','offer_rejected','on_hold']
    const { data } = await supabase
      .from('candidates')
      .select('id, full_name, current_stage, jobs(job_title)')
      .eq('assigned_to', user.id)
      .not('current_stage', 'in', `(${TERMINAL.join(',')})`)
    setOpenCands(data || [])
    setLoadingCands(false)
  }

  const handleConfirm = async () => {
    if (!lwDate)     { alert('Please set last working date'); return }
    if (!exitReason) { alert('Please select exit reason'); return }
    if (openCands.length > 0 && !reassignTo) {
      alert('Please select a reassignee for open candidates'); return
    }
    setSubmitting(true)
    await onConfirm({ lwDate, reassignTo, exitReason, openCandidateIds: openCands.map(c => c.id) })
    setSubmitting(false)
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16,
    }}>
      <div style={{
        background:'#fff', borderRadius:16, width:'100%', maxWidth:560,
        boxShadow:'0 20px 60px rgba(0,0,0,0.2)', overflow:'hidden', maxHeight:'90vh', overflowY:'auto',
      }}>
        {/* Header */}
        <div style={{
          background:'linear-gradient(135deg,#dc2626,#b91c1c)',
          padding:'18px 24px', color:'#fff',
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <div>
            <div style={{ fontWeight:800, fontSize:16 }}>🚪 Offboard Recruiter</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)', marginTop:2 }}>
              {user.full_name} · {user.email}
            </div>
          </div>
          <button onClick={onClose} style={{
            background:'rgba(255,255,255,0.2)', border:'none', color:'#fff',
            width:32, height:32, borderRadius:'50%', cursor:'pointer', fontSize:16,
          }}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={{ display:'flex', borderBottom:'1px solid #e5e7eb' }}>
          {['Exit Details','Open Pipeline','Confirm'].map((label, i) => (
            <div key={i} style={{
              flex:1, padding:'10px', textAlign:'center', fontSize:12,
              fontWeight:600, cursor: i + 1 < step ? 'pointer' : 'default',
              color: step === i + 1 ? '#dc2626' : i + 1 < step ? '#16a34a' : '#9ca3af',
              borderBottom: step === i + 1 ? '2px solid #dc2626' : '2px solid transparent',
            }} onClick={() => { if (i + 1 < step) setStep(i + 1 as 1|2|3) }}>
              {i + 1 < step ? '✓ ' : `${i+1}. `}{label}
            </div>
          ))}
        </div>

        <div style={{ padding:'24px' }}>

          {/* ── Step 1: Exit Details ── */}
          {step === 1 && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{
                background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10,
                padding:'12px 16px', fontSize:13, color:'#7f1d1d',
              }}>
                ⚠️ <strong>Before deactivating</strong>, complete this checklist. Targets will be frozen
                from their last working month. All past achievements and revenue will be preserved permanently.
              </div>

              <div>
                <label style={{ fontSize:13, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>
                  Last Working Date <span style={{ color:'#dc2626' }}>*</span>
                </label>
                <input
                  type="date"
                  value={lwDate}
                  onChange={e => setLwDate(e.target.value)}
                  className="input"
                  style={{ width:'100%' }}
                />
                <div style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>
                  Targets will be zeroed from the month AFTER this date.
                </div>
              </div>

              <div>
                <label style={{ fontSize:13, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>
                  Exit Reason <span style={{ color:'#dc2626' }}>*</span>
                </label>
                <select
                  value={exitReason}
                  onChange={e => setExitReason(e.target.value as any)}
                  className="input"
                  style={{ width:'100%' }}
                >
                  <option value="">Select reason...</option>
                  <option value="resigned">Resigned</option>
                  <option value="terminated">Terminated</option>
                  <option value="contract_end">Contract Ended</option>
                </select>
                <div style={{ fontSize:11, color:'#dc2626', marginTop:4 }}>
                  ⚠️ Per policy — all incentives & variables are null & void upon resignation or termination.
                </div>
              </div>

              <button
                onClick={() => { if (!lwDate || !exitReason) { alert('Fill required fields'); return } setStep(2) }}
                style={{
                  padding:'10px 24px', background:'#dc2626', color:'#fff',
                  border:'none', borderRadius:8, cursor:'pointer',
                  fontSize:14, fontWeight:700, fontFamily:'inherit', marginTop:8,
                }}
              >
                Next: Review Open Pipeline →
              </button>
            </div>
          )}

          {/* ── Step 2: Open Pipeline ── */}
          {step === 2 && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {loadingCands ? (
                <div style={{ textAlign:'center', padding:'24px', color:'#6b7280' }}>
                  Loading open candidates...
                </div>
              ) : openCands.length === 0 ? (
                <div style={{
                  background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10,
                  padding:'16px', textAlign:'center', color:'#15803d', fontWeight:600,
                }}>
                  ✅ No open candidates — pipeline is clear
                </div>
              ) : (
                <>
                  <div style={{
                    background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10,
                    padding:'12px 16px', fontSize:13, color:'#92400e',
                  }}>
                    <strong>{openCands.length} active candidate(s)</strong> will be reassigned.
                    Their <strong>original_assigned_to</strong> (revenue credit) stays with {user.full_name}.
                    Only pipeline management moves to the new assignee.
                  </div>

                  <div style={{ maxHeight:200, overflowY:'auto', border:'1px solid #e5e7eb', borderRadius:8 }}>
                    {openCands.map((c, i) => (
                      <div key={c.id} style={{
                        padding:'8px 12px', borderBottom: i < openCands.length - 1 ? '1px solid #f1f5f9' : 'none',
                        display:'flex', justifyContent:'space-between', fontSize:13,
                      }}>
                        <span style={{ fontWeight:600, color:'#1e293b' }}>{c.full_name}</span>
                        <span style={{ color:'#6b7280' }}>
                          {c.jobs?.job_title} · <span style={{ textTransform:'capitalize' }}>
                            {c.current_stage?.replace(/_/g,' ')}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label style={{ fontSize:13, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>
                      Reassign to <span style={{ color:'#dc2626' }}>*</span>
                    </label>
                    <select
                      value={reassignTo}
                      onChange={e => setReassignTo(e.target.value)}
                      className="input"
                      style={{ width:'100%' }}
                    >
                      <option value="">Select TL / Manager...</option>
                      {tls.map(tl => (
                        <option key={tl.id} value={tl.id}>
                          {tl.full_name} ({tl.role.replace(/_/g,' ')})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div style={{ display:'flex', gap:10, marginTop:8 }}>
                <button onClick={() => setStep(1)} style={{
                  padding:'9px 20px', border:'1px solid #e5e7eb', background:'#fff',
                  borderRadius:8, cursor:'pointer', fontSize:14, fontWeight:600, fontFamily:'inherit',
                }}>← Back</button>
                <button onClick={() => setStep(3)} style={{
                  padding:'9px 20px', background:'#dc2626', color:'#fff',
                  border:'none', borderRadius:8, cursor:'pointer',
                  fontSize:14, fontWeight:700, fontFamily:'inherit', flex:1,
                }}>Next: Confirm Exit →</button>
              </div>
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 3 && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{
                background:'#f8fafc', border:'1px solid #e5e7eb',
                borderRadius:10, padding:'16px',
              }}>
                <div style={{ fontWeight:700, fontSize:14, color:'#1e293b', marginBottom:12 }}>
                  📋 Exit Summary — {user.full_name}
                </div>
                {[
                  { label:'Last Working Date',  val: lwDate },
                  { label:'Exit Reason',        val: exitReason.replace(/_/g,' ') },
                  { label:'Open Candidates',    val: openCands.length > 0 ? `${openCands.length} → reassigned to ${tls.find(t => t.id === reassignTo)?.full_name ?? '—'}` : 'None' },
                  { label:'Revenue Credit',     val: 'Stays with this recruiter permanently' },
                  { label:'Past Achievements',  val: 'Preserved in Hall of Fame & Incentives' },
                  { label:'Target from next month', val: 'Frozen to ₹0' },
                  { label:'Incentives / Variable', val: exitReason === 'resigned' || exitReason === 'terminated' ? '⚠️ Null & Void (per policy)' : 'Calculated up to LWD' },
                ].map(item => (
                  <div key={item.label} style={{
                    display:'flex', justifyContent:'space-between',
                    padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:13,
                  }}>
                    <span style={{ color:'#6b7280' }}>{item.label}</span>
                    <span style={{ fontWeight:600, color:'#1e293b', textAlign:'right', maxWidth:'60%' }}>
                      {item.val}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:10, marginTop:8 }}>
                <button onClick={() => setStep(2)} style={{
                  padding:'9px 20px', border:'1px solid #e5e7eb', background:'#fff',
                  borderRadius:8, cursor:'pointer', fontSize:14, fontWeight:600, fontFamily:'inherit',
                }}>← Back</button>
                <button onClick={handleConfirm} disabled={submitting} style={{
                  padding:'9px 20px', background: submitting ? '#9ca3af' : '#dc2626', color:'#fff',
                  border:'none', borderRadius:8, cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize:14, fontWeight:700, fontFamily:'inherit', flex:1,
                }}>
                  {submitting ? 'Processing...' : '✓ Confirm Exit & Deactivate'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ExitPayload {
  lwDate: string
  reassignTo: string
  exitReason: string
  openCandidateIds: string[]
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UsersManagementPage() {
  const router = useRouter()
  const [loading,       setLoading]       = useState(true)
  const [users,         setUsers]         = useState<any[]>([])
  const [teams,         setTeams]         = useState<any[]>([])
  const [managers,      setManagers]      = useState<any[]>([])
  const [showAddForm,   setShowAddForm]   = useState(false)
  const [editingUser,   setEditingUser]   = useState<any>(null)
  const [resettingId,   setResettingId]   = useState<string | null>(null)
  const [exitingUser,   setExitingUser]   = useState<any>(null)   // ← NEW

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
    date_of_birth:      '',
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
        supabase.from('teams').select('id, name').eq('is_active', true).order('name'),
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

  // ── Exit / Offboard handler ───────────────────────────────────────────────
  // Sequence (never set is_active = false directly):
  //  1. Set last_working_date + resignation_date + exit reason in users
  //  2. Set effective_target_end = end of LWD month
  //  3. Snapshot FY achievement into exit_achievement_snapshot
  //  4. Reassign open candidates (assigned_to → TL), preserve original_assigned_to
  //  5. Set is_active = false LAST

  const handleExitConfirm = async (payload: ExitPayload) => {
    if (!exitingUser) return

    const { lwDate, reassignTo, exitReason, openCandidateIds } = payload
    const lwdDate = new Date(lwDate)

    // End of last working month (targets frozen from month after)
    const effectiveTargetEnd = new Date(lwdDate.getFullYear(), lwdDate.getMonth() + 1, 0)
      .toISOString().slice(0, 10)

    // FY achievement snapshot
    const now = new Date()
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
    const { data: achievementData } = await supabase
      .from('candidates')
      .select('revenue_earned, date_joined')
      .eq('assigned_to', exitingUser.id)
      .eq('current_stage', 'joined')
      .gte('date_joined', `${fyStart}-04-01`)
      .lte('date_joined', `${fyStart + 1}-03-31`)

    const fyAchieved = achievementData?.reduce((s, c) => s + (c.revenue_earned ?? 0), 0) ?? 0

    try {
      // Step 1 — Update user record
      const { error: userErr } = await supabase
        .from('users')
        .update({
          last_working_date:        lwDate,
          resignation_date:         exitReason === 'resigned' ? lwDate : null,
          // Store exit reason in kpi_notes (re-use existing column)
          kpi_notes:                `exit_reason:${exitReason}`,
          // Store effective target end so incentives page can zero post-exit months
          target_end_date:          effectiveTargetEnd,
          // Store FY snapshot in existing jsonb-compatible field
          exit_achievement_snapshot: JSON.stringify({
            fy: fyStart,
            fy_achieved: fyAchieved,
            lwd: lwDate,
            exit_reason: exitReason,
            snapshot_at: new Date().toISOString(),
          }),
          updated_at:               new Date().toISOString(),
        })
        .eq('id', exitingUser.id)

      if (userErr) throw userErr

      // Step 2 — Reassign open candidates (preserve original credit)
      if (openCandidateIds.length > 0 && reassignTo) {
        // First: set original_assigned_to = current assigned_to (preserve revenue credit)
        // If original_assigned_to already set, don't overwrite (could be a re-reassignment)
        const { error: origErr } = await supabase
          .from('candidates')
          .update({
            original_assigned_to: exitingUser.id,
            reassigned_at:        new Date().toISOString(),
            reassigned_by:        null, // admin action
            assigned_to:          reassignTo,
          })
          .in('id', openCandidateIds)
          .is('original_assigned_to', null) // only set if not already set

        if (origErr) console.warn('original_assigned_to update:', origErr)

        // For any already reassigned ones, just update assigned_to
        const { error: reassignErr } = await supabase
          .from('candidates')
          .update({ assigned_to: reassignTo, reassigned_at: new Date().toISOString() })
          .in('id', openCandidateIds)
          .not('original_assigned_to', 'is', null)

        if (reassignErr) console.warn('reassign update:', reassignErr)
      }

      // Step 3 — Set is_active = false LAST
      const { error: deactivateErr } = await supabase
        .from('users')
        .update({ is_active: false })
        .eq('id', exitingUser.id)

      if (deactivateErr) throw deactivateErr

      alert(
        `✅ ${exitingUser.full_name} successfully offboarded.\n\n` +
        `• Targets frozen from ${effectiveTargetEnd}\n` +
        `• ${openCandidateIds.length} candidates reassigned\n` +
        `• FY achievement (₹${fyAchieved.toLocaleString('en-IN')}) preserved\n` +
        `• Hall of Fame & incentive history retained`
      )

      setExitingUser(null)
      await loadData()

    } catch (error: any) {
      alert('❌ Error during offboarding: ' + error.message)
      console.error(error)
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
      alert(`✅ Email sent to ${email}.`)
    } catch (error: any) {
      alert(`❌ Failed: ${error.message}`)
    } finally {
      setResettingId(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.email || !formData.full_name) { alert('Please fill all required fields'); return }
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
            date_of_birth:    formData.date_of_birth    || null,
            hierarchy_level:  getHierarchyLevel(formData.role),
            updated_at:       new Date().toISOString(),
          })
          .eq('id', editingUser.id)
          .select()
        if (error) throw new Error(`Database error: ${error.message}`)
        if (!data || data.length === 0) throw new Error('Update failed')
        alert('✅ User updated successfully!')
        setShowAddForm(false); setEditingUser(null); resetForm()
        await loadData()
      } else {
        const newUserId = prompt(
          '🔑 Enter the Auth UID for this user:\n\nGo to Supabase → Authentication → Users → find user → copy UID'
        )?.trim()
        if (!newUserId) { setLoading(false); return }

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
            date_of_birth:    formData.date_of_birth    || null,
            hierarchy_level:  getHierarchyLevel(formData.role),
            is_active:        true,
            created_at:       new Date().toISOString(),
            updated_at:       new Date().toISOString(),
          }])
        if (insertError) throw new Error(`Database error: ${insertError.message}`)
        alert(`✅ User created! Click "Reset Password" to send invite.`)
        setShowAddForm(false); resetForm()
        await loadData()
      }
    } catch (error: any) {
      alert('❌ Error: ' + (error.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => setFormData({
    email:'', full_name:'', role:'recruiter', team_id:'', reports_to:'',
    job_title:'', monthly_target:'', quarterly_target:'', annual_target:'',
    target_start_date:'', target_end_date:'', date_of_birth:'',
  })

  const getHierarchyLevel = (role: string): number => ({
    sr_team_leader: 0, team_leader: 1, recruiter: 2,
  }[role] ?? 3)

  const handleEdit = (user: any) => {
    setEditingUser(user)
    setFormData({
      email:            user.email,
      full_name:        user.full_name,
      role:             user.role,
      team_id:          user.team_id    || '',
      reports_to:       user.reports_to || '',
      job_title:        user.job_title  || '',
      monthly_target:   user.monthly_target?.toString()   || '',
      quarterly_target: user.quarterly_target?.toString() || '',
      annual_target:    user.annual_target?.toString()    || '',
      target_start_date:user.target_start_date || '',
      target_end_date:  user.target_end_date   || '',
      date_of_birth:    user.date_of_birth     || '',
    })
    setShowAddForm(true)
    window.scrollTo({ top:0, behavior:'smooth' })
  }

  const getFilteredManagers = () => {
    if (formData.role === 'team_leader')
      return managers.filter(m => m.role === 'sr_team_leader')
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

  const getTeamName = (teamId: string) => teams.find(t => t.id === teamId)?.name || ''

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

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

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <span className="text-xl mt-0.5">ℹ️</span>
          <div className="text-sm text-blue-800">
            <strong>Offboarding flow:</strong> Use the <strong>"Offboard"</strong> button (not Deactivate directly).
            It freezes targets from the exit month, preserves all historical revenue and Hall of Fame data,
            and reassigns open candidates before deactivating the account.
          </div>
        </div>

        {showAddForm && (
          <div className="card bg-blue-50 border-2 border-blue-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingUser ? 'Edit User' : 'Create New User'}
              </h3>
              {editingUser && (
                <span className="text-sm text-gray-600">Editing: <strong>{editingUser.email}</strong></span>
              )}
            </div>

            {!editingUser && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                <strong>📋 Two steps:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-0.5">
                  <li>Fill form → <strong>Create User</strong></li>
                  <li>Click <strong>Reset Password</strong> to send invite email</li>
                </ol>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Basic Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                    <input type="email" value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="input" required disabled={!!editingUser} placeholder="user@company.com" />
                    {editingUser && <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                    <input type="text" value={formData.full_name}
                      onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                      className="input" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Job Title</label>
                    <input type="text" value={formData.job_title}
                      onChange={e => setFormData({ ...formData, job_title: e.target.value })}
                      className="input" placeholder="e.g., Senior Recruiter" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date of Birth
                      <span className="ml-2 text-xs text-blue-600 font-normal">(used for Birthday Leave)</span>
                    </label>
                    <input type="date" value={formData.date_of_birth}
                      onChange={e => setFormData({ ...formData, date_of_birth: e.target.value })}
                      className="input"
                      max={new Date().toISOString().slice(0, 10)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role *</label>
                    <select value={formData.role}
                      onChange={e => setFormData({ ...formData, role: e.target.value, reports_to: '' })}
                      className="input" required>
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
                    <select value={formData.team_id}
                      onChange={e => setFormData({ ...formData, team_id: e.target.value, reports_to: '' })}
                      className="input">
                      <option value="">No Team</option>
                      {teams.map(team => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Reports To</label>
                    <select value={formData.reports_to}
                      onChange={e => setFormData({ ...formData, reports_to: e.target.value })}
                      className="input">
                      <option value="">No Direct Manager</option>
                      {getFilteredManagers().map(manager => (
                        <option key={manager.id} value={manager.id}>
                          {manager.full_name} ({getRoleLabel(manager.role)})
                          {manager.team_id && ` — ${getTeamName(manager.team_id)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-300 pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">
                  Revenue Targets <span className="text-gray-400 font-normal text-sm">(optional)</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label:'Monthly Target (₹)', key:'monthly_target', placeholder:'e.g., 150000' },
                    { label:'Quarterly Target (₹)', key:'quarterly_target', placeholder:'e.g., 450000' },
                    { label:'Annual Target (₹)', key:'annual_target', placeholder:'e.g., 1800000' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{f.label}</label>
                      <input type="number" step="0.01"
                        value={(formData as any)[f.key]}
                        onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                        className="input" placeholder={f.placeholder} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Target Start Date</label>
                    <input type="date" value={formData.target_start_date}
                      onChange={e => setFormData({ ...formData, target_start_date: e.target.value })}
                      className="input" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Target End Date</label>
                    <input type="date" value={formData.target_end_date}
                      onChange={e => setFormData({ ...formData, target_end_date: e.target.value })}
                      className="input" />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-gray-300">
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? 'Saving...' : editingUser ? '💾 Update User' : '✅ Create User'}
                </button>
                <button type="button"
                  onClick={() => { setShowAddForm(false); setEditingUser(null); resetForm() }}
                  className="bg-white border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

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
                    <td>
                      <div className="font-medium">{user.full_name}</div>
                      {!user.is_active && user.last_working_date && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          LWD: {new Date(user.last_working_date).toLocaleDateString('en-IN')}
                        </div>
                      )}
                    </td>
                    <td className="text-sm text-gray-600">{user.email}</td>
                    <td>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadge(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="text-sm">{user.teams?.name || '—'}</td>
                    <td className="text-sm font-medium">
                      {user.monthly_target
                        ? `₹${Number(user.monthly_target).toLocaleString('en-IN')}`
                        : '—'}
                    </td>
                    <td>
                      {user.is_active
                        ? <span className="badge-success">Active</span>
                        : (
                          <div>
                            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs">Inactive</span>
                            {user.kpi_notes?.startsWith('exit_reason:') && (
                              <div className="text-xs text-gray-400 mt-0.5 capitalize">
                                {user.kpi_notes.replace('exit_reason:', '')}
                              </div>
                            )}
                          </div>
                        )
                      }
                    </td>
                    <td>
                      <div className="flex items-center gap-3 flex-wrap">
                        <button onClick={() => handleEdit(user)}
                          className="text-blue-600 hover:text-blue-900 text-sm font-medium">
                          Edit
                        </button>

                        <button
                          onClick={() => handleResetPassword(user.email, user.id)}
                          disabled={resettingId === user.id}
                          className="text-sm font-medium text-amber-600 hover:text-amber-800 disabled:opacity-40 flex items-center gap-1"
                        >
                          {resettingId === user.id
                            ? <><span className="animate-spin inline-block w-3 h-3 border border-amber-600 border-t-transparent rounded-full" /> Sending…</>
                            : '🔑 Reset Password'
                          }
                        </button>

                        {/* ── OFFBOARD replaces raw Deactivate ── */}
                        {user.is_active && user.role !== 'system_admin' && (
                          <button
                            onClick={() => setExitingUser(user)}
                            className="text-red-600 hover:text-red-900 text-sm font-medium"
                          >
                            🚪 Offboard
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">No users found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Exit Modal */}
      {exitingUser && (
        <ExitModal
          user={exitingUser}
          allUsers={users}
          onClose={() => setExitingUser(null)}
          onConfirm={handleExitConfirm}
        />
      )}
    </DashboardLayout>
  )
}