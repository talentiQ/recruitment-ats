// components/InterviewScheduler.tsx - COMPLETE UPDATED VERSION
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface InterviewSchedulerProps {
  candidateId: string
  candidateName: string
  jobId: string
  onScheduled: () => void
}

export default function InterviewScheduler({ 
  candidateId, 
  candidateName, 
  jobId, 
  onScheduled 
}: InterviewSchedulerProps) {
  const [formData, setFormData] = useState({
    interview_date: '',
    interview_time: '',
    interview_round: '1',
    interview_type: 'video',
    interviewer_name: '',
    interviewer_email: '',
  })
  const [scheduling, setScheduling] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setScheduling(true)

    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}')

      // Insert interview
      const { data, error } = await supabase.from('interviews').insert([{
        candidate_id: candidateId,
        job_id: jobId,
        recruiter_id: userData.id,
        interview_round: parseInt(formData.interview_round),
        interview_date: formData.interview_date,
        interview_time: formData.interview_time,
        interview_type: formData.interview_type,
        interviewer_name: formData.interviewer_name,
        interviewer_email: formData.interviewer_email,
        status: 'scheduled',
      }]).select()

      if (error) {
        console.error('Interview insert error:', error)
        throw error
      }

      // Update candidate stage
      await supabase
        .from('candidates')
        .update({ 
          current_stage: 'interview_scheduled',
          date_interview_scheduled: new Date().toISOString(),
          last_activity_date: new Date().toISOString(),
        })
        .eq('id', candidateId)

      // Add to timeline
      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidateId,
        activity_type: 'interview_scheduled',
        activity_title: 'Interview Scheduled',
        activity_description: `Round ${formData.interview_round} ${formData.interview_type} interview scheduled for ${formData.interview_date} at ${formData.interview_time}`,
        metadata: {
          interview_id: data[0].id,
          interview_round: formData.interview_round,
          interview_date: formData.interview_date,
          interview_time: formData.interview_time,
          interviewer: formData.interviewer_name,
        },
        performed_by: userData.id,
      }])

      alert('✅ Interview scheduled successfully!')
      
      // Reset form
      setFormData({
        interview_date: '',
        interview_time: '',
        interview_round: '1',
        interview_type: 'video',
        interviewer_name: '',
        interviewer_email: '',
      })
      
      onScheduled()
    } catch (error: any) {
      console.error('Full error:', error)
      alert('Error scheduling interview: ' + (error.message || 'Unknown error'))
    } finally {
      setScheduling(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Interview Date *
          </label>
          <input
            type="date"
            name="interview_date"
            value={formData.interview_date}
            onChange={handleChange}
            className="input"
            required
            min={new Date().toISOString().split('T')[0]}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Time *
          </label>
          <input
            type="time"
            name="interview_time"
            value={formData.interview_time}
            onChange={handleChange}
            className="input"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Round
          </label>
          <select
            name="interview_round"
            value={formData.interview_round}
            onChange={handleChange}
            className="input"
          >
            <option value="1">Round 1</option>
            <option value="2">Round 2</option>
            <option value="3">Round 3</option>
            <option value="4">Final Round</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Type
          </label>
          <select
            name="interview_type"
            value={formData.interview_type}
            onChange={handleChange}
            className="input"
          >
            <option value="video">Video Call</option>
            <option value="phone">Phone</option>
            <option value="in_person">In-Person</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Interviewer Name
          </label>
          <input
            type="text"
            name="interviewer_name"
            value={formData.interviewer_name}
            onChange={handleChange}
            className="input"
            placeholder="Client interviewer name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Interviewer Email
          </label>
          <input
            type="email"
            name="interviewer_email"
            value={formData.interviewer_email}
            onChange={handleChange}
            className="input"
            placeholder="interviewer@client.com"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={scheduling}
        className="btn-primary w-full"
      >
        {scheduling ? 'Scheduling...' : '📅 Schedule Interview'}
      </button>
    </form>
  )
}