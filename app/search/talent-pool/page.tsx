// app/search/talent-pool/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import DashboardLayout from '@/components/DashboardLayout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { normalizeSkills } from '@/lib/skillNormalization'

// ── Admin client for search ONLY — graceful fallback for build time ──────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : createClient('https://placeholder.supabase.co', 'placeholder-key-for-build-time-only')

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
  key_skills: string[]
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

export default function TalentPoolSearchPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [results, setResults] = useState<SearchResult[]>([])

  // Add to Job Modal
  const [showAddToJobModal, setShowAddToJobModal] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<SearchResult | null>(null)
  const [myJobs, setMyJobs] = useState<any[]>([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [addingToJob, setAddingToJob] = useState(false)

  // Filter states
  const [quickSearch, setQuickSearch] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(true)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [location, setLocation] = useState('')
  const [expMin, setExpMin] = useState('')
  const [expMax, setExpMax] = useState('')
  const [ctcMin, setCtcMin] = useState('')
  const [ctcMax, setCtcMax] = useState('')
  const [noticePeriod, setNoticePeriod] = useState('all')
  const [showValidated, setShowValidated] = useState(true)
  const [showResumeBank, setShowResumeBank] = useState(true)
  const [ownershipFilter, setOwnershipFilter] = useState('all')

  const [stats, setStats] = useState({
    total: 0,
    validated: 0,
    resumeBank: 0,
    owned: 0,
    available: 0,
    avgMatch: 0
  })

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      loadMyJobs(parsedUser)
    }
  }, [])

  const loadMyJobs = async (currentUser: any) => {
    try {
      const { data: assignments } = await supabase
        .from('job_recruiter_assignments')
        .select(`
          job_id,
          jobs (
            id,
            job_code,
            job_title,
            status,
            clients (company_name)
          )
        `)
        .eq('recruiter_id', currentUser.id)
        .eq('is_active', true)
        .eq('jobs.status', 'open')

      if (assignments) {
        const jobs = assignments
          .map((a: any) => a.jobs)
          .filter((j: any) => j !== null)
        setMyJobs(jobs)
      }
    } catch (error) {
      console.error('Error loading jobs:', error)
    }
  }

  const handleAddToJob = (candidate: SearchResult) => {
    if (candidate.source_type === 'resume_bank') {
      alert('Please convert this resume to a candidate first before adding to a job.')
      return
    }
    setSelectedCandidate(candidate)
    setShowAddToJobModal(true)
  }

  const handleAddToJobSubmit = async () => {
    if (!selectedJobId || !selectedCandidate || !user) {
      alert('Please select a job')
      return
    }

    setAddingToJob(true)
    try {
      const { data: existing } = await supabase
        .from('job_recruiter_assignments')
        .select('id')
        .eq('job_id', selectedJobId)
        .eq('recruiter_id', user.id)
        .single()

      if (!existing) {
        const { error: assignError } = await supabase
          .from('job_recruiter_assignments')
          .insert({
            job_id: selectedJobId,
            recruiter_id: user.id,
            assigned_by: user.id,
            is_active: true,
            positions_allocated: 1
          })
        if (assignError) throw assignError
      }

      await supabase
        .from('candidate_timeline')
        .insert({
          candidate_id: selectedCandidate.id,
          activity_type: 'added_to_job',
          activity_title: 'Added to Additional Job',
          activity_description: `Added to job by ${user.full_name} from talent pool search`,
          performed_by: user.id
        })

      alert(`✅ Success! ${selectedCandidate.full_name} added to your job. You can now work on this candidate.`)
      setShowAddToJobModal(false)
      setSelectedJobId('')
      setSelectedCandidate(null)
    } catch (error: any) {
      console.error('Error adding to job:', error)
      alert('Error: ' + (error.message || 'Could not add to job'))
    } finally {
      setAddingToJob(false)
    }
  }

  const handleSearch = async () => {
    setLoading(true)
    try {
      let allResults: SearchResult[] = []
      const now = new Date()

      // Normalize search skills
      let searchSkills = selectedSkills
      if (selectedSkills.length > 0) {
        const normalized = await normalizeSkills(selectedSkills)
        searchSkills = normalized.normalized
      }

      // ── Search candidates ──────────────────────────────────────────────────
      if (showValidated) {
        let candidateQuery = supabaseAdmin
          .from('candidates')
          .select(`
            id, full_name, phone, email,
            current_company, current_designation,
            total_experience, current_location,
            expected_ctc, key_skills, notice_period,
            current_stage, job_id,
            last_activity_date, created_at,
            jobs (job_title, job_code),
            assigned_user:assigned_to (full_name),
            resume_url
          `)
          .neq('current_stage', 'joined')

        if (quickSearch.trim()) {
          candidateQuery = candidateQuery.or(
            `full_name.ilike.%${quickSearch}%,phone.ilike.%${quickSearch}%,email.ilike.%${quickSearch}%`
          )
        }
        if (searchSkills.length > 0) {
          candidateQuery = candidateQuery.overlaps('key_skills', searchSkills)
        }
        if (location) {
          candidateQuery = candidateQuery.ilike('current_location', `%${location}%`)
        }
        if (expMin) candidateQuery = candidateQuery.gte('total_experience', parseFloat(expMin))
        if (expMax) candidateQuery = candidateQuery.lte('total_experience', parseFloat(expMax))
        if (ctcMin) candidateQuery = candidateQuery.gte('expected_ctc', parseFloat(ctcMin))
        if (ctcMax) candidateQuery = candidateQuery.lte('expected_ctc', parseFloat(ctcMax))
        if (noticePeriod !== 'all') {
          const [min, max] = noticePeriod.split('-').map(Number)
          if (max) {
            candidateQuery = candidateQuery.gte('notice_period', min).lte('notice_period', max)
          } else {
            candidateQuery = candidateQuery.gte('notice_period', min)
          }
        }

        const { data: candidates } = await candidateQuery

        if (candidates) {
          const processedCandidates = candidates.map((c: any) => {
            const lastActivity = c.last_activity_date ? new Date(c.last_activity_date) : new Date(c.created_at)
            const daysSince = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
            const isOwned = daysSince <= 90
            const isAvailable = daysSince > 90

            return {
              source_type: 'candidate' as const,
              id: c.id,
              full_name: c.full_name,
              phone: c.phone,
              email: c.email,
              current_company: c.current_company,
              current_designation: c.current_designation,
              total_experience: c.total_experience,
              current_location: c.current_location,
              expected_ctc: c.expected_ctc,
              key_skills: c.key_skills || [],
              current_stage: c.current_stage,
              job_id: c.job_id,
              job_title: c.jobs?.job_title,
              assigned_to: c.assigned_to,
              assigned_to_name: c.assigned_user?.full_name,
              last_activity_date: c.last_activity_date,
              resume_url: c.resume_url,
              days_since_activity: daysSince,
              is_owned: isOwned,
              is_available: isAvailable,
              match_score: calculateMatchScore(c, searchSkills, location, expMin, expMax, ctcMin, ctcMax)
            }
          })

          let filteredCandidates = processedCandidates
          if (ownershipFilter === 'owned') {
            filteredCandidates = processedCandidates.filter(c => c.is_owned)
          } else if (ownershipFilter === 'available') {
            filteredCandidates = processedCandidates.filter(c => c.is_available)
          }

          allResults = allResults.concat(filteredCandidates)
        }
      }

      // ── Search resume bank ─────────────────────────────────────────────────
      if (showResumeBank) {
        let resumeQuery = supabaseAdmin
          .from('resume_bank')
          .select(`
            id, full_name, phone, email,
            current_company, current_designation,
            total_experience, current_location,
            expected_ctc, key_skills, notice_period,
            status, uploaded_by, uploaded_at,
            resume_url,
            uploader:uploaded_by (full_name)
          `)
          .eq('status', 'available')

        if (quickSearch.trim()) {
          resumeQuery = resumeQuery.or(
            `full_name.ilike.%${quickSearch}%,phone.ilike.%${quickSearch}%,email.ilike.%${quickSearch}%`
          )
        }
        if (searchSkills.length > 0) {
          resumeQuery = resumeQuery.overlaps('key_skills', searchSkills)
        }
        if (location) resumeQuery = resumeQuery.ilike('current_location', `%${location}%`)
        if (expMin) resumeQuery = resumeQuery.gte('total_experience', parseFloat(expMin))
        if (expMax) resumeQuery = resumeQuery.lte('total_experience', parseFloat(expMax))
        if (ctcMin) resumeQuery = resumeQuery.gte('expected_ctc', parseFloat(ctcMin))
        if (ctcMax) resumeQuery = resumeQuery.lte('expected_ctc', parseFloat(ctcMax))
        if (noticePeriod !== 'all') {
          const [min, max] = noticePeriod.split('-').map(Number)
          if (max) {
            resumeQuery = resumeQuery.gte('notice_period', min).lte('notice_period', max)
          } else {
            resumeQuery = resumeQuery.gte('notice_period', min)
          }
        }

        const { data: resumes } = await resumeQuery

        if (resumes) {
          const processedResumes = resumes.map((r: any) => ({
            source_type: 'resume_bank' as const,
            id: r.id,
            full_name: r.full_name,
            phone: r.phone,
            email: r.email,
            current_company: r.current_company,
            current_designation: r.current_designation,
            total_experience: r.total_experience,
            current_location: r.current_location,
            expected_ctc: r.expected_ctc,
            key_skills: r.key_skills || [],
            resume_bank_status: r.status,
            uploaded_by: r.uploaded_by,
            uploaded_by_name: r.uploader?.full_name,
            uploaded_at: r.uploaded_at,
            resume_url: r.resume_url,
            days_since_activity: 0,
            is_owned: false,
            is_available: true,
            match_score: calculateMatchScore(r, searchSkills, location, expMin, expMax, ctcMin, ctcMax)
          }))

          if (ownershipFilter === 'available' || ownershipFilter === 'all') {
            allResults = allResults.concat(processedResumes)
          }
        }
      }

      // Sort by match score
      allResults.sort((a, b) => b.match_score - a.match_score)

      const validated  = allResults.filter(r => r.source_type === 'candidate').length
      const resumeBank = allResults.filter(r => r.source_type === 'resume_bank').length
      const owned      = allResults.filter(r => r.is_owned).length
      const available  = allResults.filter(r => r.is_available).length
      const avgMatch   = allResults.length > 0
        ? Math.round(allResults.reduce((sum, r) => sum + r.match_score, 0) / allResults.length)
        : 0

      setStats({ total: allResults.length, validated, resumeBank, owned, available, avgMatch })
      setResults(allResults)

    } catch (error) {
      console.error('Search error:', error)
      alert('Error searching. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const calculateMatchScore = (
    candidate: any,
    skills: string[],
    loc: string,
    minExp: string,
    maxExp: string,
    minCtc: string,
    maxCtc: string
  ): number => {
    let score = 0
    if (skills.length > 0 && candidate.key_skills) {
      const matchedSkills = skills.filter(s =>
        candidate.key_skills.some((cs: string) => cs.toLowerCase() === s.toLowerCase())
      )
      score += Math.round((matchedSkills.length / skills.length) * 40)
    } else {
      score += 40
    }
    if (minExp || maxExp) {
      const exp = candidate.total_experience
      const min = parseFloat(minExp) || 0
      const max = parseFloat(maxExp) || 100
      if (exp >= min && exp <= max) score += 20
    } else {
      score += 20
    }
    if (loc) {
      if (candidate.current_location?.toLowerCase().includes(loc.toLowerCase())) score += 15
    } else {
      score += 15
    }
    if (minCtc || maxCtc) {
      const ctc = candidate.expected_ctc
      const min = parseFloat(minCtc) || 0
      const max = parseFloat(maxCtc) || 1000
      if (ctc >= min && ctc <= max) score += 15
    } else {
      score += 15
    }
    const notice = candidate.notice_period || 0
    if (notice <= 30) score += 10
    else if (notice <= 60) score += 5
    return score
  }

  const addSkill = () => {
    if (skillInput && !selectedSkills.includes(skillInput)) {
      setSelectedSkills([...selectedSkills, skillInput])
      setSkillInput('')
    }
  }

  const removeSkill = (skill: string) => {
    setSelectedSkills(selectedSkills.filter(s => s !== skill))
  }

  const handleClearAll = () => {
    setQuickSearch('')
    setSelectedSkills([])
    setLocation('')
    setExpMin('')
    setExpMax('')
    setCtcMin('')
    setCtcMax('')
    setNoticePeriod('all')
    setOwnershipFilter('all')
    setResults([])
    setStats({ total: 0, validated: 0, resumeBank: 0, owned: 0, available: 0, avgMatch: 0 })
  }

  const handleViewResume = async (resumeUrl: string) => {
    if (!resumeUrl) { alert('No resume available'); return }
    window.open(resumeUrl, '_blank')
  }

  const getMatchBadge = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800 border-green-300'
    if (score >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    return 'bg-orange-100 text-orange-800 border-orange-300'
  }

  const getMatchStars = (score: number) => {
    if (score >= 80) return '⭐⭐⭐⭐⭐'
    if (score >= 60) return '⭐⭐⭐⭐'
    if (score >= 40) return '⭐⭐⭐'
    return '⭐⭐'
  }

  const getOwnershipBadge = (result: SearchResult) => {
    if (result.source_type === 'resume_bank') {
      return (
        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold border-2 border-blue-300">
          📄 AVAILABLE - Resume Bank
        </span>
      )
    }
    if (result.is_owned) {
      return (
        <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-bold border-2 border-purple-300">
          🔒 OWNED - {result.assigned_to_name} ({result.days_since_activity}d ago)
        </span>
      )
    }
    return (
      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold border-2 border-green-300 animate-pulse">
        ✅ AVAILABLE ({result.days_since_activity}d inactive)
      </span>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">🔍 Organization-Wide Talent Pool</h2>
          <p className="text-gray-600 mt-2">Search all candidates across the entire organization</p>
          <p className="text-sm text-blue-600 font-medium mt-1">
            💡 CVs active within 90 days show ownership | 90+ days = available to all
          </p>
        </div>

        {/* Quick Search */}
        <div className="card">
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Quick search by name, phone, or email..."
            className="input text-lg"
          />
        </div>

        {/* Advanced Filters */}
        <div className="card">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-blue-600 hover:text-blue-800 font-medium mb-4"
          >
            {showAdvanced ? '▼' : '▶'} Advanced Filters
          </button>

          {showAdvanced && (
            <div className="space-y-6">
              {/* Skills */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Skills Required</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addSkill()}
                    placeholder="Type skill and press Enter..."
                    className="input flex-1"
                  />
                  <button onClick={addSkill} className="btn-primary">Add Skill</button>
                </div>
                {selectedSkills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedSkills.map(skill => (
                      <span key={skill} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium flex items-center gap-2">
                        {skill}
                        <button onClick={() => removeSkill(skill)} className="text-blue-600 hover:text-blue-900 font-bold">✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Location & Experience */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                  <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., Bangalore" className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Min Experience (Years)</label>
                  <input type="number" value={expMin} onChange={(e) => setExpMin(e.target.value)} placeholder="0" className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Experience (Years)</label>
                  <input type="number" value={expMax} onChange={(e) => setExpMax(e.target.value)} placeholder="20" className="input" />
                </div>
              </div>

              {/* CTC & Notice */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Min Expected CTC (Lakhs)</label>
                  <input type="number" value={ctcMin} onChange={(e) => setCtcMin(e.target.value)} placeholder="0" className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Expected CTC (Lakhs)</label>
                  <input type="number" value={ctcMax} onChange={(e) => setCtcMax(e.target.value)} placeholder="50" className="input" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notice Period</label>
                  <select value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)} className="input">
                    <option value="all">All</option>
                    <option value="0-15">0-15 days (Immediate)</option>
                    <option value="15-30">15-30 days</option>
                    <option value="30-60">30-60 days</option>
                    <option value="60-999">60+ days</option>
                  </select>
                </div>
              </div>

              {/* Source & Ownership Filters */}
              <div className="border-t pt-4 grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Show Results From:</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={showValidated} onChange={(e) => setShowValidated(e.target.checked)} className="w-4 h-4" />
                      <span>✓ Validated Candidates</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={showResumeBank} onChange={(e) => setShowResumeBank(e.target.checked)} className="w-4 h-4" />
                      <span>📄 Resume Bank</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ownership Status:</label>
                  <select value={ownershipFilter} onChange={(e) => setOwnershipFilter(e.target.value)} className="input">
                    <option value="all">All CVs</option>
                    <option value="owned">🔒 Owned (Active within 90 days)</option>
                    <option value="available">✅ Available (90+ days inactive)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Owned CVs show who has credit. Available CVs are free to pick up.</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4 border-t">
                <button onClick={handleSearch} disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
                  {loading ? 'Searching...' : '🔍 Search Entire Talent Pool'}
                </button>
                <button onClick={handleClearAll} className="bg-white border border-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50">
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stats Summary */}
        {results.length > 0 && (
          <div className="card bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200">
            <div className="grid grid-cols-6 gap-4 text-center">
              <div>
                <div className="text-sm text-gray-600 mb-1">Total Results</div>
                <div className="text-3xl font-bold text-blue-900">{stats.total}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">✓ Validated</div>
                <div className="text-3xl font-bold text-green-600">{stats.validated}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">📄 Resume Bank</div>
                <div className="text-3xl font-bold text-blue-600">{stats.resumeBank}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">🔒 Owned</div>
                <div className="text-3xl font-bold text-purple-600">{stats.owned}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">✅ Available</div>
                <div className="text-3xl font-bold text-green-600">{stats.available}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Avg Match</div>
                <div className="text-3xl font-bold text-orange-600">{stats.avgMatch}%</div>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Searching entire organization...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-600 mb-2">No results found</p>
            <p className="text-sm text-gray-500">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {results.map((result, index) => (
              <div
                key={`${result.source_type}-${result.id}`}
                className={`card hover:shadow-lg transition ${
                  result.is_available && result.source_type === 'candidate'
                    ? 'border-2 border-green-300 bg-green-50'
                    : ''
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-2xl font-bold text-gray-400">#{index + 1}</span>
                    <h3 className="font-bold text-lg text-gray-900">{result.full_name}</h3>
                    {getOwnershipBadge(result)}
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border-2 ${getMatchBadge(result.match_score)}`}>
                      {result.match_score}% Match {getMatchStars(result.match_score)}
                    </span>
                  </div>
                </div>

                {/* Professional Info */}
                <div className="grid grid-cols-4 gap-4 mb-3">
                  <div>
                    <div className="text-xs text-gray-500">Company</div>
                    <div className="font-medium">{result.current_company || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Designation</div>
                    <div className="font-medium">{result.current_designation || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Experience</div>
                    <div className="font-medium">{result.total_experience} years</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Location</div>
                    <div className="font-medium">{result.current_location || 'N/A'}</div>
                  </div>
                </div>

                {/* Second Row */}
                <div className="grid grid-cols-4 gap-4 mb-3">
                  <div>
                    <div className="text-xs text-gray-500">Expected CTC</div>
                    <div className="font-medium text-green-600">₹{result.expected_ctc}L</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Phone</div>
                    <div className="font-medium text-sm">{result.phone}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500">Email</div>
                    <div className="font-medium text-sm">{result.email}</div>
                  </div>
                </div>

                {/* Skills */}
                <div className="mb-3">
                  <div className="text-xs text-gray-500 mb-1">Skills</div>
                  <div className="flex flex-wrap gap-2">
                    {result.key_skills.slice(0, 10).map(skill => (
                      <span
                        key={skill}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          selectedSkills.some(s => s.toLowerCase() === skill.toLowerCase())
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {skill}
                      </span>
                    ))}
                    {result.key_skills.length > 10 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs">
                        +{result.key_skills.length - 10} more
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Info */}
                {result.source_type === 'candidate' ? (
                  <div className={`border rounded p-3 text-sm mb-3 ${
                    result.is_owned ? 'bg-purple-50 border-purple-200' : 'bg-green-50 border-green-200'
                  }`}>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <span className="text-gray-600">Stage:</span>{' '}
                        <span className="font-medium">{result.current_stage?.replace(/_/g, ' ')}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Current Job:</span>{' '}
                        <span className="font-medium">{result.job_title || 'None'}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Credit To:</span>{' '}
                        <span className="font-medium">{result.assigned_to_name || 'Unassigned'}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Last Activity:</span>{' '}
                        <span className={`font-medium ${result.is_available ? 'text-green-600' : 'text-purple-600'}`}>
                          {result.days_since_activity}d ago
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm mb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-gray-600">Uploaded by:</span>{' '}
                        <span className="font-medium">{result.uploaded_by_name}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Uploaded:</span>{' '}
                        <span className="font-medium">
                          {result.uploaded_at ? new Date(result.uploaded_at).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                      <span className="px-2 py-1 bg-blue-200 text-blue-900 rounded text-xs font-bold">
                        ✅ Available for anyone
                      </span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {result.source_type === 'candidate' ? (
                    <>
                      <button
                        onClick={() => {
                          const role = user?.role === 'sr_team_leader' ? 'sr-tl' :
                                       user?.role === 'team_leader' ? 'tl' : 'recruiter'
                          router.push(`/${role}/candidates/${result.id}`)
                        }}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-medium"
                      >
                        📋 View Full Details
                      </button>
                      <button
                        onClick={() => handleAddToJob(result)}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 font-medium"
                      >
                        ➕ Add to My Job
                      </button>
                      {result.resume_url && (
                        <button
                          onClick={() => handleViewResume(result.resume_url!)}
                          className="bg-white border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
                        >
                          📄 Resume
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => alert('Convert to Candidate feature coming soon!')}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-medium flex-1"
                      >
                        ✨ Convert to Candidate
                      </button>
                      {result.resume_url && (
                        <>
                          <button
                            onClick={() => handleViewResume(result.resume_url!)}
                            className="bg-white border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
                          >
                            👁️ View
                          </button>
                          <button
                            onClick={() => window.open(result.resume_url, '_blank')}
                            className="bg-white border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
                          >
                            📥 Download
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add to Job Modal */}
      {showAddToJobModal && selectedCandidate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Add to My Job</h3>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Adding:</p>
              <p className="font-medium">{selectedCandidate.full_name}</p>
              <p className="text-sm text-gray-500">{selectedCandidate.current_designation} at {selectedCandidate.current_company}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Your Job:</label>
              <select value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} className="input">
                <option value="">-- Select a Job --</option>
                {myJobs.map((job: any) => (
                  <option key={job.id} value={job.id}>
                    {job.job_code} - {job.job_title} ({job.clients?.company_name})
                  </option>
                ))}
              </select>
              {myJobs.length === 0 && (
                <p className="text-sm text-red-600 mt-2">
                  You have no open jobs assigned. Please get a job assigned first.
                </p>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm mb-4">
              <p className="font-medium text-blue-900 mb-1">What happens next:</p>
              <ul className="text-blue-800 text-xs space-y-1 list-disc list-inside">
                <li>You'll be assigned to this job</li>
                <li>You can work on this candidate for your job</li>
                <li>Original owner keeps credit for their job</li>
                <li>Both can work on same candidate for different jobs</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddToJobSubmit}
                disabled={!selectedJobId || addingToJob}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {addingToJob ? 'Adding...' : '✅ Add to Job'}
              </button>
              <button
                onClick={() => {
                  setShowAddToJobModal(false)
                  setSelectedJobId('')
                  setSelectedCandidate(null)
                }}
                className="bg-white border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
