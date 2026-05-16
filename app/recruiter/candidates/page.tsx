// app/recruiter/candidates/page.tsx
'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PIPELINE_STAGES, getStageBadge, getStageLabel } from '@/lib/pipelineStages'

// ── Bulk Stage Modal ──────────────────────────────────────────────────────────
function BulkStageModal({
  selectedCount, onClose, onSubmit, submitting,
}: {
  selectedCount: number
  onClose: () => void
  onSubmit: (stage: string) => void
  submitting: boolean
}) {
  const [selectedStage, setSelectedStage] = useState('')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
          padding: '18px 24px', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>📋 Update CV Feedback</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
              Move {selectedCount} candidate{selectedCount !== 1 ? 's' : ''} to a new stage
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Stage list */}
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
            Select Stage <span style={{ color: '#dc2626' }}>*</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
            {PIPELINE_STAGES.map(stage => (
              <button
                key={stage}
                onClick={() => setSelectedStage(stage)}
                style={{
                  padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, textAlign: 'left', fontFamily: 'inherit',
                  border: selectedStage === stage ? '2px solid #4f46e5' : '2px solid #e5e7eb',
                  background: selectedStage === stage ? '#eff6ff' : '#f9fafb',
                  color: selectedStage === stage ? '#4f46e5' : '#374151',
                  transition: 'all 0.12s',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: selectedStage === stage ? '#4f46e5' : '#d1d5db',
                  transition: 'background 0.12s',
                }} />
                {getStageLabel(stage)}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px 24px' }}>
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
            padding: '9px 13px', fontSize: 12, color: '#1e40af', marginBottom: 16,
          }}>
            ℹ️ Updates <strong>current_stage</strong> for all {selectedCount} selected candidates at once.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{
              padding: '10px 20px', borderRadius: 8, border: '1.5px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              color: '#374151', fontFamily: 'inherit',
            }}>Cancel</button>
            <button
              onClick={() => onSubmit(selectedStage)}
              disabled={!selectedStage || submitting}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: !selectedStage || submitting ? '#a5b4fc' : '#4f46e5',
                color: '#fff', cursor: !selectedStage || submitting ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {submitting
                ? <><span style={{
                    width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    display: 'inline-block', animation: 'spin 0.7s linear infinite',
                  }} />Updating…</>
                : `Update ${selectedCount} Candidate${selectedCount !== 1 ? 's' : ''}`
              }
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RecruiterCandidatesPage() {
  const router = useRouter()
  const [candidates, setCandidates]           = useState<any[]>([])
  const [loading, setLoading]                 = useState(true)
  const [stageFilter, setStageFilter]         = useState('all')
  const [searchQuery, setSearchQuery]         = useState('')
  const [user, setUser]                       = useState<any>(null)
  const [jobFilter, setJobFilter]             = useState('all')
  const [sourcedByFilter, setSourcedByFilter] = useState('all')
  const [allocatedJobs, setAllocatedJobs]     = useState<any[]>([])
  const [teamRecruiters, setTeamRecruiters]   = useState<{ id: string; full_name: string }[]>([])

  // bulk
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set())
  const [showBulkModal, setShowBulkModal]     = useState(false)
  const [bulkSubmitting, setBulkSubmitting]   = useState(false)
  const [bulkSuccess, setBulkSuccess]         = useState('')

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadAllocatedJobs(parsedUser.id)
    }
  }, [])

  useEffect(() => {
    if (user && allocatedJobs.length >= 0) loadCandidates()
  }, [user, allocatedJobs, stageFilter, searchQuery, jobFilter, sourcedByFilter])

  useEffect(() => {
    if (!user) return
    supabase.from('users').select('id, full_name')
      .eq('reports_to', user.id).eq('role', 'recruiter').eq('is_active', true)
      .then(({ data }) => setTeamRecruiters(data || []))
  }, [user])

  const loadAllocatedJobs = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('job_recruiter_assignments')
        .select(`job_id, jobs ( id, job_title, job_code, clients (company_name) )`)
        .eq('recruiter_id', userId).eq('is_active', true)
      if (error) throw error
      setAllocatedJobs(data?.map((a: any) => a.jobs).filter(Boolean) || [])
    } catch (error) {
      console.error('Error loading allocated jobs:', error)
      setAllocatedJobs([])
    }
  }

  const loadCandidates = async () => {
    setLoading(true)
    try {
      const allocatedJobIds = allocatedJobs.map((job: any) => job.id)
      let query = supabase
        .from('candidates')
        .select(`*, jobs ( id, job_title, job_code, clients (company_name) ), users:assigned_to ( id, full_name )`)
        .order('created_at', { ascending: false })

      if (allocatedJobIds.length > 0) {
        query = query.or(`assigned_to.eq.${user.id},job_id.in.(${allocatedJobIds.join(',')})`)
      } else {
        query = query.eq('assigned_to', user.id)
      }
      if (stageFilter !== 'all') query = query.eq('current_stage', stageFilter)
      if (jobFilter !== 'all') query = query.eq('job_id', jobFilter)
      if (searchQuery) {
        query = query.or(`full_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
      }

      const { data, error } = await query
      if (error) throw error

      const filtered = sourcedByFilter === 'all' ? (data || [])
        : sourcedByFilter === 'me' ? (data || []).filter((c: any) => c.assigned_to === user.id)
        : (data || []).filter((c: any) => c.assigned_to === sourcedByFilter)

      setCandidates(filtered)
      setSelectedIds(new Set())
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  // selection
  const allVisibleIds = candidates.map(c => c.id)
  const allSelected   = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id))
  const someSelected  = allVisibleIds.some(id => selectedIds.has(id)) && !allSelected
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(allVisibleIds))
  const toggleOne = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const handleBulkUpdate = async (stage: string) => {
    setBulkSubmitting(true)
    try {
      const { error } = await supabase
        .from('candidates').update({ current_stage: stage }).in('id', Array.from(selectedIds))
      if (error) throw error
      setBulkSuccess(`✅ Moved ${selectedIds.size} candidate${selectedIds.size !== 1 ? 's' : ''} to "${getStageLabel(stage)}"`)
      setShowBulkModal(false)
      setSelectedIds(new Set())
      setTimeout(() => setBulkSuccess(''), 4000)
      await loadCandidates()
    } catch (err) {
      console.error(err)
      alert('Failed to update. Please try again.')
    } finally {
      setBulkSubmitting(false)
    }
  }

  if (!user) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    </DashboardLayout>
  )

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">My Candidates</h2>
            <p className="text-gray-600">Your candidates + candidates on your allocated jobs</p>
          </div>
          <button onClick={() => router.push('/recruiter/candidates/add')} className="btn-primary">
            + Add Candidate
          </button>
        </div>

        {bulkSuccess && (
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
            padding: '12px 18px', fontSize: 14, fontWeight: 600, color: '#15803d',
          }}>{bulkSuccess}</div>
        )}

        {/* Filters */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Name, phone, email…" className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Stage</label>
              <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="input">
                <option value="all">All Stages</option>
                {PIPELINE_STAGES.map(stage => <option key={stage} value={stage}>{getStageLabel(stage)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Job</label>
              <select value={jobFilter} onChange={e => setJobFilter(e.target.value)} className="input">
                <option value="all">All Jobs</option>
                {allocatedJobs.map((job: any) => (
                  <option key={job.id} value={job.id}>{job.job_title} — {job.clients?.company_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sourced By</label>
              <select value={sourcedByFilter} onChange={e => setSourcedByFilter(e.target.value)} className="input">
                <option value="all">All Recruiters</option>
                <option value="me">Me</option>
                {teamRecruiters.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
              </select>
            </div>
          </div>

          {(stageFilter !== 'all' || searchQuery || jobFilter !== 'all' || sourcedByFilter !== 'all') && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Showing <strong className="text-gray-700">{candidates.length}</strong> candidates
                {sourcedByFilter === 'me' && <span className="ml-1 text-blue-600">· sourced by you</span>}
                {sourcedByFilter !== 'all' && sourcedByFilter !== 'me' && (
                  <span className="ml-1 text-blue-600">
                    · sourced by {teamRecruiters.find(r => r.id === sourcedByFilter)?.full_name}
                  </span>
                )}
              </p>
              <button
                onClick={() => { setStageFilter('all'); setSearchQuery(''); setJobFilter('all'); setSourcedByFilter('all') }}
                className="text-xs text-blue-600 hover:underline"
              >Clear all filters</button>
            </div>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div style={{
            position: 'sticky', top: 16, zIndex: 100,
            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            borderRadius: 12, padding: '12px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 8px 24px rgba(79,70,229,0.35)',
          }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
              ✓ {selectedIds.size} candidate{selectedIds.size !== 1 ? 's' : ''} selected
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setSelectedIds(new Set())} style={{
                padding: '7px 16px', borderRadius: 8,
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              }}>Clear</button>
              <button onClick={() => setShowBulkModal(true)} style={{
                padding: '7px 20px', borderRadius: 8, background: '#fff', border: 'none',
                color: '#4f46e5', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              }}>📋 Update CV Feedback</button>
            </div>
          </div>
        )}

        <div className="text-sm text-gray-600">
          Showing <strong>{candidates.length}</strong> candidates
          {selectedIds.size > 0 && <span className="ml-2 text-indigo-600 font-semibold">· {selectedIds.size} selected</span>}
        </div>

        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600">No candidates found</p>
            {(stageFilter !== 'all' || searchQuery || jobFilter !== 'all' || sourcedByFilter !== 'all') && (
              <button
                onClick={() => { setStageFilter('all'); setSearchQuery(''); setJobFilter('all'); setSourcedByFilter('all') }}
                className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >Clear all filters</button>
            )}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox" checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleAll}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4f46e5' }}
                      title="Select all"
                    />
                  </th>
                  <th>Candidate</th>
                  <th>Job / Client</th>
                  <th>Stage</th>
                  <th>Expected CTC</th>
                  <th>Sourced By</th>
                  <th>Days in Pipeline</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(candidate => {
                  const isOwnCandidate = candidate.assigned_to === user.id
                  const isSelected     = selectedIds.has(candidate.id)
                  return (
                    <tr key={candidate.id}
                      className={!isOwnCandidate && !isSelected ? 'bg-blue-50' : ''}
                      style={{ background: isSelected ? '#eef2ff' : undefined }}
                    >
                      <td>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOne(candidate.id)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4f46e5' }} />
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium text-gray-900">{candidate.full_name}</div>
                            <div className="text-sm text-gray-500">{candidate.phone}</div>
                            {candidate.email && <div className="text-xs text-gray-400">{candidate.email}</div>}
                          </div>
                          {!isOwnCandidate && (
                            <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">Team</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="text-sm font-medium">{candidate.jobs?.job_title || 'N/A'}</div>
                        <div className="text-xs text-gray-500">{candidate.jobs?.clients?.company_name || 'N/A'}</div>
                      </td>
                      <td>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStageBadge(candidate.current_stage)}`}>
                          {getStageLabel(candidate.current_stage)}
                        </span>
                      </td>
                      <td className="text-sm font-medium">₹{candidate.expected_ctc || 0}</td>
                      <td className="text-sm">
                        {isOwnCandidate
                          ? <span className="font-semibold text-green-600">You</span>
                          : <span className="text-gray-700">{candidate.users?.full_name || 'Unknown'}</span>}
                      </td>
                      <td className="text-sm">
                        {Math.floor((new Date().getTime() - new Date(candidate.created_at).getTime()) / (1000 * 60 * 60 * 24))} days
                      </td>
                      <td>
                        <button onClick={() => router.push(`/recruiter/candidates/${candidate.id}`)}
                          className="text-blue-600 hover:text-blue-900 font-medium text-sm">
                          View Details →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {showBulkModal && (
          <BulkStageModal
            selectedCount={selectedIds.size}
            onClose={() => setShowBulkModal(false)}
            onSubmit={handleBulkUpdate}
            submitting={bulkSubmitting}
          />
        )}
      </div>
    </DashboardLayout>
  )
}
