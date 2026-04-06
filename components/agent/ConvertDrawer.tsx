// components/agent/ConvertDrawer.tsx
// Side drawer to convert a resume_bank entry into a candidate for a specific job.
// Pre-fills all fields from resume_bank. Recruiter can edit everything.
// If a new CV is uploaded, it updates resume_bank AND creates the candidate with new file.
//
// Props:
//   open         — controls visibility
//   onClose      — close handler
//   jobId        — target job
//   resumeBankId — source resume_bank row id
//   prefill      — data from the resume_bank card to pre-fill the form

'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ConvertFormData {
  full_name:           string
  phone:               string
  email:               string
  current_company:     string
  current_designation: string
  total_experience:    string
  current_ctc:         string
  expected_ctc:        string
  notice_period:       string
  current_location:    string
  notes:               string
}

interface ConvertDrawerProps {
  open:          boolean
  onClose:       () => void
  jobId:         string
  resumeBankId:  string
  resumeUrl:     string | null
  prefill: {
    full_name?:           string | null
    phone?:               string | null
    email?:               string | null
    current_company?:     string | null
    current_designation?: string | null
    total_experience?:    number | null
    current_ctc?:         number | null
    expected_ctc?:        number | null
    notice_period?:       number | null
    current_location?:    string | null
  }
  onConverted?: (candidateId: string) => void
}

