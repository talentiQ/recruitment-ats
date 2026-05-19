// components/AITalentAgent.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Message {
  role: 'user' | 'assistant'
  content: string
  candidates?: any[]
  filters?: any
  count?: number
}

interface Filters {
  skills: string[]
  location: string | null
  expMin: number | null
  expMax: number | null
  ctcMin: number | null
  ctcMax: number | null
  noticePeriod: string | null
  skillMode: 'any' | 'all'
}

interface Props {
  onApplyFilters?: (filters: any) => void
  userRole?: string
}

const SUGGESTIONS = [
  'Java developers with Spring Boot from Noida, 3–6 yrs',
  'React + Node.js, under 30 day notice, Bangalore',
  'Senior sales managers, 8+ years, CTC under 15 LPA',
  'DevOps engineers with Kubernetes and AWS',
  'Sales Engineers with 5+ years experience, any location, immediate joiners',
  'Accounts Payable professionals in Delhi with 3-5 years experience and CTC up to 10 LPA',
]

// ── Known skills dictionary ───────────────────────────────────────────────────
const KNOWN_SKILLS = [
  // Languages
  'java','python','javascript','typescript','c++','c#','ruby','php','swift','kotlin','go','rust','scala',
  // Frontend
  'react','angular','vue','next.js','nextjs','html','css','tailwind','redux','jquery',
  // Backend
  'node.js','nodejs','spring boot','springboot','django','flask','fastapi','express','laravel','.net',
  // DevOps / Cloud
  'aws','azure','gcp','docker','kubernetes','k8s','terraform','jenkins','ci/cd','devops','ansible','linux',
  // Databases
  'mysql','postgresql','postgres','mongodb','redis','elasticsearch','supabase','firebase','oracle','sql server',
  // Mobile
  'android','ios','flutter','react native',
  // Data / AI
  'machine learning','ml','deep learning','tensorflow','pytorch','pandas','numpy','data science','power bi','tableau',
  // Sales / HR
  'sales','crm','salesforce','b2b','b2c','recruitment','hr','talent acquisition','payroll',
  // Other
  'git','rest api','graphql','microservices','agile','scrum','sap','excel','tally',
]

// ── Indian cities ─────────────────────────────────────────────────────────────
const KNOWN_CITIES = [
  'noida','gurgaon','gurugram','bangalore','bengaluru','mumbai','delhi','hyderabad',
  'pune','chennai','kolkata','ahmedabad','jaipur','lucknow','chandigarh','indore',
  'bhopal','nagpur','kochi','coimbatore','surat','vadodara','thane','navi mumbai',
]

