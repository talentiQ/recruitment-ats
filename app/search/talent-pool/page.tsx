// app/search/talent-pool/page.tsx — v3: v2 base + polished ResultCard + separate View/Download resume
'use client'
export const dynamic = 'force-dynamic'

import DashboardLayout from '@/components/DashboardLayout'
import MatchScorePanel from '@/components/MatchScorePanel'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { normalizeSkills } from '@/lib/skillNormalization'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  source_type: 'candidate' | 'resume_bank'
  id: string
  full_name: string
  phone: string
  email: string
  current_company: string
  current_designation: string
  total_experience: number
  current_location: string
  expected_ctc: number
  notice_period: number
  key_skills: string[]
  requirement_keywords: string[]
  industry: string
  current_stage?: string
  job_id?: string
  job_title?: string
  assigned_to?: string
  assigned_to_name?: string
  last_activity_date?: string
  resume_bank_status?: string
  uploaded_by?: string
  uploaded_by_name?: string
  uploaded_at?: string
  resume_url?: string
  days_since_activity: number
  is_owned: boolean
  is_available: boolean
  match_score: number
}

interface ScoringTarget { result: SearchResult; jobId: string; jobTitle: string }
type SkillMode = 'any' | 'all' | 'boolean'

// ─── Constants ────────────────────────────────────────────────────────────────

const INDUSTRIES = [
  'HR / Recruitment','IT / Technology','Finance / Accounting',
  'Sales / Marketing','Operations / Supply Chain','Healthcare / Pharma',
  'Manufacturing / Engineering','Banking / Financial Services',
  'Education / Training','Legal / Compliance','Consulting',
]

function parseBooleanQuery(query: string) {
  const must: string[] = [], should: string[] = [], not: string[] = []
  let op = 'should'
  for (const token of query.trim().split(/\s+(AND|OR|NOT)\s+/i)) {
    const t = token.trim().toUpperCase()
    if (t === 'AND') { op = 'must'; continue }
    if (t === 'OR')  { op = 'should'; continue }
    if (t === 'NOT') { op = 'not'; continue }
    if (!token.trim()) continue
    if (op === 'must') must.push(token.trim())
    else if (op === 'not') not.push(token.trim())
    else should.push(token.trim())
  }
  return { must, should, not }
}

