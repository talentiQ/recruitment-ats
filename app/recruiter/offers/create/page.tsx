'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import OfferForm from '@/components/OfferForm'
import { supabase } from '@/lib/supabase'

function CreateOfferContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [candidate, setCandidate] = useState<any>(null)
  const [loading, setLoading] = useState(true)
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
      setCandidate(data)
    } catch (error) {
      console.error('Error loading candidate:', error)
      alert('Candidate not found')
      router.push('/recruiter/offers')
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

  if (!candidate) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Candidate not found</p>
        <button onClick={() => router.back()} className="mt-4 btn-primary">
          Go Back
        </button>
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
          For {candidate.full_name}
        </p>
      </div>

      <OfferForm 
        candidateId={candidate.id}
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
        <CreateOfferContent />
      </Suspense>
    </DashboardLayout>
  )
}