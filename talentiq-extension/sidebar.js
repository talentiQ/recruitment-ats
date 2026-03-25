// sidebar.js — Resume Bank only

const SUPABASE_URL = 'https://uatvadvllyuhcmegkehh.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_KuiXc1alS49xd7UUorjR5A_nUUMP0um'
const RESUME_BUCKET = 'resumes'

let currentFilename = ''
let currentFileBase64 = ''
let currentMimeType = ''
let skills = []
let keywords = []

// ── State ─────────────────────────────────────────────────────────────────────
function showState(id) {
  ['state-empty', 'state-parsing', 'state-form', 'state-success'].forEach(s => {
    const el = document.getElementById(s)
    if (!el) return
    el.classList.remove('active')
    el.style.display = 'none'
  })
  const target = document.getElementById(id)
  if (target) {
    target.style.display = 'flex'
    target.classList.add('active')
  }
  document.getElementById('footer').style.display = id === 'state-form' ? 'flex' : 'none'
}

function resetToEmpty() {
  clearForm()
  showState('state-empty')
}

function clearForm() {
  ['f-name','f-phone','f-email','f-designation','f-company',
   'f-exp','f-location','f-ctc','f-notice','f-notes']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
  document.getElementById('f-industry').value = ''
  document.getElementById('f-source').value = 'email'
  skills = []; keywords = []
  renderTags('skills-wrap', 'skills-input', skills, 'tag-skill')
  renderTags('keywords-wrap', 'keywords-input', keywords, 'tag-keyword')
  hideError()
  // Remove invalid highlights
  document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'))
}

// ── Messages from content.js ──────────────────────────────────────────────────
window.addEventListener('message', async (event) => {
  const { type } = event.data || {}

  if (type === 'TIQ_LOAD_ATTACHMENT') {
    const { filename, downloadUrl } = event.data
    currentFilename = filename
    document.getElementById('parse-filename').textContent = filename
    setParseStatus('Downloading…')
    showState('state-parsing')
    window.parent.postMessage({ type: 'TIQ_FETCH_ATTACHMENT', filename, downloadUrl }, '*')
  }

  if (type === 'TIQ_ATTACHMENT_DATA') {
    const { filename, base64, mimeType } = event.data
    currentFilename = filename
    currentFileBase64 = base64 || ''
    currentMimeType = mimeType || ''
    document.getElementById('form-filename').textContent = filename

    if (base64) {
      setParseStatus('Parsing CV…')
      await parseAndFill(filename, base64, mimeType)
    } else {
      fillForm({})
      updateConfidence({})
    }
    showState('state-form')
  }

  if (type === 'TIQ_ATTACHMENT_ERROR') {
    fillForm({})
    updateConfidence({})
    showState('state-form')
    showError('Could not fetch CV — please fill in manually.')
  }
})

// ── CV Parsing ────────────────────────────────────────────────────────────────
const PARSE_API = 'https://recruitment-ats.vercel.app/api/parse-resume'

async function parseAndFill(filename, base64, mimeType) {
  setParseStatus('Parsing CV…')
  try {
    // Reconstruct file blob from base64
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' })
    const file = new File([blob], filename, { type: blob.type })

    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(PARSE_API, { method: 'POST', body: formData })

    if (!response.ok) {
      console.error('[TIQ] Parse API error:', response.status)
      fillForm({})
      updateConfidence({})
      return
    }

    const json = await response.json()
    if (!json.success || !json.data) {
      console.error('[TIQ] Parse API returned no data:', json)
      fillForm({})
      updateConfidence({})
      return
    }

    fillForm(json.data)
    updateConfidence(json.data)

  } catch (err) {
    console.error('[TIQ] parseAndFill error:', err)
    fillForm({})
    updateConfidence({})
  }
}

// ── Fill form ─────────────────────────────────────────────────────────────────
// Field names match LocalParsedResume returned by /api/parse-resume
function fillForm(data) {
  if (data.full_name)                document.getElementById('f-name').value        = data.full_name
  if (data.phone)                    document.getElementById('f-phone').value       = data.phone
  if (data.email)                    document.getElementById('f-email').value       = data.email
  if (data.current_designation)      document.getElementById('f-designation').value = data.current_designation
  if (data.current_company)          document.getElementById('f-company').value     = data.current_company
  if (data.total_experience != null) document.getElementById('f-exp').value         = data.total_experience
  if (data.current_location)         document.getElementById('f-location').value    = data.current_location
  // Prefer expected_ctc; fall back to current_ctc
  const ctc = data.expected_ctc ?? data.current_ctc
  if (ctc != null)                   document.getElementById('f-ctc').value         = ctc
  if (data.notice_period != null)    document.getElementById('f-notice').value      = data.notice_period
  skills   = Array.isArray(data.skills) ? data.skills : []
  keywords = []
  renderTags('skills-wrap',    'skills-input',   skills,   'tag-skill')
  renderTags('keywords-wrap',  'keywords-input', keywords, 'tag-keyword')
}

function updateConfidence(data) {
  // Parser returns confidence as 0–1 float — use it directly when present
  let pct
  if (data.confidence != null) {
    pct = Math.round(data.confidence * 100)
  } else {
    const checks = [
      data.full_name, data.email, data.phone,
      data.current_company, data.total_experience, data.current_location, data.current_designation,
    ]
    pct = Math.round((checks.filter(v => v != null && String(v).trim()).length / checks.length) * 100)
  }
  document.getElementById('conf-fill').style.width       = pct + '%'
  document.getElementById('conf-fill').style.background  = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444'
  document.getElementById('conf-pct').textContent        = pct + '%'
  document.getElementById('form-conf-text').textContent  =
    pct >= 70 ? 'Good parse' : pct >= 40 ? 'Partial — fill blanks' : 'Fill manually'
}

