// app/recruiter/jobs/[id]/add-candidate/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import AddCandidateForm from '@/components/AddCandidateForm'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function RecruiterJobAddCandidatePage() {
  const params = useParams()
  const router = useRouter()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      loadJob(params.id as string)
    }
  }, [params.id])

  const loadJob = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          clients (
            company_name
          )
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setJob(data)
    } catch (error) {
      console.error('Error:', error)
      alert('Job not found')
      router.push('/recruiter/jobs')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  if (!job) {
    return null
  }

  return (
    <DashboardLayout>
      {/* Job Context Banner */}
      <div className="max-w-4xl mx-auto mb-6 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
        <div className="text-center">
          <div className="flex items-center gap-3 justify-center mb-2">
            <span className="font-mono font-bold text-blue-900 text-lg">
              {job.job_code}
            </span>
            <span className="text-gray-400">•</span>
            <h3 className="text-lg font-bold text-gray-900">
              {job.job_title}
            </h3>
          </div>
          <div className="flex items-center gap-4 justify-center text-sm text-gray-600">
            <span>📍 {job.location}</span>
            <span>🏢 {job.clients?.company_name}</span>
            <span>💰 ₹{job.min_ctc}-{job.max_ctc}L</span>
          </div>
        </div>
      </div>

      <AddCandidateForm 
        userRole="recruiter" 
        redirectPath="/recruiter/candidates"
        preSelectedJobId={job.id}
      />
    </DashboardLayout>
  )
}