// ── Pure client-side query parser (no API call) ───────────────────────────────
function parseQuery(query: string): Filters {
  const q = query.toLowerCase()

  // Skills — multi-word first, then single-word
  const skills: string[] = []
  const multiWord = KNOWN_SKILLS.filter(s => s.includes(' ') || s.includes('.'))
  for (const skill of multiWord) {
    if (q.includes(skill)) skills.push(skill)
  }
  const words = q.split(/[\s,+&\/]+/)
  for (const word of words) {
    const clean = word.replace(/[^a-z0-9#.]/g, '')
    if (!clean) continue
    const match = KNOWN_SKILLS.find(s => !s.includes(' ') && !s.includes('.') && s === clean)
    if (match && !skills.includes(match)) skills.push(match)
  }

  // Location
  let location: string | null = null
  for (const city of KNOWN_CITIES) {
    if (q.includes(city)) { location = city.replace(/\b\w/g, c => c.toUpperCase()); break }
  }
  if (!location) {
    const locMatch = q.match(/(?:from|in|at|based in|location[:\s]+)\s+([a-z]+(?:\s[a-z]+)?)/)
    if (locMatch) location = locMatch[1].replace(/\b\w/g, c => c.toUpperCase())
  }

  // Experience
  let expMin: number | null = null
  let expMax: number | null = null
  const expRange = q.match(/(\d+)\s*[-–to]+\s*(\d+)\s*(?:yr|year|yrs|years)/)
  if (expRange) {
    expMin = parseInt(expRange[1]); expMax = parseInt(expRange[2])
  } else {
    const minMatch = q.match(/(\d+)\s*\+\s*(?:yr|year|yrs|years)|(?:min(?:imum)?|at\s+least|over)\s+(\d+)\s*(?:yr|year|yrs|years)/)
    if (minMatch) expMin = parseInt(minMatch[1] || minMatch[2])
    const maxMatch = q.match(/(?:up\s+to|max(?:imum)?|under|less\s+than|below)\s+(\d+)\s*(?:yr|year|yrs|years)/)
    if (maxMatch) expMax = parseInt(maxMatch[1])
    if (!expMin && !expMax) {
      const standalone = q.match(/(\d+)\s*(?:yr|year|yrs|years)/)
      if (standalone) { const v = parseInt(standalone[1]); expMin = Math.max(0, v - 1); expMax = v + 2 }
    }
  }

  // CTC
  let ctcMin: number | null = null
  let ctcMax: number | null = null
  const ctcRange = q.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|l\b|lac)/)
  if (ctcRange) { ctcMin = parseFloat(ctcRange[1]); ctcMax = parseFloat(ctcRange[2]) }
  else {
    const maxC = q.match(/(?:under|below|less\s+than|up\s+to|max(?:imum)?)\s+(\d+(?:\.\d+)?)\s*(?:lpa|lakh|l\b|lac)/)
    if (maxC) ctcMax = parseFloat(maxC[1])
    const minC = q.match(/(?:above|over|min(?:imum)?|at\s+least|more\s+than)\s+(\d+(?:\.\d+)?)\s*(?:lpa|lakh|l\b|lac)/)
    if (minC) ctcMin = parseFloat(minC[1])
  }

  // Notice period
  let noticePeriod: string | null = null
  if (q.match(/immediate|no\s+notice|0\s*day/))          noticePeriod = '0-15'
  else if (q.match(/under\s+15|within\s+15/))            noticePeriod = '0-15'
  else if (q.match(/under\s+30|within\s+30|30\s*day/))   noticePeriod = '15-30'
  else if (q.match(/60\s*day|2\s*month/))                noticePeriod = '30-60'
  else if (q.match(/60\+|more\s+than\s+60|3\s*month/))   noticePeriod = '60-999'

  // Skill mode: ALL if query contains "and" between multiple skills
  const skillMode: 'any' | 'all' = q.includes(' and ') && skills.length > 1 ? 'all' : 'any'

  return { skills, location, expMin, expMax, ctcMin, ctcMax, noticePeriod, skillMode }
}

// ── Skill partial match (same as main page logic) ─────────────────────────────
function skillMatch(profileSkills: string[], querySkill: string): boolean {
  const ql = querySkill.toLowerCase()
  return profileSkills.some(s => {
    const sl = s.toLowerCase()
    return sl.includes(ql) || ql.includes(sl)
  })
}