// ── Tags ──────────────────────────────────────────────────────────────────────
function renderTags(wrapId, inputId, arr, tagClass) {
  const wrap = document.getElementById(wrapId)
  if (!wrap) return
  wrap.querySelectorAll('.tag').forEach(t => t.remove())
  const input = document.getElementById(inputId)
  arr.forEach(val => {
    const tag = document.createElement('span')
    tag.className = `tag ${tagClass}`
    tag.textContent = val
    const btn = document.createElement('button')
    btn.className = 'tag-remove'
    btn.textContent = '×'
    btn.addEventListener('click', () => {
      const idx = arr.indexOf(val)
      if (idx > -1) arr.splice(idx, 1)
      renderTags(wrapId, inputId, arr, tagClass)
    })
    tag.appendChild(btn)
    wrap.insertBefore(tag, input)
  })
}

function setupTagInput(inputId, wrapId, arr, tagClass) {
  const input = document.getElementById(inputId)
  if (!input) return
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = input.value.trim().replace(/,$/, '')
      if (val && !arr.includes(val)) { arr.push(val); renderTags(wrapId, inputId, arr, tagClass) }
      input.value = ''
    }
    if (e.key === 'Backspace' && !input.value && arr.length) {
      arr.pop(); renderTags(wrapId, inputId, arr, tagClass)
    }
  })
  document.getElementById(wrapId)?.addEventListener('click', () => input.focus())
}

// ── Validation ────────────────────────────────────────────────────────────────
function validate() {
  let valid = true
  const required = [
    { id: 'f-name', label: 'Full Name' },
    { id: 'f-exp', label: 'Experience' },
    { id: 'f-location', label: 'Location' },
    { id: 'f-industry', label: 'Industry / Domain' },
  ]
  required.forEach(({ id, label }) => {
    const el = document.getElementById(id)
    if (!el.value.trim()) {
      el.classList.add('invalid')
      valid = false
    } else {
      el.classList.remove('invalid')
    }
  })
  if (!valid) showError('Please fill in all required fields.')
  return valid
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function submitCandidate() {
  hideError()
  if (!validate()) return

  const btn = document.getElementById('submit-btn')
  btn.disabled = true
  btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid #ffffff40;border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite"></div> Saving…'

  try {
    let resumeUrl = null
    if (currentFileBase64) resumeUrl = await uploadResume()

    const name = document.getElementById('f-name').value.trim()

    const payload = {
      full_name:            name,
      phone:                document.getElementById('f-phone').value.trim() || null,
      email:                document.getElementById('f-email').value.trim() || null,
      designation:          document.getElementById('f-designation').value.trim() || null,
      current_company:      document.getElementById('f-company').value.trim() || null,
      total_experience:     Number(document.getElementById('f-exp').value) || null,
      current_location:     document.getElementById('f-location').value.trim() || null,
      industry:             document.getElementById('f-industry').value || null,
      expected_ctc:         Number(document.getElementById('f-ctc').value) || null,
      notice_period_days:   Number(document.getElementById('f-notice').value) || null,
      key_skills:           skills.join(', ') || null,
      requirement_keywords: keywords.join(', ') || null,
      source:               document.getElementById('f-source').value,
      notes:                document.getElementById('f-notes').value.trim() || null,
      resume_url:           resumeUrl,
      is_resume_bank:       true,
      job_id:               null,
      current_stage:        null,
      created_at:           new Date().toISOString(),
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/candidates`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `HTTP ${res.status}`)
    }

    document.getElementById('success-msg').textContent =
      `${name} has been saved to the Resume Bank.`
    showState('state-success')

  } catch (err) {
    console.error('[TIQ] Submit error:', err)
    showError('Failed to save: ' + (err.message || 'Unknown error'))
    btn.disabled = false
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg> Save to Resume Bank`
  }
}

async function uploadResume() {
  try {
    const binary = atob(currentFileBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: currentMimeType || 'application/octet-stream' })
    const path = `${Date.now()}_${currentFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${RESUME_BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': currentMimeType || 'application/octet-stream',
        'x-upsert': 'false'
      },
      body: blob
    })
    if (!res.ok) throw new Error('Upload failed')
    return `${SUPABASE_URL}/storage/v1/object/public/${RESUME_BUCKET}/${path}`
  } catch (err) {
    console.error('[TIQ] Upload error:', err)
    return null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('error-banner')
  el.textContent = msg; el.classList.add('visible')
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}
function hideError() {
  document.getElementById('error-banner').classList.remove('visible')
}
function setParseStatus(msg) {
  const el = document.getElementById('parse-status')
  if (el) el.textContent = msg
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.getElementById('close-btn').addEventListener('click', () => {
  window.parent.postMessage({ type: 'TIQ_CLOSE' }, '*')
})
document.getElementById('submit-btn').addEventListener('click', submitCandidate)
document.getElementById('btn-cancel').addEventListener('click', resetToEmpty)
document.getElementById('btn-add-another').addEventListener('click', resetToEmpty)

// Clear invalid on input
;['f-name','f-exp','f-location','f-industry'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    document.getElementById(id)?.classList.remove('invalid')
  })
})

// Init tag inputs
setupTagInput('skills-input', 'skills-wrap', skills, 'tag-skill')
setupTagInput('keywords-input', 'keywords-wrap', keywords, 'tag-keyword')