// components/SubmitToClient.tsx - COMPLETE UPDATED VERSION
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface SubmitToClientProps {
  candidateId: string
  jobId: string
  candidateName: string
  onSubmitted: () => void
}

export default function SubmitToClient({ 
  candidateId, 
  jobId, 
  candidateName, 
  onSubmitted 
}: SubmitToClientProps) {
  const [clients, setClients] = useState<any[]>([])
  const [formData, setFormData] = useState({
    client_id: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, company_name')
      .eq('status', 'active')
      .order('company_name')

    if (data) setClients(data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}')

      // Record submission
      const { data, error } = await supabase.from('client_submissions').insert([{
        candidate_id: candidateId,
        job_id: jobId,
        client_id: formData.client_id,
        submitted_by: userData.id,
        notes: formData.notes,
        submission_status: 'submitted',
      }]).select()

      if (error) {
        console.error('Submission error:', error)
        throw error
      }

      // Add to timeline
      const client = clients.find(c => c.id === formData.client_id)
      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidateId,
        activity_type: 'submitted_to_client',
        activity_title: 'CV Submitted to Client',
        activity_description: `Resume submitted to ${client?.company_name}`,
        metadata: {
          client_id: formData.client_id,
          client_name: client?.company_name,
          submission_id: data[0].id,
          submission_date: new Date().toISOString(),
        },
        performed_by: userData.id,
      }])

      // Update candidate last activity
      await supabase
        .from('candidates')
        .update({ last_activity_date: new Date().toISOString() })
        .eq('id', candidateId)

      alert('✅ CV submitted to client successfully!')
      
      // Reset form
      setFormData({
        client_id: '',
        notes: '',
      })
      
      onSubmitted()
    } catch (error: any) {
      console.error('Full error:', error)
      alert('Error submitting to client: ' + (error.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Client *
        </label>
        <select
          name="client_id"
          value={formData.client_id}
          onChange={handleChange}
          className="input"
          required
        >
          <option value="">Choose client...</option>
          {clients.map(client => (
            <option key={client.id} value={client.id}>
              {client.company_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Notes
        </label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          className="input"
          placeholder="Add any notes for the client submission..."
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary w-full"
      >
        {submitting ? 'Submitting...' : '📧 Submit to Client'}
      </button>
    </form>
  )
}