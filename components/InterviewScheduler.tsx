// components/InterviewScheduler.tsx
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface InterviewSchedulerProps {
  candidateId: string
  candidateName: string
  jobId: string
  onScheduled: () => void
  onCancel?: () => void
  existingInterview?: {
    id: string
    interview_round: number
    interview_date: string
    interview_time: string
    interview_type: string
    interviewer_name: string | null
    interviewer_email: string | null
    status: string
    client_hold?: boolean
    more_interviews_in_progress?: boolean
  } | null
}

// ─── Stage change rules (single source of truth) ─────────────────────────────
// Schedule       → stage: interview_scheduled
// Reschedule     → NO stage change
// Next Round     → NO stage change (mark current complete, create new interview)
// Client Hold    → stage: on_hold
// Rejected       → stage: rejected
// Completed      → stage: interview_completed
// Cancel         → NO stage change

type SchedulerMode = 'schedule' | 'reschedule' | 'next_round' | 'hold' | 'interview_rejected' | 'completed' | 'cancel'

const MODE_CONFIG: Record<SchedulerMode, { label: string; icon: string; color: string; activeColor: string }> = {
  schedule:   { label: 'Schedule',         icon: '📅', color: 'border-gray-200 text-gray-600 hover:border-blue-300',    activeColor: 'bg-blue-600 text-white border-blue-600' },
  reschedule: { label: 'Reschedule',       icon: '🔄', color: 'border-gray-200 text-gray-600 hover:border-blue-300',    activeColor: 'bg-blue-600 text-white border-blue-600' },
  next_round: { label: 'Next Round',       icon: '➡️', color: 'border-gray-200 text-gray-600 hover:border-indigo-300',  activeColor: 'bg-indigo-600 text-white border-indigo-600' },
  hold:       { label: 'Client Hold',      icon: '⏸️', color: 'border-gray-200 text-gray-600 hover:border-orange-300',  activeColor: 'bg-orange-500 text-white border-orange-500' },
  interview_rejected:   { label: 'Interview Rejected',         icon: '❌', color: 'border-gray-200 text-gray-600 hover:border-red-300',     activeColor: 'bg-red-600 text-white border-red-600' },
  completed:  { label: 'Selected / Done',  icon: '✅', color: 'border-gray-200 text-gray-600 hover:border-green-300',   activeColor: 'bg-green-600 text-white border-green-600' },
  cancel:     { label: 'Cancel Interview', icon: '🚫', color: 'border-gray-200 text-gray-600 hover:border-red-300',     activeColor: 'bg-red-600 text-white border-red-600' },
}

