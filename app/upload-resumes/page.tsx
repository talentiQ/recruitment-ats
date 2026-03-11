// app/upload-resumes/page.tsx — v5: Developer card layout + full feature logic
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { normalizeSkills } from '@/lib/skillNormalization'

// ─── Types ────────────────────────────────────────────────────────────────────

type FileStatus =
  | 'pending' | 'parsing' | 'needs_review'
  | 'confirmed' | 'uploading' | 'success' | 'duplicate' | 'error'

interface ReviewFields {
  full_name: string
  phone: string
  email: string
  current_designation: string
  current_company: string
  total_experience: string
  current_location: string
  expected_ctc: string
  notice_period: string
  industry: string
  key_skills: string[]
  requirement_keywords: string[]
}

interface ResumeFile {
  id: string
  fileName: string
  file: File
  status: FileStatus
  progress: number
  error?: string
  reviewFields?: ReviewFields
  skillInput: string
  keywordInput: string
  duplicateInfo?: {
    found_in: 'candidates' | 'resume_bank'
    record_id: string
    full_name: string
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_INDUSTRIES = [
  'HR / Recruitment', 'IT / Technology', 'Finance / Accounting',
  'Sales / Marketing', 'Operations / Supply Chain', 'Healthcare / Pharma',
  'Manufacturing / Engineering', 'Banking / Financial Services',
  'Education / Training', 'Legal / Compliance', 'Consulting',
]

const MANDATORY: (keyof ReviewFields)[] = [
  'full_name', 'total_experience', 'current_location',
  'industry', 'key_skills', 'requirement_keywords',
]

const MANDATORY_LABELS: Record<string, string> = {
  full_name: 'Name', total_experience: 'Experience',
  current_location: 'Location', industry: 'Industry',
  key_skills: 'Skills', requirement_keywords: 'Keywords',
}

function getMissing(rv: ReviewFields): string[] {
  return MANDATORY.filter(k => {
    const v = (rv as any)[k]
    return Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim()
  }).map(k => MANDATORY_LABELS[k])
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UploadResumesPage() {
  const [user, setUser]             = useState<any>(null)
  const [files, setFiles]           = useState<ResumeFile[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [parsing, setParsing]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [industries, setIndustries] = useState<string[]>(DEFAULT_INDUSTRIES)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const u = localStorage.getItem('user')
    if (u) setUser(JSON.parse(u))
  }, [])

  const updateFile = (id: string, patch: Partial<ResumeFile>) =>
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))

  const updateReview = (id: string, patch: Partial<ReviewFields>) =>
    setFiles(prev => prev.map(f => {
      if (f.id !== id || !f.reviewFields) return f
      return { ...f, reviewFields: { ...f.reviewFields, ...patch } }
    }))

