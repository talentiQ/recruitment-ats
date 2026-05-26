// components/TopContributors.tsx
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Contributor {
  id: string
  name: string
  count: number
  thisWeek: number
  hasStreak: boolean
}

const MEDALS = ['🥇', '🥈', '🥉']
const MEDAL_COLORS = [
  { bg: 'bg-amber-50',   border: 'border-amber-200',  name: 'text-amber-800',  count: 'text-amber-600',  bar: 'bg-amber-400'  },
  { bg: 'bg-slate-50',   border: 'border-slate-200',  name: 'text-slate-700',  count: 'text-slate-500',  bar: 'bg-slate-400'  },
  { bg: 'bg-orange-50',  border: 'border-orange-200', name: 'text-orange-800', count: 'text-orange-600', bar: 'bg-orange-400' },
]

export default function TopContributors() {
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [totalThisMonth, setTotalThisMonth]   = useState(0)
  const [totalAllTime, setTotalAllTime]       = useState(0)
  const [loading, setLoading]                 = useState(true)
  const [collapsed, setCollapsed]             = useState(false)
  const [monthLabel, setMonthLabel]           = useState('')

  useEffect(() => {
    const now = new Date()
    setMonthLabel(now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }))
    loadContributors()
  }, [])

  const loadContributors = async () => {
    setLoading(true)
    try {
      const now       = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const weekStart  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

      // Fetch current month uploads with uploader name
      const { data: monthUploads } = await supabase
        .from('resume_bank')
        .select('uploaded_by, uploaded_at, uploader:uploaded_by(full_name)')
        .gte('uploaded_at', monthStart)
        .not('uploaded_by', 'is', null)

      // Fetch all-time count (head only)
      const { count: allTime } = await supabase
        .from('resume_bank')
        .select('id', { count: 'exact', head: true })

      setTotalAllTime(allTime ?? 0)
      setTotalThisMonth(monthUploads?.length ?? 0)

      if (!monthUploads || monthUploads.length === 0) {
        setContributors([])
        setLoading(false)
        return
      }

      // Aggregate client-side
      const map: Record<string, Contributor> = {}
      for (const row of monthUploads) {
        const id   = row.uploaded_by
        const u    = Array.isArray(row.uploader) ? row.uploader[0] : row.uploader
        const name = u?.full_name || 'Unknown'

        if (!map[id]) map[id] = { id, name, count: 0, thisWeek: 0, hasStreak: false }
        map[id].count++
        if (row.uploaded_at >= weekStart) {
          map[id].thisWeek++
          map[id].hasStreak = true
        }
      }

      const sorted = Object.values(map)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)

      setContributors(sorted)
    } catch (err) {
      console.error('TopContributors error:', err)
    } finally {
      setLoading(false)
    }
  }

  const maxCount = contributors[0]?.count || 1

  if (loading) return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
      <div className="h-4 bg-gray-100 rounded w-48 mb-3" />
      <div className="flex gap-3">
        {[1,2,3].map(i => <div key={i} className="flex-1 h-20 bg-gray-100 rounded-xl" />)}
      </div>
    </div>
  )

  if (contributors.length === 0) return (
    <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">📊</span>
        <div>
          <p className="text-sm font-bold text-violet-800">Resume Bank — No uploads yet this month</p>
          <p className="text-xs text-violet-500 mt-0.5">
            Be the first to contribute! Upload CVs to grow our internal talent database.
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-violet-600 to-indigo-600">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🏆</span>
          <div>
            <p className="text-sm font-bold text-white leading-none">Top Resume Bank Contributors</p>
            <p className="text-xs text-violet-200 mt-0.5">{monthLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-white font-black text-lg leading-none">{totalThisMonth}</p>
            <p className="text-violet-200 text-[10px]">CVs this month</p>
          </div>
          <div className="text-right pl-3 border-l border-violet-400">
            <p className="text-white font-black text-lg leading-none">{totalAllTime?.toLocaleString()}</p>
            <p className="text-violet-200 text-[10px]">total in bank</p>
          </div>
          <button
            onClick={() => setCollapsed(v => !v)}
            className="ml-2 text-violet-200 hover:text-white text-xs font-semibold transition"
          >
            {collapsed ? '▼ Show' : '▲ Hide'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4">
          <div className="flex gap-3">
            {contributors.map((c, i) => {
              const theme = MEDAL_COLORS[i]
              const barWidth = Math.round((c.count / maxCount) * 100)
              return (
                <div
                  key={c.id}
                  className={`flex-1 rounded-xl border-2 ${theme.bg} ${theme.border} p-3.5 relative overflow-hidden`}
                >
                  {/* Rank medal */}
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-2xl leading-none">{MEDALS[i]}</span>
                    <div className="flex flex-col items-end gap-1">
                      {c.hasStreak && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 border border-green-200 rounded-full text-[10px] font-bold">
                          🔥 Active
                        </span>
                      )}
                      {c.thisWeek > 0 && (
                        <span className="text-[10px] text-gray-400 font-medium">
                          +{c.thisWeek} this week
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Name */}
                  <p className={`font-bold text-sm leading-snug ${theme.name} truncate`}>{c.name}</p>

                  {/* Count */}
                  <p className={`text-2xl font-black mt-1 leading-none ${theme.count}`}>
                    {c.count}
                    <span className="text-xs font-semibold ml-1 opacity-70">CVs</span>
                  </p>

                  {/* Progress bar */}
                  <div className="mt-3 w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${theme.bar} transition-all duration-700`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  {/* Rank label */}
                  <p className="text-[10px] text-gray-400 mt-1.5 font-medium">
                    Rank #{i + 1} · {barWidth}% of top
                  </p>
                </div>
              )
            })}
          </div>

          {/* Motivational footer */}
          <div className="mt-3 px-3 py-2 bg-violet-50 border border-violet-100 rounded-xl flex items-center gap-2">
            <span className="text-base">💡</span>
            <p className="text-xs text-violet-700 font-medium">
              Upload CVs to the Resume Bank to grow our internal talent pipeline.
              Strong database = faster closures for everyone.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}