export function ConvertDrawer({
  open, onClose, jobId, resumeBankId, resumeUrl, prefill, onConverted,
}: ConvertDrawerProps) {
  const [form, setForm] = useState<ConvertFormData>({
    full_name:           prefill.full_name           ?? '',
    phone:               prefill.phone               ?? '',
    email:               prefill.email               ?? '',
    current_company:     prefill.current_company     ?? '',
    current_designation: prefill.current_designation ?? '',
    total_experience:    String(prefill.total_experience ?? ''),
    current_ctc:         String(prefill.current_ctc      ?? ''),
    expected_ctc:        String(prefill.expected_ctc     ?? ''),
    notice_period:       String(prefill.notice_period    ?? ''),
    current_location:    prefill.current_location    ?? '',
    notes:               '',
  })

  const [newCvFile, setNewCvFile]   = useState<File | null>(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const update = (field: keyof ConvertFormData, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async () => {
    setError('')

    if (!form.full_name.trim()) return setError('Name is required')
    if (!form.phone.trim())     return setError('Phone is required')

    setSaving(true)
    try {
      // ── Get current user ─────────────────────────────────────────────────
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // ── Get team_id for current user ──────────────────────────────────────
      const { data: userData } = await supabase
        .from('users')
        .select('team_id')
        .eq('id', user.id)
        .single()

      if (!userData?.team_id) throw new Error('Could not find team for current user')

      let finalResumeUrl  = resumeUrl
      let finalFileName   = null as string | null
      let finalFileSize   = null as number | null

      // ── Upload new CV if provided ─────────────────────────────────────────
      if (newCvFile) {
        const timestamp = Date.now()
        const safeName  = newCvFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path      = `resumes/${timestamp}_${safeName}`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(path, newCvFile, { upsert: false })

        if (uploadError) throw new Error(`CV upload failed: ${uploadError.message}`)

        const { data: { publicUrl } } = supabase.storage
          .from('resumes')
          .getPublicUrl(uploadData.path)

        finalResumeUrl = publicUrl
        finalFileName  = newCvFile.name
        finalFileSize  = newCvFile.size

        // Update resume_bank with new CV
        await supabase
          .from('resume_bank')
          .update({
            resume_url:       finalResumeUrl,
            resume_file_name: finalFileName,
            resume_size:      finalFileSize,
            updated_at:       new Date().toISOString(),
            // Reset parsed text so it gets re-parsed with fresh CV
            parsed_data:      null,
          })
          .eq('id', resumeBankId)
      }

      // ── Create candidate row ───────────────────────────────────────────────
      const { data: candidate, error: insertError } = await supabase
        .from('candidates')
        .insert({
          full_name:           form.full_name.trim(),
          phone:               form.phone.trim(),
          email:               form.email.trim() || null,
          current_company:     form.current_company.trim()     || null,
          current_designation: form.current_designation.trim() || null,
          total_experience:    form.total_experience ? Number(form.total_experience) : null,
          current_ctc:         form.current_ctc      ? Number(form.current_ctc)      : null,
          expected_ctc:        form.expected_ctc     ? Number(form.expected_ctc)     : null,
          notice_period:       form.notice_period    ? Number(form.notice_period)    : null,
          current_location:    form.current_location.trim() || null,
          notes:               form.notes.trim() || null,
          job_id:              jobId,
          assigned_to:         user.id,
          team_id:             userData.team_id,
          current_stage:       'sourced',
          source_type:         'resume_bank',
          source_resume_id:    resumeBankId,
          resume_url:          finalResumeUrl,
          resume_file_name:    finalFileName,
          resume_file_size:    finalFileSize,
          is_resume_bank:      true,
          source:              'resume_bank',
          created_by:          user.id,
        })
        .select('id')
        .single()

      if (insertError) throw new Error(`Failed to create candidate: ${insertError.message}`)

      // ── Mark resume_bank entry as converted ───────────────────────────────
      await supabase
        .from('resume_bank')
        .update({
          converted_to_candidate_id: candidate.id,
          converted_at:              new Date().toISOString(),
          converted_by:              user.id,
        })
        .eq('id', resumeBankId)

      onConverted?.(candidate.id)
      onClose()

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Conversion failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Convert to Candidate</h3>
            <p className="text-xs text-gray-500 mt-0.5">From resume bank · verify & update details</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Name + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                className="input w-full text-sm"
                value={form.full_name}
                onChange={e => update('full_name', e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone *</label>
              <input
                className="input w-full text-sm"
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
                placeholder="10-digit mobile"
              />
            </div>
          </div>

          {/* Email + Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                className="input w-full text-sm"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
              <input
                className="input w-full text-sm"
                value={form.current_location}
                onChange={e => update('current_location', e.target.value)}
                placeholder="City"
              />
            </div>
          </div>

          {/* Company + Designation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Current Company</label>
              <input
                className="input w-full text-sm"
                value={form.current_company}
                onChange={e => update('current_company', e.target.value)}
                placeholder="Company name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Current Designation</label>
              <input
                className="input w-full text-sm"
                value={form.current_designation}
                onChange={e => update('current_designation', e.target.value)}
                placeholder="Role title"
              />
            </div>
          </div>

          {/* Experience + Notice */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Exp (yrs)</label>
              <input
                type="number" min="0" step="0.5"
                className="input w-full text-sm"
                value={form.total_experience}
                onChange={e => update('total_experience', e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notice (days)</label>
              <input
                type="number" min="0"
                className="input w-full text-sm"
                value={form.notice_period}
                onChange={e => update('notice_period', e.target.value)}
                placeholder="30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Current CTC (L)</label>
              <input
                type="number" min="0" step="0.1"
                className="input w-full text-sm"
                value={form.current_ctc}
                onChange={e => update('current_ctc', e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Expected CTC */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Expected CTC (L)</label>
            <input
              type="number" min="0" step="0.1"
              className="input w-full text-sm"
              value={form.expected_ctc}
              onChange={e => update('expected_ctc', e.target.value)}
              placeholder="0"
            />
          </div>

          {/* Fresh CV upload */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Upload Fresh CV
              <span className="text-gray-400 font-normal ml-1">(optional — replaces resume bank file)</span>
            </label>
            {resumeUrl && !newCvFile && (
              <div className="flex items-center gap-2 mb-2">
                <a
                  href={resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Current CV on file ↗
                </a>
              </div>
            )}
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={e => setNewCvFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-gray-500
                file:mr-3 file:py-1.5 file:px-3
                file:rounded file:border-0
                file:text-xs file:font-medium
                file:bg-indigo-50 file:text-indigo-700
                hover:file:bg-indigo-100 cursor-pointer"
            />
            {newCvFile && (
              <p className="text-xs text-green-700 mt-1">
                New CV selected: {newCvFile.name} ({Math.round(newCvFile.size / 1024)}KB)
                — will update resume bank
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              className="input w-full text-sm"
              rows={2}
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              placeholder="Any notes for this submission…"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 shrink-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 font-medium transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />}
            {saving ? 'Converting…' : 'Convert to Candidate'}
          </button>
        </div>
      </div>
    </>
  )
}