export default function InterviewScheduler({
  candidateId,
  candidateName,
  jobId,
  onScheduled,
  onCancel,
  existingInterview = null,
}: InterviewSchedulerProps) {
  const [mode, setMode] = useState<SchedulerMode>(existingInterview ? 'reschedule' : 'schedule')

  const [formData, setFormData] = useState({
    interview_date: '',
    interview_time: '',
    interview_round: '1',
    interview_type: 'video',
    interviewer_name: '',
    interviewer_email: '',
  })

  const [reason, setReason] = useState('')
  const [holdNotes, setHoldNotes] = useState('')
  const [moreInterviewsInProgress, setMoreInterviewsInProgress] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (existingInterview) {
      setFormData({
        interview_date:   existingInterview.interview_date || '',
        interview_time:   existingInterview.interview_time || '',
        interview_round:  String(existingInterview.interview_round || '1'),
        interview_type:   existingInterview.interview_type || 'video',
        interviewer_name: existingInterview.interviewer_name || '',
        interviewer_email: existingInterview.interviewer_email || '',
      })
      setMoreInterviewsInProgress(existingInterview.more_interviews_in_progress || false)
    }
  }, [existingInterview])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const getUser = () => JSON.parse(localStorage.getItem('user') || '{}')

  // ── 1. SCHEDULE ───────────────────────────────────────────────────────────
  // Stage → interview_scheduled
  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const userData = getUser()
      const { data, error } = await supabase.from('interviews').insert([{
        candidate_id:     candidateId,
        job_id:           jobId,
        recruiter_id:     userData.id,
        interview_round:  parseInt(formData.interview_round),
        interview_date:   formData.interview_date,
        interview_time:   formData.interview_time,
        interview_type:   formData.interview_type,
        interviewer_name: formData.interviewer_name || null,
        interviewer_email: formData.interviewer_email || null,
        status: 'scheduled',
        more_interviews_in_progress: moreInterviewsInProgress,
        client_hold: false,
      }]).select()
      if (error) throw error

      await supabase.from('candidates').update({
        current_stage: 'interview_scheduled',
        last_activity_date: new Date().toISOString(),
        more_interviews_in_progress: moreInterviewsInProgress,
      }).eq('id', candidateId)

      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidateId,
        activity_type: 'interview_scheduled',
        activity_title: 'Interview Scheduled',
        activity_description: `Round ${formData.interview_round} ${formData.interview_type} interview scheduled for ${formData.interview_date} at ${formData.interview_time}${moreInterviewsInProgress ? ' — Client is interviewing multiple candidates' : ''}`,
        metadata: { interview_id: data[0].id, interview_round: formData.interview_round, interview_date: formData.interview_date, interview_time: formData.interview_time, more_interviews_in_progress: moreInterviewsInProgress },
        performed_by: userData.id,
      }])

      alert('Interview scheduled successfully!')
      onScheduled()
    } catch (error: any) {
      alert('Error scheduling interview: ' + (error.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── 2. RESCHEDULE ─────────────────────────────────────────────────────────
  // Stage → NO CHANGE
  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!existingInterview) return
    setSubmitting(true)
    try {
      const userData = getUser()

      await supabase.from('interviews').update({
        interview_date:   formData.interview_date,
        interview_time:   formData.interview_time,
        interview_type:   formData.interview_type,
        interview_round:  parseInt(formData.interview_round),
        interviewer_name: formData.interviewer_name || null,
        interviewer_email: formData.interviewer_email || null,
        status: 'rescheduled',
        reschedule_reason: reason || null,
        rescheduled_at: new Date().toISOString(),
        more_interviews_in_progress: moreInterviewsInProgress,
      }).eq('id', existingInterview.id)

      // NO stage change
      await supabase.from('candidates').update({
        last_activity_date: new Date().toISOString(),
        more_interviews_in_progress: moreInterviewsInProgress,
      }).eq('id', candidateId)

      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidateId,
        activity_type: 'interview_rescheduled',
        activity_title: 'Interview Rescheduled',
        activity_description: `Round ${formData.interview_round} rescheduled to ${formData.interview_date} at ${formData.interview_time}${reason ? '. Reason: ' + reason : ''}`,
        metadata: { interview_id: existingInterview.id, new_date: formData.interview_date, new_time: formData.interview_time, reschedule_reason: reason },
        performed_by: userData.id,
      }])

      alert('Interview rescheduled successfully!')
      onScheduled()
    } catch (error: any) {
      alert('Error rescheduling: ' + (error.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── 3. NEXT ROUND ─────────────────────────────────────────────────────────
  // Stage → NO CHANGE
  const handleNextRound = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!existingInterview) return
    setSubmitting(true)
    try {
      const userData = getUser()
      const nextRound = existingInterview.interview_round + 1

      await supabase.from('interviews').update({ status: 'completed' }).eq('id', existingInterview.id)

      const { data: newIv, error } = await supabase.from('interviews').insert([{
        candidate_id:     candidateId,
        job_id:           jobId,
        recruiter_id:     userData.id,
        interview_round:  nextRound,
        interview_date:   formData.interview_date,
        interview_time:   formData.interview_time,
        interview_type:   formData.interview_type,
        interviewer_name: formData.interviewer_name || null,
        interviewer_email: formData.interviewer_email || null,
        status: 'scheduled',
        more_interviews_in_progress: false,
        client_hold: false,
      }]).select()
      if (error) throw error

      // NO stage change
      await supabase.from('candidates').update({
        last_activity_date: new Date().toISOString(),
      }).eq('id', candidateId)

      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidateId,
        activity_type: 'next_round_scheduled',
        activity_title: `Round ${nextRound} Interview Scheduled`,
        activity_description: `Cleared Round ${existingInterview.interview_round}. Round ${nextRound} ${formData.interview_type} interview scheduled for ${formData.interview_date} at ${formData.interview_time}`,
        metadata: { previous_interview_id: existingInterview.id, new_interview_id: newIv[0].id, previous_round: existingInterview.interview_round, next_round: nextRound },
        performed_by: userData.id,
      }])

      alert(`Round ${nextRound} interview scheduled!`)
      onScheduled()
    } catch (error: any) {
      alert('Error scheduling next round: ' + (error.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── 4. CLIENT HOLD ────────────────────────────────────────────────────────
  // Stage → on_hold
  const handleClientHold = async () => {
    if (!existingInterview) return
    setSubmitting(true)
    try {
      const userData = getUser()

      await supabase.from('interviews').update({
        status: 'on_hold',
        client_hold: true,
        more_interviews_in_progress: true,
        hold_notes: holdNotes || null,
        hold_set_at: new Date().toISOString(),
      }).eq('id', existingInterview.id)

      await supabase.from('candidates').update({
        current_stage: 'on_hold',
        more_interviews_in_progress: true,
        last_activity_date: new Date().toISOString(),
      }).eq('id', candidateId)

      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidateId,
        activity_type: 'client_hold',
        activity_title: '⏸️ Client Hold — More Interviews in Progress',
        activity_description: `Client is interviewing more candidates before final decision.${holdNotes ? ' Notes: ' + holdNotes : ''}`,
        metadata: { interview_id: existingInterview.id, more_interviews_in_progress: true, hold_notes: holdNotes },
        performed_by: userData.id,
      }])

      alert('Candidate marked as Client Hold.')
      onScheduled()
    } catch (error: any) {
      alert('Error updating hold: ' + (error.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── 5. REJECTED ───────────────────────────────────────────────────────────
  // Stage → rejected
  const handleRejected = async () => {
    if (!existingInterview) return
    if (!reason.trim()) { alert('Please provide a rejection reason.'); return }
    setSubmitting(true)
    try {
      const userData = getUser()

      await supabase.from('interviews').update({
        status: 'interview_rejected',
        cancel_reason: reason,
        cancelled_at: new Date().toISOString(),
      }).eq('id', existingInterview.id)

      await supabase.from('candidates').update({
        current_stage: 'interview_rejected',
        last_activity_date: new Date().toISOString(),
      }).eq('id', candidateId)

      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidateId,
        activity_type: 'interview_rejected',
        activity_title: '❌ Interview Rejected',
        activity_description: `Round ${existingInterview.interview_round} — Candidate interview rejected. Reason: ${reason}`,
        metadata: { interview_id: existingInterview.id, reject_reason: reason },
        performed_by: userData.id,
      }])

      alert('Candidate marked as Rejected.')
      onScheduled()
    } catch (error: any) {
      alert('Error updating rejection: ' + (error.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── 6. COMPLETED / SELECTED ───────────────────────────────────────────────
  // Stage → interview_completed
  const handleCompleted = async () => {
    if (!existingInterview) return
    setSubmitting(true)
    try {
      const userData = getUser()

      await supabase.from('interviews').update({ status: 'completed' }).eq('id', existingInterview.id)

      await supabase.from('candidates').update({
        current_stage: 'interview_completed',
        last_activity_date: new Date().toISOString(),
      }).eq('id', candidateId)

      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidateId,
        activity_type: 'interview_completed',
        activity_title: '✅ Interview Completed — Selected',
        activity_description: `Round ${existingInterview.interview_round} cleared. Candidate selected — moving to offer stage.${reason ? ' Notes: ' + reason : ''}`,
        metadata: { interview_id: existingInterview.id, notes: reason },
        performed_by: userData.id,
      }])

      alert('Candidate marked as Selected. Moving to offer stage.')
      onScheduled()
    } catch (error: any) {
      alert('Error completing interview: ' + (error.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── 7. CANCEL ─────────────────────────────────────────────────────────────
  // Stage → NO CHANGE
  const handleCancel = async () => {
    if (!existingInterview) return
    if (!reason.trim()) { alert('Please provide a cancellation reason.'); return }
    setSubmitting(true)
    try {
      const userData = getUser()

      await supabase.from('interviews').update({
        status: 'cancelled',
        cancel_reason: reason,
        cancelled_at: new Date().toISOString(),
      }).eq('id', existingInterview.id)

      // NO stage change
      await supabase.from('candidates').update({
        last_activity_date: new Date().toISOString(),
      }).eq('id', candidateId)

      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidateId,
        activity_type: 'interview_cancelled',
        activity_title: '🚫 Interview Cancelled',
        activity_description: `Round ${existingInterview.interview_round} interview cancelled. Reason: ${reason}`,
        metadata: { interview_id: existingInterview.id, cancel_reason: reason },
        performed_by: userData.id,
      }])

      alert('Interview cancelled. Candidate stage unchanged.')
      onScheduled()
    } catch (error: any) {
      alert('Error cancelling: ' + (error.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Shared form fields ────────────────────────────────────────────────────
  const InterviewFormFields = ({ showMIPFlag = true }: { showMIPFlag?: boolean }) => (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Interview Date *</label>
        <input type="date" name="interview_date" value={formData.interview_date}
          onChange={handleChange} className="input" required
          min={new Date().toISOString().split('T')[0]} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Time *</label>
        <input type="time" name="interview_time" value={formData.interview_time}
          onChange={handleChange} className="input" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Round</label>
        <select name="interview_round" value={formData.interview_round} onChange={handleChange} className="input">
          <option value="1">Round 1 — Initial Screening</option>
          <option value="2">Round 2 — Technical / Functional</option>
          <option value="3">Round 3 — Managerial</option>
          <option value="4">Round 4 — Senior Management</option>
          <option value="final">Final Round — HR / Director</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <select name="interview_type" value={formData.interview_type} onChange={handleChange} className="input">
          <option value="video">🎥 Video Call</option>
          <option value="phone">📞 Phone</option>
          <option value="in_person">🏢 In-Person</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Interviewer Name</label>
        <input type="text" name="interviewer_name" value={formData.interviewer_name}
          onChange={handleChange} className="input" placeholder="Client interviewer name" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Interviewer Email</label>
        <input type="email" name="interviewer_email" value={formData.interviewer_email}
          onChange={handleChange} className="input" placeholder="interviewer@client.com" />
      </div>
      {showMIPFlag && (
        <div className="col-span-2">
          <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
            ${moreInterviewsInProgress ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-gray-50 hover:border-orange-200'}`}>
            <input type="checkbox" checked={moreInterviewsInProgress}
              onChange={e => setMoreInterviewsInProgress(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-orange-500" />
            <div>
              <div className="font-semibold text-sm text-gray-800 flex items-center gap-2">
                <span>⏳ Client Interviewing More Candidates</span>
                {moreInterviewsInProgress && (
                  <span className="px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full font-bold">Flag Active</span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Flag only — stage stays <strong>Interview Scheduled</strong>. Use <strong>Client Hold</strong> tab if client is holding the decision.
              </div>
            </div>
          </label>
        </div>
      )}
    </div>
  )

  // ── Stage badge ───────────────────────────────────────────────────────────
  const StageBadge = ({ to, noChange = false }: { to?: string; noChange?: boolean }) => (
    <div className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg
      ${noChange ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}>
      {noChange
        ? '🔒 No stage change — candidate stays in current stage'
        : <>📍 Stage will update to: <span className="font-bold">{to}</span></>
      }
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {existingInterview ? 'Manage Interview' : 'Schedule Interview'} — {candidateName}
          </h3>
          {existingInterview && (
            <p className="text-xs text-gray-500 mt-0.5">
              Round {existingInterview.interview_round} · {existingInterview.interview_date} {existingInterview.interview_time}
            </p>
          )}
        </div>
        <button onClick={() => onCancel && onCancel()} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">✕</button>
      </div>

      {/* Mode tabs */}
      {existingInterview && (
        <div className="flex gap-2 flex-wrap">
          {(['reschedule', 'next_round', 'hold', 'interview_rejected', 'completed', 'cancel'] as SchedulerMode[]).map(m => {
            const cfg = MODE_CONFIG[m]
            return (
              <button key={m} onClick={() => { setMode(m); setReason(''); setHoldNotes('') }}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition border
                  ${mode === m ? cfg.activeColor : `bg-white ${cfg.color}`}`}>
                {cfg.icon} {cfg.label}
              </button>
            )
          })}
        </div>
      )}

      {/* ── SCHEDULE ── */}
      {mode === 'schedule' && (
        <form onSubmit={handleSchedule} className="space-y-4">
          <StageBadge to="Interview Scheduled" />
          <InterviewFormFields />
          <div className="flex gap-3 pt-3 border-t">
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? <Spinner label="Scheduling…" /> : '📅 Schedule Interview'}
            </button>
            <button type="button" onClick={() => onCancel && onCancel()}
              className="px-5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── RESCHEDULE ── */}
      {mode === 'reschedule' && (
        <form onSubmit={handleReschedule} className="space-y-4">
          <StageBadge noChange />
          <InterviewFormFields />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              className="input w-full resize-none" rows={2}
              placeholder="e.g. Interviewer unavailable, candidate requested change…" />
          </div>
          <div className="flex gap-3 pt-3 border-t">
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition">
              {submitting ? <Spinner label="Rescheduling…" /> : '🔄 Confirm Reschedule'}
            </button>
            <button type="button" onClick={() => onCancel && onCancel()}
              className="px-5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── NEXT ROUND ── */}
      {mode === 'next_round' && (
        <form onSubmit={handleNextRound} className="space-y-4">
          <StageBadge noChange />
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-800">
            <strong>Round {existingInterview?.interview_round}</strong> will be marked <strong>Completed</strong>.
            A new interview for <strong>Round {(existingInterview?.interview_round || 0) + 1}</strong> will be created.
            Candidate stage stays <strong>Interview Scheduled</strong>.
          </div>
          <InterviewFormFields showMIPFlag={false} />
          <div className="flex gap-3 pt-3 border-t">
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm transition">
              {submitting ? <Spinner label="Scheduling…" /> : `➡️ Schedule Round ${(existingInterview?.interview_round || 0) + 1}`}
            </button>
            <button type="button" onClick={() => onCancel && onCancel()}
              className="px-5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── CLIENT HOLD ── */}
      {mode === 'hold' && (
        <div className="space-y-4">
          <StageBadge to="On Hold" />
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">⏸️</span>
            <div>
              <div className="font-bold text-orange-900">Client Hold — More Interviews in Progress</div>
              <div className="text-sm text-orange-700 mt-1">
                Client is evaluating more candidates. Stage moves to <strong>On Hold</strong>.
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea value={holdNotes} onChange={e => setHoldNotes(e.target.value)}
              className="input w-full resize-none" rows={3}
              placeholder="e.g. Client interviewing 3 more candidates this week. Decision expected by 20th March…" />
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <button onClick={handleClientHold} disabled={submitting}
              className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold text-sm transition disabled:opacity-50">
              {submitting ? <Spinner label="Saving…" /> : '⏸️ Mark as Client Hold'}
            </button>
            <button onClick={() => onCancel && onCancel()}
              className="px-5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── REJECTED ── */}
      {mode === 'interview_rejected' && (
        <div className="space-y-4">
          <StageBadge to="Interview Rejected" />
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">❌</span>
            <div>
              <div className="font-bold text-red-900">Candidate Rejected</div>
              <div className="text-sm text-red-700 mt-1">
                Stage will move to <strong>Interview Rejected</strong>. This is a final action for this interview cycle.
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              className="input w-full resize-none" rows={3} required
              placeholder="e.g. Skills mismatch, client selected another candidate, salary expectation too high…" />
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <button onClick={handleRejected} disabled={submitting || !reason.trim()}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition disabled:opacity-50">
              {submitting ? <Spinner label="Saving…" /> : '❌ Confirm Rejection'}
            </button>
            <button onClick={() => onCancel && onCancel()}
              className="px-5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── COMPLETED / SELECTED ── */}
      {mode === 'completed' && (
        <div className="space-y-4">
          <StageBadge to="Interview Completed" />
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <div className="font-bold text-green-900">Candidate Selected / Interview Completed</div>
              <div className="text-sm text-green-700 mt-1">
                Candidate has cleared all rounds. Stage moves to <strong>Interview Completed</strong> — ready for offer.
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              className="input w-full resize-none" rows={2}
              placeholder="e.g. Strong performance, client very impressed, CTC to be discussed…" />
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <button onClick={handleCompleted} disabled={submitting}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm transition disabled:opacity-50">
              {submitting ? <Spinner label="Saving…" /> : '✅ Mark as Selected'}
            </button>
            <button onClick={() => onCancel && onCancel()}
              className="px-5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── CANCEL ── */}
      {mode === 'cancel' && (
        <div className="space-y-4">
          <StageBadge noChange />
          <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">🚫</span>
            <div>
              <div className="font-bold text-gray-900">Cancel This Interview</div>
              <div className="text-sm text-gray-600 mt-1">
                Interview marked <strong>Cancelled</strong>. Candidate stage is <strong>not changed</strong> — they stay in the pipeline.
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              className="input w-full resize-none" rows={3} required
              placeholder="e.g. Client withdrew position, interviewer unavailable, candidate asked to postpone…" />
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <button onClick={handleCancel} disabled={submitting || !reason.trim()}
              className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg font-semibold text-sm transition disabled:opacity-50">
              {submitting ? <Spinner label="Cancelling…" /> : '🚫 Confirm Cancellation'}
            </button>
            <button onClick={() => onCancel && onCancel()}
              className="px-5 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 font-medium text-sm">
              Go Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
      {label}
    </span>
  )
}