  // ── Drop zone ────────────────────────────────────────────────────────────────

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    setDragActive(e.type !== 'dragleave' && e.type !== 'drop')
  }

  const addFiles = (incoming: File[]) => {
    const allowed = [
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    const valid = incoming.filter(f => allowed.includes(f.type))
    if (valid.length !== incoming.length)
      alert('Only PDF and Word (.doc, .docx) files are allowed.')
    setFiles(prev => [...prev, ...valid.map(f => ({
      id: crypto.randomUUID(), fileName: f.name, file: f,
      status: 'pending' as FileStatus, progress: 0,
      skillInput: '', keywordInput: '',
    }))])
  }

  // ── Parse ────────────────────────────────────────────────────────────────────

  const inferIndustry = (sector: string, skills: string[]): string => {
    const s = sector.toLowerCase()
    const sk = skills.map(x => x.toLowerCase()).join(' ')
    if (s === 'hr'       || sk.includes('recruitment') || sk.includes('talent acquisition')) return 'HR / Recruitment'
    if (s === 'it'       || sk.includes('java') || sk.includes('python') || sk.includes('react')) return 'IT / Technology'
    if (s === 'finance'  || sk.includes('gst') || sk.includes('fp&a'))   return 'Finance / Accounting'
    if (s === 'sales'    || sk.includes('b2b') || sk.includes('business development')) return 'Sales / Marketing'
    if (s === 'operations' || sk.includes('supply chain'))                return 'Operations / Supply Chain'
    return ''
  }

  async function parseOne(file: ResumeFile) {
    updateFile(file.id, { status: 'parsing', progress: 30 })
    try {
      const fd = new FormData()
      fd.append('file', file.file)
      const res = await fetch('/api/parse-resume', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Parse API failed')
      const { success, data } = await res.json()
      if (!success || !data) throw new Error('Invalid parse response')

      const rv: ReviewFields = {
        full_name:            data.full_name           || '',
        phone:                data.phone               || '',
        email:                data.email               || '',
        current_designation:  data.current_designation || '',
        current_company:      data.current_company     || '',
        total_experience:     data.total_experience != null ? String(data.total_experience) : '',
        current_location:     data.current_location    || '',
        expected_ctc:         data.expected_ctc  != null ? String(data.expected_ctc)  : '',
        notice_period:        data.notice_period != null ? String(data.notice_period) : '',
        industry:             inferIndustry(data.sector || '', data.skills || []),
        key_skills:           data.skills || [],
        requirement_keywords: [],
      }
      updateFile(file.id, { status: 'needs_review', progress: 100, reviewFields: rv })
    } catch (e: any) {
      updateFile(file.id, { status: 'error', progress: 0, error: e.message })
    }
  }

  async function handleParseAll() {
    setParsing(true)
    for (const f of files.filter(f => f.status === 'pending')) await parseOne(f)
    setParsing(false)
  }

  function handleConfirmAll() {
    setFiles(prev => prev.map(f => {
      if (f.status !== 'needs_review' || !f.reviewFields) return f
      if (getMissing(f.reviewFields).length > 0) return f
      return { ...f, status: 'confirmed' }
    }))
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function checkDuplicate(phone: string, email: string) {
    if (!phone && !email) return null
    const or = [phone && `phone.eq.${phone}`, email && `email.eq.${email}`].filter(Boolean).join(',')
    const { data: c } = await supabase.from('candidates').select('id,full_name').or(or).limit(1).maybeSingle()
    if (c) return { found_in: 'candidates' as const, record_id: c.id, full_name: c.full_name }
    const { data: r } = await supabase.from('resume_bank').select('id,full_name').eq('status', 'available').or(or).limit(1).maybeSingle()
    if (r) return { found_in: 'resume_bank' as const, record_id: r.id, full_name: r.full_name }
    return null
  }

  async function saveOne(file: ResumeFile) {
    const rv = file.reviewFields!
    updateFile(file.id, { status: 'uploading', progress: 10 })
    try {
      // Duplicate check
      if (rv.phone || rv.email) {
        const dup = await checkDuplicate(rv.phone, rv.email)
        if (dup) {
          updateFile(file.id, { status: 'duplicate', progress: 100, duplicateInfo: dup })
          return
        }
      }
      updateFile(file.id, { progress: 40 })

      // Skill normalisation
      let skills = rv.key_skills
      if (skills.length > 0) {
        const n = await normalizeSkills(skills)
        skills = n.normalized
      }

      // Storage upload
      const ext  = file.file.name.split('.').pop()
      const path = `resume_bank/${crypto.randomUUID()}.${ext}`
      const { error: se } = await supabase.storage.from('resumes').upload(path, file.file)
      if (se) throw se
      const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(path)
      updateFile(file.id, { progress: 75 })

      // DB insert
      const { error: de } = await supabase.from('resume_bank').insert({
        resume_url:           urlData.publicUrl,
        resume_file_name:     file.fileName,
        full_name:            rv.full_name.trim(),
        phone:                rv.phone.trim(),
        email:                rv.email.trim().toLowerCase(),
        current_designation:  rv.current_designation.trim(),
        current_company:      rv.current_company.trim(),
        total_experience:     parseFloat(rv.total_experience) || 0,
        current_location:     rv.current_location.trim(),
        expected_ctc:         parseFloat(rv.expected_ctc)  || null,
        notice_period:        parseInt(rv.notice_period)   || null,
        industry:             rv.industry,
        key_skills:           skills,
        requirement_keywords: rv.requirement_keywords,
        uploaded_by:          user.id,
        source:               'bulk_upload',
        status:               'available',
        parsed_data: {
          full_name: rv.full_name, phone: rv.phone,
          email: rv.email, skills, sector: rv.industry,
        },
      })
      if (de) throw de

      if (rv.industry && !industries.includes(rv.industry))
        setIndustries(prev => [...prev, rv.industry].sort())

      updateFile(file.id, { status: 'success', progress: 100 })
    } catch (e: any) {
      updateFile(file.id, { status: 'error', progress: 0, error: e.message })
    }
  }

  async function handleSaveAll() {
    if (!user) { alert('Please login first'); return }
    setSaving(true)
    for (const f of files.filter(f => f.status === 'confirmed')) await saveOne(f)
    setSaving(false)
  }

  // ── Tag helpers ──────────────────────────────────────────────────────────────

  function addTag(id: string, field: 'key_skills' | 'requirement_keywords', inputField: 'skillInput' | 'keywordInput') {
    const f = files.find(f => f.id === id); if (!f) return
    const raw = (f[inputField] || '').trim(); if (!raw) return
    const tags = raw.split(/[,;]+/).map(t => t.trim()).filter(Boolean)
    const merged = Array.from(new Set([...(f.reviewFields?.[field] || []), ...tags]))
    updateReview(id, { [field]: merged })
    updateFile(id, { [inputField]: '' })
  }

  function removeTag(id: string, field: 'key_skills' | 'requirement_keywords', tag: string) {
    const existing = files.find(f => f.id === id)?.reviewFields?.[field] || []
    updateReview(id, { [field]: (existing as string[]).filter(t => t !== tag) })
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  const stats = {
    total:       files.length,
    pending:     files.filter(f => f.status === 'pending').length,
    needsReview: files.filter(f => f.status === 'needs_review').length,
    confirmed:   files.filter(f => f.status === 'confirmed').length,
    success:     files.filter(f => f.status === 'success').length,
    duplicate:   files.filter(f => f.status === 'duplicate').length,
    error:       files.filter(f => f.status === 'error').length,
  }

  const reviewRows    = files.filter(f => f.status === 'needs_review')
  const confirmedRows = files.filter(f => f.status === 'confirmed')
  const doneRows      = files.filter(f => ['success', 'duplicate', 'error'].includes(f.status))

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="max-w-screen-xl mx-auto space-y-6 px-6 pb-12">

        {/* ── Header + action buttons ── */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
          <div>
            <h2 className="text-xl font-bold text-gray-900">📤 Bulk Resume Upload</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Drop → Parse → Fill → Confirm → Save &nbsp;·&nbsp;
              <span className="text-red-400">*</span> fields are mandatory
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => fileInputRef.current?.click()}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-900">
              + Upload Files
            </button>
            {stats.pending > 0 && (
              <button onClick={handleParseAll} disabled={parsing}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {parsing ? '⏳ Parsing…' : `🔍 Parse ${stats.pending}`}
              </button>
            )}
            {stats.needsReview > 0 && (
              <button onClick={handleConfirmAll}
                className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-600">
                ✅ Confirm All Ready
              </button>
            )}
            {stats.confirmed > 0 && (
              <button onClick={handleSaveAll} disabled={saving}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {saving ? '⏳ Saving…' : `💾 Save ${stats.confirmed}`}
              </button>
            )}
            <input ref={fileInputRef} type="file" multiple className="hidden"
              accept=".pdf,.doc,.docx"
              onChange={e => e.target.files && addFiles(Array.from(e.target.files))} />
          </div>
        </div>

        {/* ── Drop zone ── */}
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
            ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}`}
          onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag}
          onDrop={e => { handleDrag(e); addFiles(Array.from(e.dataTransfer.files)) }}
          onClick={() => fileInputRef.current?.click()}
        >
          <p className="text-3xl mb-1">📄</p>
          <p className="font-semibold text-gray-600">Drop resumes here or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">PDF · DOC · DOCX — select multiple files at once</p>
        </div>

        {/* ── Stats bar ── */}
        {files.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 bg-white border border-gray-100 rounded-xl px-5 py-3 text-sm shadow-sm">
            {[
              ['Total',      stats.total,       'text-gray-700'],
              ['Pending',    stats.pending,     'text-gray-400'],
              ['Review',     stats.needsReview,  'text-amber-600 font-bold'],
              ['Confirmed',  stats.confirmed,    'text-blue-600 font-bold'],
              ['Saved',      stats.success,     'text-emerald-600 font-bold'],
              ['Duplicates', stats.duplicate,   'text-yellow-600'],
              ['Errors',     stats.error,        'text-red-500'],
            ].map(([label, val, cls]) => (
              <div key={label as string} className="flex items-center gap-1.5">
                <span className="text-gray-400 text-xs">{label}</span>
                <span className={`text-lg leading-none ${cls}`}>{val}</span>
              </div>
            ))}
            <button onClick={() => setFiles([])}
              className="ml-auto text-xs text-gray-400 hover:text-red-500">🗑 Clear all</button>
          </div>
        )}

        {/* ── REVIEW CARDS ── */}
        {reviewRows.length > 0 && (
          <section className="space-y-4">
            <h3 className="font-semibold text-gray-700">
              ✏️ Fill in details — {reviewRows.length} resume{reviewRows.length !== 1 ? 's' : ''}
            </h3>

            {reviewRows.map((file, i) => (
              <ReviewCard
                key={file.id}
                index={i + 1}
                file={file}
                industries={industries}
                onUpdateReview={patch => updateReview(file.id, patch)}
                onAddTag={(field, inp) => addTag(file.id, field, inp)}
                onRemoveTag={(field, tag) => removeTag(file.id, field, tag)}
                onSkillInputChange={v => updateFile(file.id, { skillInput: v })}
                onKeywordInputChange={v => updateFile(file.id, { keywordInput: v })}
                onAddIndustry={ind => setIndustries(prev => prev.includes(ind) ? prev : [...prev, ind].sort())}
                onConfirm={() => updateFile(file.id, { status: 'confirmed' })}
                onRemove={() => setFiles(prev => prev.filter(f => f.id !== file.id))}
              />
            ))}
          </section>
        )}

        {/* ── CONFIRMED summary ── */}
        {confirmedRows.length > 0 && (
          <section>
            <h3 className="font-semibold text-gray-700 mb-3">
              ✅ Confirmed — {confirmedRows.length} ready to save
            </h3>
            <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-emerald-50 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">
                    {['Name', 'Designation', 'Exp', 'Location', 'Industry', 'Skills', 'Keywords', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 border-b border-emerald-100">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {confirmedRows.map(file => {
                    const rv = file.reviewFields!
                    return (
                      <tr key={file.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-semibold">{rv.full_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{rv.current_designation || '—'}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{rv.total_experience} yrs</td>
                        <td className="px-4 py-2.5">{rv.current_location}</td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                            {rv.industry}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {rv.key_skills.slice(0, 3).map(s => (
                              <span key={s} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{s}</span>
                            ))}
                            {rv.key_skills.length > 3 && (
                              <span className="text-xs text-gray-400">+{rv.key_skills.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {rv.requirement_keywords.length === 0
                              ? <span className="text-gray-300 text-xs">—</span>
                              : rv.requirement_keywords.map(k => (
                                  <span key={k} className="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded text-xs">{k}</span>
                                ))
                            }
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => updateFile(file.id, { status: 'needs_review' })}
                            className="text-xs text-blue-600 hover:underline">Edit</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── RESULTS ── */}
        {doneRows.length > 0 && (
          <section>
            <h3 className="font-semibold text-gray-700 mb-3">Results</h3>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">
                    {['File', 'Name', 'Industry', 'Status', 'Note'].map(h => (
                      <th key={h} className="px-4 py-2.5 border-b">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {doneRows.map(file => (
                    <tr key={file.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{file.fileName}</td>
                      <td className="px-4 py-2.5 font-medium">{file.reviewFields?.full_name || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500">{file.reviewFields?.industry || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          file.status === 'success'   ? 'bg-emerald-100 text-emerald-800' :
                          file.status === 'duplicate' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'}`}>
                          {file.status === 'success' ? '🎉 Saved'
                            : file.status === 'duplicate' ? '⚠️ Duplicate' : '❌ Error'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {file.status === 'duplicate'
                          ? `Exists as "${file.duplicateInfo?.full_name}" in ${
                              file.duplicateInfo?.found_in === 'candidates' ? 'Candidates' : 'Resume Bank'}`
                          : file.error || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Empty state ── */}
        {files.length === 0 && (
          <div className="text-center py-16 text-gray-300">
            <div className="text-5xl mb-3">📭</div>
            <p className="text-gray-400">No files yet — drop resumes above to begin</p>
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}

// ─── ReviewCard ───────────────────────────────────────────────────────────────

interface ReviewCardProps {
  file: ResumeFile
  index: number
  industries: string[]
  onUpdateReview: (p: Partial<ReviewFields>) => void
  onAddTag: (field: 'key_skills' | 'requirement_keywords', inp: 'skillInput' | 'keywordInput') => void
  onRemoveTag: (field: 'key_skills' | 'requirement_keywords', tag: string) => void
  onSkillInputChange: (v: string) => void
  onKeywordInputChange: (v: string) => void
  onAddIndustry: (ind: string) => void
  onConfirm: () => void
  onRemove: () => void
}

function ReviewCard({
  file, index, industries,
  onUpdateReview, onAddTag, onRemoveTag,
  onSkillInputChange, onKeywordInputChange,
  onAddIndustry, onConfirm, onRemove,
}: ReviewCardProps) {
  const rv = file.reviewFields!
  const missing = getMissing(rv)
  const canConfirm = missing.length === 0

  // Industry combobox state
  const [industryOpen, setIndustryOpen]   = useState(false)
  const [industryInput, setIndustryInput] = useState(rv.industry)
  const industryRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setIndustryInput(rv.industry) }, [rv.industry])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (industryRef.current && !industryRef.current.contains(e.target as Node))
        setIndustryOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selectIndustry = (ind: string) => {
    setIndustryInput(ind); onUpdateReview({ industry: ind }); setIndustryOpen(false)
  }
  const commitIndustry = () => {
    const t = industryInput.trim(); if (!t) return
    if (!industries.includes(t)) onAddIndustry(t)
    onUpdateReview({ industry: t }); setIndustryOpen(false)
  }
  const filteredInds = industries.filter(i =>
    i.toLowerCase().includes(industryInput.toLowerCase())
  )

  // Input base styles
  const base = "w-full border rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
  const inp  = (hasErr: boolean) => `${base} ${hasErr ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`
  const lbl  = "block text-xs font-semibold text-gray-500 mb-1"

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all
      ${canConfirm ? 'border-gray-200' : 'border-amber-200'}`}>

      {/* Card header */}
      <div className={`flex items-center justify-between px-5 py-3 border-b
        ${canConfirm ? 'bg-gray-50 border-gray-100' : 'bg-amber-50 border-amber-100'}`}>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            canConfirm ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
            #{index}
          </span>
          <div>
            <p className="font-semibold text-gray-800 text-sm leading-tight">
              {rv.full_name || <span className="text-gray-400 italic">Unnamed — fill Name below</span>}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">📎 {file.fileName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {missing.length > 0 && (
            <p className="text-xs text-amber-600 font-medium hidden sm:block">
              Fill: {missing.join(' · ')}
            </p>
          )}
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            title={!canConfirm ? `Fill required: ${missing.join(', ')}` : 'Confirm this resume'}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
              canConfirm
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-95'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}>
            {canConfirm ? '✓ Confirm' : 'Fill fields'}
          </button>
          <button onClick={onRemove}
            className="text-xs text-gray-300 hover:text-red-500 transition-colors">✕</button>
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-4 space-y-4">

        {/* Row 1 — Identity */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={lbl}>Full Name <span className="text-red-400">*</span></label>
            <input className={inp(!rv.full_name.trim())}
              placeholder="e.g. Ravi Kumar"
              value={rv.full_name}
              onChange={e => onUpdateReview({ full_name: e.target.value })} />
          </div>
          <div>
            <label className={lbl}>Phone</label>
            <input className={inp(false)}
              placeholder="9876543210"
              value={rv.phone}
              onChange={e => onUpdateReview({ phone: e.target.value })} />
          </div>
          <div>
            <label className={lbl}>Email</label>
            <input className={inp(false)}
              placeholder="email@domain.com"
              value={rv.email}
              onChange={e => onUpdateReview({ email: e.target.value })} />
          </div>
        </div>

        {/* Row 2 — Current role */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={lbl}>Designation</label>
            <input className={inp(false)}
              placeholder="e.g. Design Engineer"
              value={rv.current_designation}
              onChange={e => onUpdateReview({ current_designation: e.target.value })} />
          </div>
          <div>
            <label className={lbl}>Company</label>
            <input className={inp(false)}
              placeholder="Current company"
              value={rv.current_company}
              onChange={e => onUpdateReview({ current_company: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Exp (yrs) <span className="text-red-400">*</span></label>
              <input type="number" step="0.5" min="0" max="50"
                className={inp(!rv.total_experience.trim())}
                placeholder="0"
                value={rv.total_experience}
                onChange={e => onUpdateReview({ total_experience: e.target.value })} />
            </div>
            <div>
              <label className={lbl}>Location <span className="text-red-400">*</span></label>
              <input className={inp(!rv.current_location.trim())}
                placeholder="City"
                value={rv.current_location}
                onChange={e => onUpdateReview({ current_location: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Row 3 — Industry + optional */}
        <div className="grid grid-cols-3 gap-4">
          {/* Industry combobox */}
          <div ref={industryRef}>
            <label className={lbl}>Industry / Domain <span className="text-red-400">*</span></label>
            <div className="relative">
              <input
                className={`${inp(!rv.industry)} pr-7`}
                placeholder="Select or type new…"
                value={industryInput}
                onChange={e => { setIndustryInput(e.target.value); setIndustryOpen(true) }}
                onFocus={() => setIndustryOpen(true)}
                onBlur={() => setTimeout(commitIndustry, 160)} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 text-xs pointer-events-none">▾</span>
              {industryOpen && (
                <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                  {filteredInds.map(ind => (
                    <button key={ind} type="button"
                      onMouseDown={() => selectIndustry(ind)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors
                        ${rv.industry === ind ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700'}`}>
                      {ind}
                    </button>
                  ))}
                  {industryInput.trim() && !industries.includes(industryInput.trim()) && (
                    <button type="button"
                      onMouseDown={() => { onAddIndustry(industryInput.trim()); selectIndustry(industryInput.trim()) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-blue-600 font-semibold hover:bg-blue-50 border-t border-gray-100">
                      ＋ Add "{industryInput.trim()}"
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className={lbl}>Expected CTC (Lakhs)</label>
            <input type="number" step="0.5"
              className={inp(false)}
              placeholder="e.g. 8.5"
              value={rv.expected_ctc}
              onChange={e => onUpdateReview({ expected_ctc: e.target.value })} />
          </div>
          <div>
            <label className={lbl}>Notice Period (days)</label>
            <input type="number"
              className={inp(false)}
              placeholder="e.g. 30"
              value={rv.notice_period}
              onChange={e => onUpdateReview({ notice_period: e.target.value })} />
          </div>
        </div>

        {/* Row 4 — Skills + Keywords side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>
              Skills <span className="text-red-400">*</span>
              <span className="text-gray-300 font-normal ml-1">— Enter or comma to add</span>
            </label>
            <TagInput
              tags={rv.key_skills}
              inputValue={file.skillInput}
              placeholder="e.g. Payroll, SAP, Excel…"
              tagColor="bg-blue-100 text-blue-800 border border-blue-200"
              hasError={rv.key_skills.length === 0}
              onInputChange={onSkillInputChange}
              onAdd={() => onAddTag('key_skills', 'skillInput')}
              onRemove={tag => onRemoveTag('key_skills', tag)}
            />
          </div>
          <div>
            <label className={lbl}>
              <span className="text-violet-600">Requirement Keywords</span>
              <span className="text-red-400"> *</span>
              <span className="text-gray-300 font-normal ml-1">— job-role match tags</span>
            </label>
            <TagInput
              tags={rv.requirement_keywords}
              inputValue={file.keywordInput}
              placeholder="e.g. Design Engineer, AutoCAD…"
              tagColor="bg-violet-100 text-violet-800 border border-violet-200"
              hasError={rv.requirement_keywords.length === 0}
              onInputChange={onKeywordInputChange}
              onAdd={() => onAddTag('requirement_keywords', 'keywordInput')}
              onRemove={tag => onRemoveTag('requirement_keywords', tag)}
            />
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── TagInput ─────────────────────────────────────────────────────────────────

interface TagInputProps {
  tags: string[]
  inputValue: string
  placeholder: string
  tagColor: string
  hasError: boolean
  onInputChange: (v: string) => void
  onAdd: () => void
  onRemove: (tag: string) => void
}

function TagInput({ tags, inputValue, placeholder, tagColor, hasError, onInputChange, onAdd, onRemove }: TagInputProps) {
  return (
    <div
      className={`min-h-[44px] border rounded-lg px-3 pt-2 pb-1.5 flex flex-wrap gap-1.5 items-start
        focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-transparent transition-all cursor-text
        ${hasError ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
      onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}>
      {tags.map(tag => (
        <span key={tag}
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${tagColor}`}>
          {tag}
          <button
            onClick={e => { e.stopPropagation(); onRemove(tag) }}
            className="opacity-50 hover:opacity-100 hover:text-red-600 font-bold leading-none transition-opacity">
            ×
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[100px] text-sm border-0 outline-none bg-transparent placeholder-gray-300 py-0.5"
        value={inputValue}
        placeholder={tags.length === 0 ? placeholder : 'Add more…'}
        onChange={e => onInputChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); onAdd() }
        }} />
    </div>
  )
}