function matchesBoolean(skills: string[], query: string): boolean {
  const { must, should, not } = parseBooleanQuery(query)
  const sl = skills.map(s => s.toLowerCase())
  if (not.some(n => sl.includes(n.toLowerCase()))) return false
  if (must.length > 0 && !must.every(m => sl.includes(m.toLowerCase()))) return false
  if (should.length > 0 && must.length === 0) return should.some(s => sl.includes(s.toLowerCase()))
  return true
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TalentPoolSearchPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [myJobs, setMyJobs]   = useState<any[]>([])

  const [quickSearch, setQuickSearch]         = useState('')
  const [showAdvanced, setShowAdvanced]       = useState(true)
  const [reqKeywords, setReqKeywords]         = useState<string[]>([])
  const [reqKeywordInput, setReqKeywordInput] = useState('')
  const [skillMode, setSkillMode]             = useState<SkillMode>('any')
  const [selectedSkills, setSelectedSkills]   = useState<string[]>([])
  const [skillInput, setSkillInput]           = useState('')
  const [booleanQuery, setBooleanQuery]       = useState('')
  const [industry, setIndustry]               = useState('')
  const [location, setLocation]               = useState('')
  const [expMin, setExpMin]                   = useState('')
  const [expMax, setExpMax]                   = useState('')
  const [ctcMin, setCtcMin]                   = useState('')
  const [ctcMax, setCtcMax]                   = useState('')
  const [noticePeriod, setNoticePeriod]       = useState('all')
  const [ownershipFilter, setOwnershipFilter] = useState('all')
  const [showValidated, setShowValidated]     = useState(true)
  const [showResumeBank, setShowResumeBank]   = useState(true)

  const [scoringTarget, setScoringTarget]             = useState<ScoringTarget | null>(null)
  const [scoreJobId, setScoreJobId]                   = useState('')
  const [showAddToJobModal, setShowAddToJobModal]     = useState(false)
  const [selectedCandidate, setSelectedCandidate]     = useState<SearchResult | null>(null)
  const [selectedJobId, setSelectedJobId]             = useState('')
  const [addingToJob, setAddingToJob]                 = useState(false)
  const [expandedId, setExpandedId]                   = useState<string | null>(null)
  const [stats, setStats] = useState({ total:0, validated:0, resumeBank:0, owned:0, available:0, avgMatch:0 })

  useEffect(() => {
    const u = localStorage.getItem('user')
    if (u) { const p = JSON.parse(u); setUser(p); loadMyJobs(p) }
  }, [])

  async function loadMyJobs(u: any) {
    const { data } = await supabase
      .from('job_recruiter_assignments')
      .select(`job_id, jobs(id,job_code,job_title,status,clients(company_name))`)
      .eq('recruiter_id', u.id).eq('is_active', true).eq('jobs.status', 'open')
    if (data) setMyJobs(data.map((a: any) => a.jobs).filter(Boolean))
  }

  const addSkill = () => {
    const t = skillInput.trim(); if (!t || selectedSkills.includes(t)) return
    setSelectedSkills(p => [...p, t]); setSkillInput('')
  }
  const addReqKeyword = () => {
    const t = reqKeywordInput.trim(); if (!t || reqKeywords.includes(t)) return
    setReqKeywords(p => [...p, t]); setReqKeywordInput('')
  }

  function calcScore(c: any): number {
    let score = 0
    const skills = c.key_skills || []
    if (skillMode === 'boolean' && booleanQuery.trim()) {
      score += matchesBoolean(skills, booleanQuery) ? 40 : 0
    } else if (selectedSkills.length > 0) {
      const sl = skills.map((s: string) => s.toLowerCase())
      const matched = selectedSkills.filter(s => sl.includes(s.toLowerCase()))
      score += Math.round((matched.length / selectedSkills.length) * 40)
    } else { score += 40 }
    if (reqKeywords.length > 0) {
      const rk = (c.requirement_keywords || []).map((s: string) => s.toLowerCase())
      const matched = reqKeywords.filter(k => rk.includes(k.toLowerCase()))
      score += Math.round((matched.length / reqKeywords.length) * 10)
    } else { score += 10 }
    if (expMin || expMax) {
      const exp = c.total_experience ?? 0
      if (exp >= (parseFloat(expMin)||0) && exp <= (parseFloat(expMax)||100)) score += 20
    } else { score += 20 }
    if (location) { if (c.current_location?.toLowerCase().includes(location.toLowerCase())) score += 15 }
    else { score += 15 }
    if (ctcMin || ctcMax) {
      const ctc = c.expected_ctc ?? 0
      if (ctc >= (parseFloat(ctcMin)||0) && ctc <= (parseFloat(ctcMax)||9999)) score += 10
    } else { score += 10 }
    const notice = c.notice_period || 0
    if (notice <= 30) score += 5; else if (notice <= 60) score += 2
    return Math.min(score, 100)
  }

  async function handleSearch() {
    setLoading(true)
    try {
      let allResults: SearchResult[] = []
      const now = new Date()
      let searchSkills = selectedSkills
      if (selectedSkills.length > 0) { const n = await normalizeSkills(selectedSkills); searchSkills = n.normalized }

      if (showValidated) {
        let q = supabase.from('candidates').select(`
          id,full_name,phone,email,current_company,current_designation,
          total_experience,current_location,expected_ctc,key_skills,notice_period,
          current_stage,job_id,last_activity_date,created_at,resume_url,
          jobs(job_title,job_code),assigned_user:assigned_to(full_name)`)
          .neq('current_stage','joined')
        if (quickSearch.trim()) q = q.or(`full_name.ilike.%${quickSearch}%,phone.ilike.%${quickSearch}%,email.ilike.%${quickSearch}%`)
        if (skillMode !== 'boolean' && searchSkills.length > 0) {
          if (skillMode === 'all') for (const s of searchSkills) q = q.contains('key_skills',[s])
          else q = q.overlaps('key_skills', searchSkills)
        }
        if (location) q = q.ilike('current_location',`%${location}%`)
        if (expMin)   q = q.gte('total_experience', parseFloat(expMin))
        if (expMax)   q = q.lte('total_experience', parseFloat(expMax))
        if (ctcMin)   q = q.gte('expected_ctc', parseFloat(ctcMin))
        if (ctcMax)   q = q.lte('expected_ctc', parseFloat(ctcMax))
        if (noticePeriod !== 'all') {
          const [mn,mx] = noticePeriod.split('-').map(Number)
          if (mx) q = q.gte('notice_period',mn).lte('notice_period',mx)
          else    q = q.gte('notice_period', mn)
        }
        const { data: candidates } = await q
        if (candidates) {
          let rows = candidates.map((c: any) => {
            const la   = c.last_activity_date ? new Date(c.last_activity_date) : new Date(c.created_at)
            const days = Math.floor((now.getTime()-la.getTime())/86400000)
            return {
              source_type:'candidate' as const, id:c.id, full_name:c.full_name, phone:c.phone, email:c.email,
              current_company:c.current_company, current_designation:c.current_designation,
              total_experience:c.total_experience, current_location:c.current_location,
              expected_ctc:c.expected_ctc, notice_period:c.notice_period||0,
              key_skills:c.key_skills||[], requirement_keywords:[], industry:'',
              current_stage:c.current_stage, job_id:c.job_id, job_title:c.jobs?.job_title,
              assigned_to:c.assigned_to, assigned_to_name:c.assigned_user?.full_name,
              last_activity_date:c.last_activity_date, resume_url:c.resume_url,
              days_since_activity:days, is_owned:days<=90, is_available:days>90,
              match_score:calcScore(c),
            } as SearchResult
          })
          if (skillMode==='boolean' && booleanQuery.trim()) rows = rows.filter(r => matchesBoolean(r.key_skills,booleanQuery))
          if (ownershipFilter==='owned')     rows = rows.filter(r => r.is_owned)
          if (ownershipFilter==='available') rows = rows.filter(r => r.is_available)
          allResults = allResults.concat(rows)
        }
      }

      if (showResumeBank) {
        let q = supabase.from('resume_bank').select(`
          id,full_name,phone,email,current_company,current_designation,
          total_experience,current_location,expected_ctc,key_skills,notice_period,
          requirement_keywords,industry,status,uploaded_by,uploaded_at,resume_url,
          uploader:uploaded_by(full_name)`)
          .eq('status','available')
        if (quickSearch.trim()) q = q.or(`full_name.ilike.%${quickSearch}%,phone.ilike.%${quickSearch}%,email.ilike.%${quickSearch}%`)
        if (skillMode !== 'boolean' && searchSkills.length > 0) {
          if (skillMode === 'all') for (const s of searchSkills) q = q.contains('key_skills',[s])
          else q = q.overlaps('key_skills', searchSkills)
        }
        if (reqKeywords.length > 0) q = q.overlaps('requirement_keywords', reqKeywords)
        if (industry) q = q.ilike('industry',`%${industry}%`)
        if (location) q = q.ilike('current_location',`%${location}%`)
        if (expMin)   q = q.gte('total_experience', parseFloat(expMin))
        if (expMax)   q = q.lte('total_experience', parseFloat(expMax))
        if (ctcMin)   q = q.gte('expected_ctc', parseFloat(ctcMin))
        if (ctcMax)   q = q.lte('expected_ctc', parseFloat(ctcMax))
        if (noticePeriod !== 'all') {
          const [mn,mx] = noticePeriod.split('-').map(Number)
          if (mx) q = q.gte('notice_period',mn).lte('notice_period',mx)
          else    q = q.gte('notice_period',mn)
        }
        const { data: resumes } = await q
        if (resumes) {
          let rows = resumes.map((r: any) => ({
            source_type:'resume_bank' as const, id:r.id, full_name:r.full_name, phone:r.phone, email:r.email,
            current_company:r.current_company, current_designation:r.current_designation,
            total_experience:r.total_experience, current_location:r.current_location,
            expected_ctc:r.expected_ctc, notice_period:r.notice_period||0,
            key_skills:r.key_skills||[], requirement_keywords:r.requirement_keywords||[],
            industry:r.industry||'', resume_bank_status:r.status,
            uploaded_by:r.uploaded_by, uploaded_by_name:r.uploader?.full_name,
            uploaded_at:r.uploaded_at, resume_url:r.resume_url,
            days_since_activity:0, is_owned:false, is_available:true, match_score:calcScore(r),
          })) as SearchResult[]
          if (skillMode==='boolean' && booleanQuery.trim()) rows = rows.filter(r => matchesBoolean(r.key_skills,booleanQuery))
          if (ownershipFilter !== 'owned') allResults = allResults.concat(rows)
        }
      }

      allResults.sort((a,b) => b.match_score - a.match_score)
      setStats({
        total:      allResults.length,
        validated:  allResults.filter(r => r.source_type==='candidate').length,
        resumeBank: allResults.filter(r => r.source_type==='resume_bank').length,
        owned:      allResults.filter(r => r.is_owned).length,
        available:  allResults.filter(r => r.is_available).length,
        avgMatch:   allResults.length ? Math.round(allResults.reduce((s,r)=>s+r.match_score,0)/allResults.length) : 0,
      })
      setResults(allResults)
    } catch(e) { console.error(e); alert('Search failed.') }
    finally { setLoading(false) }
  }

  function handleClearAll() {
    setQuickSearch(''); setReqKeywords([]); setReqKeywordInput('')
    setSelectedSkills([]); setSkillInput(''); setBooleanQuery('')
    setSkillMode('any'); setIndustry(''); setLocation('')
    setExpMin(''); setExpMax(''); setCtcMin(''); setCtcMax('')
    setNoticePeriod('all'); setOwnershipFilter('all')
    setResults([])
    setStats({ total:0, validated:0, resumeBank:0, owned:0, available:0, avgMatch:0 })
  }

  async function handleAddToJobSubmit() {
    if (!selectedJobId || !selectedCandidate || !user) return
    setAddingToJob(true)
    try {
      const { data: ex } = await supabase.from('job_recruiter_assignments').select('id')
        .eq('job_id',selectedJobId).eq('recruiter_id',user.id).single()
      if (!ex) {
        const { error } = await supabase.from('job_recruiter_assignments').insert({
          job_id:selectedJobId, recruiter_id:user.id, assigned_by:user.id, is_active:true, positions_allocated:1,
        })
        if (error) throw error
      }
      await supabase.from('candidate_timeline').insert({
        candidate_id:selectedCandidate.id, activity_type:'added_to_job',
        activity_title:'Added to Additional Job',
        activity_description:`Added by ${user.full_name} from talent pool`, performed_by:user.id,
      })
      alert(`✅ ${selectedCandidate.full_name} added.`)
      setShowAddToJobModal(false); setSelectedJobId(''); setSelectedCandidate(null)
    } catch(e: any) { alert('Error: '+e.message) }
    finally { setAddingToJob(false) }
  }

  const scoreJobTitle = myJobs.find(j => j.id===scoreJobId)?.job_title || scoringTarget?.jobTitle || ''
  const fi = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all hover:border-gray-300"

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-5 px-4 pb-12">

        <div>
          <h2 className="text-2xl font-bold text-gray-900">🔍 Talent Pool Search</h2>
          <p className="text-sm text-gray-400 mt-0.5">Search across all candidates and resume bank · CVs active within 90 days show ownership</p>
        </div>

        {/* ── Search Panel ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <span className="text-gray-400 text-lg">🔍</span>
            <input className="flex-1 text-base border-0 outline-none placeholder-gray-300 bg-transparent text-gray-800"
              placeholder="Quick search by name, phone or email…"
              value={quickSearch} onChange={e => setQuickSearch(e.target.value)}
              onKeyDown={e => e.key==='Enter' && handleSearch()} />
            <button onClick={() => setShowAdvanced(v=>!v)}
              className="text-xs text-blue-600 font-semibold hover:text-blue-800 whitespace-nowrap">
              {showAdvanced ? '▲ Hide filters' : '▼ Show filters'}
            </button>
          </div>
          {showAdvanced && (
            <div className="px-5 py-5 space-y-5">
              {/* Req Keywords */}
              <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-bold text-violet-700">🎯 Requirement Keywords</span>
                  <span className="text-xs text-violet-400">Job-role match tags e.g. "Design Engineer"</span>
                </div>
                <div className="flex gap-2 mb-2">
                  <input className={`${fi} border-violet-200 focus:ring-violet-400`}
                    placeholder="e.g. Design Engineer, AutoCAD Draughtsman…"
                    value={reqKeywordInput} onChange={e => setReqKeywordInput(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter'||e.key===',') { e.preventDefault(); addReqKeyword() } }} />
                  <button onClick={addReqKeyword} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 whitespace-nowrap">+ Add</button>
                </div>
                {reqKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {reqKeywords.map(k => (
                      <span key={k} className="inline-flex items-center gap-1 px-3 py-1 bg-violet-100 text-violet-800 border border-violet-200 rounded-full text-xs font-semibold">
                        {k}<button onClick={() => setReqKeywords(p=>p.filter(x=>x!==k))} className="opacity-50 hover:opacity-100 hover:text-red-600 font-bold">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {/* Skills */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <span className="text-sm font-bold text-blue-700">🛠 Skills Search</span>
                  <div className="flex rounded-lg overflow-hidden border border-blue-200 text-xs font-semibold">
                    {(['any','all','boolean'] as SkillMode[]).map(m => (
                      <button key={m} onClick={() => setSkillMode(m)}
                        className={`px-3 py-1.5 transition-colors ${skillMode===m ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 hover:bg-blue-50'}`}>
                        {m==='any'?'ANY':m==='all'?'ALL':'BOOLEAN'}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  {skillMode==='any'     && 'Returns profiles that match at least one of the skills listed below.'}
                  {skillMode==='all'     && 'Returns only profiles that have ALL the skills listed below.'}
                  {skillMode==='boolean' && 'Use AND, OR, NOT operators. e.g: Java AND Spring NOT PHP OR Node.js'}
                </p>
                {skillMode==='boolean' ? (
                  <input className={fi} placeholder="e.g. Java AND Spring Boot NOT PHP"
                    value={booleanQuery} onChange={e => setBooleanQuery(e.target.value)} />
                ) : (
                  <>
                    <div className="flex gap-2 mb-2">
                      <input className={fi} placeholder="Type a skill, press Enter or comma…"
                        value={skillInput} onChange={e => setSkillInput(e.target.value)}
                        onKeyDown={e => { if (e.key==='Enter'||e.key===',') { e.preventDefault(); addSkill() } }} />
                      <button onClick={addSkill} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 whitespace-nowrap">+ Add</button>
                    </div>
                    {selectedSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedSkills.map(s => (
                          <span key={s} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-full text-xs font-semibold">
                            {s}<button onClick={() => setSelectedSkills(p=>p.filter(x=>x!==s))} className="opacity-50 hover:opacity-100 hover:text-red-600 font-bold">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* Other filters */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Location</label>
                    <input className={fi} placeholder="e.g. Bangalore" value={location} onChange={e => setLocation(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Industry / Domain</label>
                    <select className={fi} value={industry} onChange={e => setIndustry(e.target.value)}>
                      <option value="">All industries</option>
                      {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Notice Period</label>
                    <select className={fi} value={noticePeriod} onChange={e => setNoticePeriod(e.target.value)}>
                      <option value="all">Any</option>
                      <option value="0-15">0–15 days (Immediate)</option>
                      <option value="15-30">15–30 days</option>
                      <option value="30-60">30–60 days</option>
                      <option value="60-999">60+ days</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-semibold text-gray-500 mb-1">Min Exp (yrs)</label><input type="number" className={fi} placeholder="0" value={expMin} onChange={e=>setExpMin(e.target.value)}/></div>
                    <div><label className="block text-xs font-semibold text-gray-500 mb-1">Max Exp (yrs)</label><input type="number" className={fi} placeholder="30" value={expMax} onChange={e=>setExpMax(e.target.value)}/></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-semibold text-gray-500 mb-1">Min CTC (L)</label><input type="number" className={fi} placeholder="0" value={ctcMin} onChange={e=>setCtcMin(e.target.value)}/></div>
                    <div><label className="block text-xs font-semibold text-gray-500 mb-1">Max CTC (L)</label><input type="number" className={fi} placeholder="50" value={ctcMax} onChange={e=>setCtcMax(e.target.value)}/></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Ownership</label>
                      <select className={fi} value={ownershipFilter} onChange={e=>setOwnershipFilter(e.target.value)}>
                        <option value="all">All</option>
                        <option value="owned">🔒 Owned only</option>
                        <option value="available">✅ Available only</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Source</label>
                      <div className="flex flex-col gap-1.5 pt-1">
                        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={showValidated} onChange={e=>setShowValidated(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600"/>✓ Validated</label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={showResumeBank} onChange={e=>setShowResumeBank(e.target.checked)} className="w-3.5 h-3.5 accent-blue-600"/>📄 Resume Bank</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-1 border-t border-gray-100">
                <button onClick={handleSearch} disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 shadow-sm">
                  {loading ? '⏳ Searching…' : '🔍 Search Talent Pool'}
                </button>
                <button onClick={handleClearAll}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stats bar */}
        {results.length > 0 && (
          <div className="grid grid-cols-6 gap-3">
            {[
              { label:'Total',       val:stats.total,          sub:'results',    cls:'text-gray-900',   border:'border-gray-200'   },
              { label:'Validated',   val:stats.validated,      sub:'candidates', cls:'text-emerald-700',border:'border-emerald-200' },
              { label:'Resume Bank', val:stats.resumeBank,     sub:'profiles',   cls:'text-blue-700',   border:'border-blue-200'   },
              { label:'Owned',       val:stats.owned,          sub:'< 90 days',  cls:'text-purple-700', border:'border-purple-200' },
              { label:'Available',   val:stats.available,      sub:'90+ days',   cls:'text-green-700',  border:'border-green-200'  },
              { label:'Avg Match',   val:`${stats.avgMatch}%`, sub:'score',      cls:'text-orange-700', border:'border-orange-200' },
            ].map(s => (
              <div key={s.label} className={`bg-white rounded-xl border ${s.border} p-4 text-center shadow-sm`}>
                <div className={`text-2xl font-bold ${s.cls}`}>{s.val}</div>
                <div className="text-xs font-semibold text-gray-600 mt-0.5">{s.label}</div>
                <div className="text-xs text-gray-400">{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"/>
            <p className="text-gray-500">Searching organisation-wide talent pool…</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 text-gray-400">
            <div className="text-5xl mb-3">🔍</div>
            <p className="font-medium text-gray-500">No results yet</p>
            <p className="text-sm mt-1">Set your filters above and hit Search</p>
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((result, idx) => (
              <ResultCard
                key={`${result.source_type}-${result.id}`}
                result={result} index={idx+1} user={user}
                selectedSkills={selectedSkills} reqKeywords={reqKeywords}
                expanded={expandedId===result.id}
                onToggleExpand={() => setExpandedId(expandedId===result.id ? null : result.id)}
                onViewDetail={() => {
                  const role = user?.role==='sr_team_leader' ? 'sr-tl' : user?.role==='team_leader' ? 'tl' : 'recruiter'
                  router.push(`/${role}/candidates/${result.id}`)
                }}
                onAddToJob={() => {
                  if (result.source_type==='resume_bank') { alert('Convert to candidate first.'); return }
                  setSelectedCandidate(result); setShowAddToJobModal(true)
                }}
                onDeepScore={() => {
                  const jobId = result.job_id || myJobs[0]?.id || ''
                  setScoringTarget({ result, jobId, jobTitle:result.job_title||myJobs[0]?.job_title||'' })
                  setScoreJobId(jobId)
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Deep Score Drawer */}
      {scoringTarget && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setScoringTarget(null)}/>
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 flex items-center justify-between">
              <div className="text-white"><div className="font-bold">🔬 Deep Score</div><div className="text-xs text-violet-200 mt-0.5">{scoringTarget.result.full_name}</div></div>
              <button onClick={() => setScoringTarget(null)} className="text-white/60 hover:text-white text-2xl">×</button>
            </div>
            <div className="px-5 py-3 bg-gray-50 border-b">
              <p className="text-sm font-medium">{scoringTarget.result.current_designation} at {scoringTarget.result.current_company||'—'}</p>
              <p className="text-xs text-gray-500 mt-0.5">{scoringTarget.result.total_experience} yrs · ₹{scoringTarget.result.expected_ctc}L · {scoringTarget.result.current_location||'—'}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {scoringTarget.result.key_skills.slice(0,6).map(s=><span key={s} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">{s}</span>)}
                {scoringTarget.result.key_skills.length>6 && <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">+{scoringTarget.result.key_skills.length-6}</span>}
              </div>
            </div>
            <div className="px-5 py-3 border-b">
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Score against job</label>
              <select value={scoreJobId} onChange={e=>setScoreJobId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
                <option value="">Select a job…</option>
                {scoringTarget.result.job_id && scoringTarget.result.job_title && <option value={scoringTarget.result.job_id}>📌 {scoringTarget.result.job_title} (current)</option>}
                {myJobs.filter(j=>j.id!==scoringTarget.result.job_id).map(j=><option key={j.id} value={j.id}>{j.job_code} — {j.job_title} ({j.clients?.company_name})</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <MatchScorePanel
                jobId={scoreJobId||null} jobTitle={scoreJobTitle}
                candidateId={scoringTarget.result.source_type==='candidate' ? scoringTarget.result.id : undefined}
                resumeBankId={scoringTarget.result.source_type==='resume_bank' ? scoringTarget.result.id : undefined}
                screenedBy={user?.id} autoRun={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Add to Job Modal */}
      {showAddToJobModal && selectedCandidate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Add to My Job</h3>
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="font-semibold">{selectedCandidate.full_name}</p>
              <p className="text-sm text-gray-500">{selectedCandidate.current_designation} at {selectedCandidate.current_company}</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Select Job</label>
              <select value={selectedJobId} onChange={e=>setSelectedJobId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— Select a job —</option>
                {myJobs.map((j:any)=><option key={j.id} value={j.id}>{j.job_code} – {j.job_title} ({j.clients?.company_name})</option>)}
              </select>
              {myJobs.length===0 && <p className="text-xs text-red-500 mt-1">No open jobs assigned to you.</p>}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 mb-4">
              Original owner keeps credit · both can work the same candidate for different jobs
            </div>
            <div className="flex gap-3">
              <button onClick={handleAddToJobSubmit} disabled={!selectedJobId||addingToJob}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
                {addingToJob ? 'Adding…' : '✅ Add to Job'}
              </button>
              <button onClick={() => { setShowAddToJobModal(false); setSelectedJobId(''); setSelectedCandidate(null) }}
                className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

interface ResultCardProps {
  result: SearchResult
  index: number
  user: any
  selectedSkills: string[]
  reqKeywords: string[]
  expanded: boolean
  onToggleExpand: () => void
  onViewDetail: () => void
  onAddToJob: () => void
  onDeepScore: () => void
}

function ResultCard({
  result, index, selectedSkills, reqKeywords,
  expanded, onToggleExpand, onViewDetail, onAddToJob, onDeepScore,
}: ResultCardProps) {
  const isCandidate = result.source_type === 'candidate'

  // Score theming
  const scoreTheme =
    result.match_score >= 80
      ? { pill:'bg-emerald-500 text-white', bar:'bg-emerald-500', track:'bg-emerald-100', label:'Excellent' }
      : result.match_score >= 60
      ? { pill:'bg-amber-400 text-white',   bar:'bg-amber-400',   track:'bg-amber-100',   label:'Good'      }
      : { pill:'bg-orange-400 text-white',  bar:'bg-orange-400',  track:'bg-orange-100',  label:'Partial'   }

  // Source badge
  const sourceBadge = isCandidate
    ? result.is_owned
      ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-purple-100 text-purple-700 border border-purple-200 rounded-full text-xs font-bold">🔒 In Pipeline</span>
      : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">✅ Available</span>
    : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-sky-100 text-sky-700 border border-sky-200 rounded-full text-xs font-bold">📄 Resume Bank</span>

  // Download helper — fetches blob so browser saves rather than navigates
  async function handleDownload() {
    if (!result.resume_url) return
    try {
      const res  = await fetch(result.resume_url)
      const blob = await res.blob()
      const ext  = result.resume_url.split('.').pop()?.split('?')[0] || 'pdf'
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `${result.full_name.replace(/\s+/g,'_')}_Resume.${ext}`
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch {
      // Fallback: open in new tab if fetch blocked
      window.open(result.resume_url, '_blank')
    }
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm transition-all overflow-hidden
      ${result.is_available && isCandidate ? 'border-emerald-200' : 'border-gray-200'}
      ${expanded ? 'shadow-md ring-1 ring-blue-100' : 'hover:shadow-md hover:border-blue-200'}`}>

      {/* ════ MAIN CARD ROW ════ */}
      <div className="flex items-stretch gap-0">

        {/* Left accent — match score column */}
        <div className={`w-[72px] flex-shrink-0 flex flex-col items-center justify-center py-5 gap-1 border-r ${scoreTheme.track} border-opacity-60`}>
          <span className={`text-[22px] font-black leading-none ${
            result.match_score >= 80 ? 'text-emerald-600' : result.match_score >= 60 ? 'text-amber-600' : 'text-orange-500'}`}>
            {result.match_score}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wide ${
            result.match_score >= 80 ? 'text-emerald-500' : result.match_score >= 60 ? 'text-amber-500' : 'text-orange-400'}`}>
            {scoreTheme.label}
          </span>
          {/* thin progress bar */}
          <div className="w-9 h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
            <div className={`h-full rounded-full ${scoreTheme.bar} transition-all`} style={{ width:`${result.match_score}%` }}/>
          </div>
        </div>

        {/* Right — main content */}
        <div className="flex-1 min-w-0 p-4">

          {/* ── Row A: name + badges + CV buttons ── */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            {/* Name + badges */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-[11px] font-bold text-gray-300">#{index}</span>
              <h3 className="font-bold text-gray-900 text-[15px] leading-snug">{result.full_name}</h3>
              {sourceBadge}
              {result.industry && (
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[11px] font-medium">{result.industry}</span>
              )}
            </div>

            {/* ── CV action buttons — always visible ── */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {result.resume_url ? (
                <>
                  {/* View — opens PDF/DOCX in new browser tab */}
                  <a
                    href={result.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View resume in browser"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm whitespace-nowrap">
                    {/* eye icon */}
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                    View CV
                  </a>
                  {/* Download — triggers file save */}
                  <button
                    onClick={handleDownload}
                    title="Download resume file"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                    {/* download icon */}
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    Download
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-gray-300 italic px-1">No CV uploaded</span>
              )}
              <button onClick={onDeepScore}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                🔬 Score
              </button>
            </div>
          </div>

          {/* ── Row B: role details ── */}
          <div className="flex items-center gap-1.5 mt-2 text-sm flex-wrap text-gray-500">
            {result.current_designation && (
              <span className="font-semibold text-gray-800">{result.current_designation}</span>
            )}
            {result.current_company && (
              <><span className="text-gray-300">@</span><span className="text-gray-600">{result.current_company}</span></>
            )}
            {(result.current_designation || result.current_company) && <span className="text-gray-200 mx-0.5">|</span>}
            <span>{result.total_experience} yr{result.total_experience !== 1 ? 's' : ''} exp</span>
            <span className="text-gray-200 mx-0.5">|</span>
            <span>📍 {result.current_location || 'N/A'}</span>
            {result.expected_ctc ? (
              <><span className="text-gray-200 mx-0.5">|</span>
              <span className="font-semibold text-emerald-600">₹{result.expected_ctc}L CTC</span></>
            ) : null}
            {result.notice_period ? (
              <><span className="text-gray-200 mx-0.5">|</span>
              <span className="text-amber-600 text-xs font-medium">{result.notice_period}d notice</span></>
            ) : null}
          </div>

          {/* ── Row C: skills & keyword pills ── */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {/* Matched req keywords — solid violet */}
            {result.requirement_keywords
              .filter(k => reqKeywords.some(rk => rk.toLowerCase() === k.toLowerCase()))
              .map(k => (
                <span key={`rk-${k}`}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-violet-600 text-white rounded-full text-xs font-semibold">
                  🎯 {k}
                </span>
              ))}
            {/* Non-matched req keywords — soft violet */}
            {result.requirement_keywords
              .filter(k => !reqKeywords.some(rk => rk.toLowerCase() === k.toLowerCase()))
              .map(k => (
                <span key={`rk-nm-${k}`}
                  className="px-2.5 py-0.5 bg-violet-100 text-violet-600 border border-violet-200 rounded-full text-xs">
                  {k}
                </span>
              ))}
            {/* Skills — matched = blue filled, rest = grey */}
            {result.key_skills.slice(0, 9).map(s => (
              <span key={s}
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  selectedSkills.some(sk => sk.toLowerCase() === s.toLowerCase())
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}>{s}</span>
            ))}
            {result.key_skills.length > 9 && (
              <button onClick={onToggleExpand}
                className="px-2 py-0.5 bg-gray-50 text-blue-500 hover:text-blue-700 rounded text-xs font-medium transition-colors">
                +{result.key_skills.length - 9} more
              </button>
            )}
          </div>

          {/* ── Row D: footer — meta + action buttons ── */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 flex-wrap">
            {/* Meta info */}
            <div className="text-xs text-gray-400 flex flex-wrap items-center gap-3">
              {isCandidate ? (
                <>
                  {result.current_stage && (
                    <span>Stage: <span className="text-gray-600 font-medium capitalize">{result.current_stage.replace(/_/g,' ')}</span></span>
                  )}
                  {result.job_title && (
                    <span>Job: <span className="text-gray-600 font-medium">{result.job_title}</span></span>
                  )}
                  <span>Last active: <span className="text-gray-600 font-medium">{result.days_since_activity}d ago</span></span>
                  {result.assigned_to_name && (
                    <span>Credit: <span className="text-gray-600 font-medium">{result.assigned_to_name}</span></span>
                  )}
                </>
              ) : (
                <>
                  {result.uploaded_by_name && (
                    <span>Uploaded by: <span className="text-gray-600 font-medium">{result.uploaded_by_name}</span></span>
                  )}
                  {result.uploaded_at && (
                    <span>On: <span className="text-gray-600 font-medium">{new Date(result.uploaded_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</span></span>
                  )}
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="ml-auto flex items-center gap-2">
              {isCandidate ? (
                <>
                  <button onClick={onViewDetail}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-blue-300 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-semibold transition-colors">
                    📋 View Profile
                  </button>
                  <button onClick={onAddToJob}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors">
                    ➕ Add to Job
                  </button>
                </>
              ) : (
                <button onClick={() => alert('Convert to Candidate — coming soon')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors">
                  ✨ Convert to Candidate
                </button>
              )}
              {/* Expand toggle */}
              <button onClick={onToggleExpand}
                className="px-3 py-1.5 border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-lg text-xs font-semibold transition-colors">
                {expanded ? 'Less ▲' : 'Details ▼'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ════ EXPANDED DETAIL PANEL ════ */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4 space-y-4">

          {/* Contact + status grid */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Phone</div>
              <div className="text-sm font-medium text-gray-800">{result.phone || '—'}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Email</div>
              <div className="text-sm font-medium text-gray-800 truncate">{result.email || '—'}</div>
            </div>
            {isCandidate ? (
              <>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Pipeline Stage</div>
                  <div className="text-sm font-medium text-gray-800 capitalize">{result.current_stage?.replace(/_/g,' ') || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Credit To</div>
                  <div className="text-sm font-medium text-gray-800">{result.assigned_to_name || 'Unassigned'}</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Uploaded By</div>
                  <div className="text-sm font-medium text-gray-800">{result.uploaded_by_name || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Date Uploaded</div>
                  <div className="text-sm font-medium text-gray-800">
                    {result.uploaded_at ? new Date(result.uploaded_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* All requirement keywords */}
          {result.requirement_keywords.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Requirement Keywords</div>
              <div className="flex flex-wrap gap-1.5">
                {result.requirement_keywords.map(k => (
                  <span key={k} className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    reqKeywords.some(rk => rk.toLowerCase()===k.toLowerCase())
                      ? 'bg-violet-600 text-white'
                      : 'bg-violet-100 text-violet-700 border border-violet-200'}`}>
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* All skills */}
          {result.key_skills.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                All Skills <span className="text-gray-300 font-normal">({result.key_skills.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.key_skills.map(s => (
                  <span key={s} className={`px-2 py-0.5 rounded text-xs font-medium ${
                    selectedSkills.some(sk => sk.toLowerCase()===s.toLowerCase())
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-700'}`}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}