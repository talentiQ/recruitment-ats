// components/CandidateTimeline.tsx
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface TimelineItem {
  id: string
  activity_type: string
  activity_title: string
  activity_description: string
  metadata: any
  created_at: string
  performed_by: {
    full_name: string
  }
}

interface CandidateTimelineProps {
  candidateId: string
}

export default function CandidateTimeline({ candidateId }: CandidateTimelineProps) {
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTimeline()
  }, [candidateId])

  const loadTimeline = async () => {
    try {
      const { data, error } = await supabase
        .from('candidate_timeline')
        .select(`
          *,
          performed_by:users!candidate_timeline_performed_by_fkey (
            full_name
          )
        `)
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setTimeline(data || [])
    } catch (error) {
      console.error('Error loading timeline:', error)
    } finally {
      setLoading(false)
    }
  }

  const getActivityIcon = (type: string) => {
    const iconMap: { [key: string]: { color: string; symbol: string } } = {
      resume_uploaded: { color: 'bg-gray-500', symbol: 'D' },
      candidate_created: { color: 'bg-blue-500', symbol: '+' },
      stage_changed: { color: 'bg-yellow-500', symbol: '→' },
      submitted_to_client: { color: 'bg-purple-500', symbol: 'S' },
      interview_scheduled: { color: 'bg-indigo-500', symbol: 'I' },
      interview_completed: { color: 'bg-green-500', symbol: '✓' },
      interview_feedback: { color: 'bg-teal-500', symbol: 'F' },
      offer_made: { color: 'bg-emerald-500', symbol: '$' },
      offer_accepted: { color: 'bg-lime-500', symbol: '✓' },
      joined: { color: 'bg-cyan-500', symbol: 'J' },
      note_added: { color: 'bg-amber-500', symbol: 'N' },
      reassigned: { color: 'bg-pink-500', symbol: 'R' },
      duplicate_detected: { color: 'bg-red-500', symbol: '!' },
    }
    
    const config = iconMap[type] || { color: 'bg-gray-400', symbol: '•' }
    
    return (
      <div className={`w-10 h-10 rounded-full ${config.color} flex items-center justify-center text-white font-bold flex-shrink-0`}>
        {config.symbol}
      </div>
    )
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (timeline.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No activity history yet
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {timeline.map((item, index) => (
        <div key={item.id} className="flex gap-4">
          {/* Timeline line */}
          <div className="flex flex-col items-center">
            {getActivityIcon(item.activity_type)}
            {index < timeline.length - 1 && (
              <div className="w-0.5 flex-1 bg-gray-200 mt-2"></div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-semibold text-gray-900">{item.activity_title}</h4>
                <span className="text-xs text-gray-500">{formatDate(item.created_at)}</span>
              </div>
              
              {item.activity_description && (
                <p className="text-sm text-gray-700 mb-2">{item.activity_description}</p>
              )}

              {/* Metadata */}
              {item.metadata && Object.keys(item.metadata).length > 0 && (
                <div className="mt-3 p-2 bg-gray-50 rounded text-xs space-y-1">
                  {Object.entries(item.metadata).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-600 capitalize">
                        {key.replace(/_/g, ' ')}:
                      </span>
                      <span className="text-gray-900 font-medium">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Performed by */}
              <div className="mt-3 text-xs text-gray-500">
                by {item.performed_by?.full_name || 'System'}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