// ── Local summary (no Claude needed) ─────────────────────────────────────────
function buildSummary(candidates: any[], filters: Filters, query: string): string {
  if (candidates.length === 0) {
    const tips: string[] = []
    if (filters.skills.length > 1) tips.push('try fewer skills')
    if (filters.location)          tips.push('broaden the location')
    if (filters.expMin || filters.expMax) tips.push('widen the experience range')
    return `No candidates found for "${query}".${tips.length ? `\n\nTips: ${tips.join(', ')}.` : ''}`
  }

  const lines: string[] = []
  lines.push(`Found ${candidates.length} candidate${candidates.length !== 1 ? 's' : ''} matching your search.\n`)

  const top = candidates.slice(0, 3)
  lines.push('Top matches:')
  top.forEach((c, i) => {
    const notice = c.notice_period ? `${c.notice_period}d notice` : 'notice N/A'
    const ctc    = c.expected_ctc  ? `₹${c.expected_ctc} CTC`   : ''
    lines.push(`${i + 1}. ${c.full_name} — ${c.current_designation} at ${c.current_company || 'N/A'} · ${c.total_experience}y · ${c.current_location} · ${[ctc, notice].filter(Boolean).join(' · ')}`)
  })

  // Location pattern
  const cityCount: Record<string, number> = {}
  candidates.forEach(c => { if (c.current_location) cityCount[c.current_location] = (cityCount[c.current_location] || 0) + 1 })
  const topCity = Object.entries(cityCount).sort((a, b) => b[1] - a[1])[0]
  if (topCity && candidates.length > 2)
    lines.push(`\nMost are based in ${topCity[0]} (${topCity[1]}/${candidates.length}).`)

  const immediate = candidates.filter(c => (c.notice_period || 0) <= 15).length
  if (immediate > 0)
    lines.push(`${immediate} candidate${immediate !== 1 ? 's are' : ' is'} available immediately (≤15d notice).`)

  if (top[0]) lines.push(`\nStart with ${top[0].full_name} — click their card to open the profile.`)

  return lines.join('\n')
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AITalentAgent({ onApplyFilters, userRole }: Props) {
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLInputElement>(null)
  const router                  = useRouter()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  async function handleSend(query?: string) {
    const q = (query || input).trim()
    if (!q || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)

    try {
      // Step 1: Parse locally — instant, 
      const filters = parseQuery(q)

      // Step 2: Supabase client-side — browser session handles RLS
      let dbQuery = supabase
        .from('candidates')
        .select(`
          id, full_name, current_company, current_designation, total_experience,
          current_location, expected_ctc, key_skills, notice_period, current_stage,
          last_activity_date, created_at, resume_url, jobs(job_title)
        `)
        .neq('current_stage', 'joined')

      if (filters.location)        dbQuery = dbQuery.ilike('current_location', `%${filters.location}%`)
      if (filters.expMin != null)  dbQuery = dbQuery.gte('total_experience', filters.expMin)
      if (filters.expMax != null)  dbQuery = dbQuery.lte('total_experience', filters.expMax)
      if (filters.ctcMin != null)  dbQuery = dbQuery.gte('expected_ctc', filters.ctcMin)
      if (filters.ctcMax != null)  dbQuery = dbQuery.lte('expected_ctc', filters.ctcMax)
      if (filters.noticePeriod) {
        const [mn, mx] = filters.noticePeriod.split('-').map(Number)
        if (mx && mx < 999) dbQuery = dbQuery.gte('notice_period', mn).lte('notice_period', mx)
        else                dbQuery = dbQuery.gte('notice_period', mn)
      }

      const { data: rawCandidates, error: dbError } = await dbQuery
      if (dbError) throw new Error(`Search failed: ${dbError.message}`)

      // Step 3: Client-side skill filter
      let candidates = rawCandidates || []
      if (filters.skills.length > 0) {
        candidates = candidates.filter((c: any) => {
          const ps = c.key_skills || []
          return filters.skillMode === 'all'
            ? filters.skills.every(sk => skillMatch(ps, sk))
            : filters.skills.some(sk => skillMatch(ps, sk))
        })
      }
      candidates = candidates.slice(0, 15)

      // Step 4: Build summary locally
      const summary = buildSummary(candidates, filters, q)

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: summary,
        candidates,
        filters,
        count: candidates.length,
      }])

    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Something went wrong: ${e.message}. Please try again.`,
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleApplyFilters(filters: any) {
    onApplyFilters?.(filters)
    setOpen(false)
  }

  const basePath = userRole === 'team_leader'       ? 'tl'
    : userRole === 'sr_team_leader'                 ? 'sr-tl'
    : userRole === 'ceo' || userRole === 'ops_head' ? 'management'
    : 'recruiter'

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3
                   bg-gradient-to-r from-violet-600 to-indigo-600 text-white
                   rounded-2xl shadow-lg hover:shadow-xl hover:scale-105
                   transition-all font-semibold text-sm"
      >
        <span className="text-base">🤖</span>
        AI Talent Search
        {messages.length > 0 && (
          <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">
            {messages.filter(m => m.role === 'user').length}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setOpen(false)} />

          <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col h-full">

            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="text-white font-bold">🤖TalentIQ AI Agent</div>
                <div className="text-violet-200 text-xs mt-0.5">Ask in plain English — instant results</div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button onClick={() => setMessages([])}
                    className="text-violet-200 hover:text-white text-xs px-2 py-1 rounded border border-violet-400 hover:border-white transition-colors">
                    Clear
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">

              {messages.length === 0 && (
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-600 font-medium mb-1">👋 Search your talent pool in plain English.</p>
                    <p className="text-xs text-gray-400">I extract skills, location, experience, CTC and notice period — then show matches instantly with Smart Search.</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Try asking</p>
                    <div className="space-y-2">
                      {SUGGESTIONS.map(s => (
                        <button key={s} onClick={() => handleSend(s)}
                          className="w-full text-left text-sm bg-white border border-gray-200
                                     hover:border-violet-300 hover:bg-violet-50 rounded-xl px-4 py-3 text-gray-600 transition-all">
                          💬 {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[90%]">
                    {msg.role === 'user' ? (
                      <div className="bg-violet-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="space-y-3">

                        {/* Filter badges */}
                        {msg.filters && (
                          <div className="flex flex-wrap gap-1.5 px-1">
                            {msg.filters.skills?.map((s: string) => (
                              <span key={s} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">🛠 {s}</span>
                            ))}
                            {msg.filters.location && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">📍 {msg.filters.location}</span>
                            )}
                            {(msg.filters.expMin != null || msg.filters.expMax != null) && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                                📅 {msg.filters.expMin ?? 0}–{msg.filters.expMax ?? '∞'} yrs
                              </span>
                            )}
                            {msg.filters.ctcMax != null && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">💰 ≤{msg.filters.ctcMax} LPA</span>
                            )}
                            {msg.filters.noticePeriod && (
                              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">⏱ {msg.filters.noticePeriod}d</span>
                            )}
                            <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full text-xs">{msg.count} found</span>
                          </div>
                        )}

                        {/* Summary */}
                        <div className="bg-white rounded-2xl rounded-tl-sm border border-gray-200 px-4 py-3 shadow-sm">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        </div>

                        {/* Candidate cards */}
                        {msg.candidates && msg.candidates.length > 0 && (
                          <div className="space-y-2">
                            {msg.candidates.slice(0, 4).map((c: any) => (
                              <div key={c.id}
                                className="bg-white border border-gray-200 rounded-xl px-3 py-2.5
                                           hover:border-violet-300 hover:shadow-sm transition-all cursor-pointer"
                                onClick={() => router.push(`/${basePath}/candidates/${c.id}`)}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{c.full_name}</p>
                                    <p className="text-xs text-gray-500 truncate">
                                      {c.current_designation} @ {c.current_company || '—'} · {c.total_experience}y · {c.current_location}
                                    </p>
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {(c.key_skills || []).slice(0, 4).map((s: string) => (
                                        <span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{s}</span>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex-shrink-0 text-right">
                                    <div className="text-xs text-emerald-600 font-semibold">{c.expected_ctc ? `₹${c.expected_ctc}` : '—'}</div>
                                    <div className="text-[10px] text-amber-500 mt-0.5">{c.notice_period || 0}d notice</div>
                                  </div>
                                </div>
                              </div>
                            ))}

                            {msg.candidates.length > 4 && (
                              <p className="text-xs text-gray-400 text-center">
                                +{msg.candidates.length - 4} more — apply filters to see all
                              </p>
                            )}

                            {msg.filters && onApplyFilters && (
                              <button onClick={() => handleApplyFilters(msg.filters)}
                                className="w-full py-2 border border-violet-300 text-violet-600 hover:bg-violet-50
                                           rounded-xl text-xs font-semibold transition-colors">
                                ↩ Apply these filters to main search
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      Searching talent pool…
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-gray-200 p-4 bg-white">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="e.g. Java devs with AWS, 5+ yrs, Pune, notice under 30d…"
                  disabled={loading}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent
                             disabled:opacity-50 placeholder-gray-300"
                />
                <button onClick={() => handleSend()} disabled={!input.trim() || loading}
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl
                             font-semibold text-sm disabled:opacity-40 transition-colors">
                  {loading ? '⏳' : '→'}
                </button>
              </div>
              <p className="text-[11px] text-gray-300 mt-2 text-center">
                Instant search  · click a card to open the profile
              </p>
            </div>

          </div>
        </div>
      )}
    </>
  )
}