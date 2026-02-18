'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import OfferForm from '@/components/OfferForm'
import { supabase } from '@/lib/supabase'

type Client = {
  id: string
  company_name?: string
  replacement_guarantee_days?: number
}

type Job = {
  id: string
  job_title?: string
  job_code?: string
  client_id?: string
  clients?: Client
}

type Candidate = {
  id: string
  full_name?: string
  expected_ctc?: number
  notice_period?: number
  job_id?: string
  jobs?: Job
  current_stage?: string
}

function OfferCreateContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const candidateId = searchParams.get('candidate')

  useEffect(() => {
    if (candidateId) {
      loadCandidate(candidateId)
    } else {
      setLoading(false)
    }
  }, [candidateId])

  const loadCandidate = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select(`
          *,
          jobs (
            id,
            job_title,
            job_code,
            client_id,
            clients (
              id,
              company_name,
              replacement_guarantee_days
            )
          )
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setCandidate(data as Candidate)
    } catch (err: unknown) {
      console.error('Error loading candidate:', err)
      setError('Candidate not found')
      // short delay then navigate back
      setTimeout(() => router.push('/recruiter/offers'), 1200)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-600 hover:text-gray-900 mb-2"
        >
          ← Back
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Create Offer</h2>
        <p className="text-gray-600">
          {candidate ? `For ${candidate.full_name}` : 'Create a new offer'}
        </p>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      <OfferForm 
        candidate={candidate}
        candidateId={candidateId ?? undefined}
        onSuccess={() => router.push('/recruiter/offers')}
        onCancel={() => router.back()}
      />
    </div>
  )
}

export default function RecruiterOfferCreatePage() {
  return (
    <DashboardLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      }>
        <OfferCreateContent />
      </Suspense>
    </DashboardLayout>
  )
}