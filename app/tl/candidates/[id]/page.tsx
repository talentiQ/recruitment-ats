// app/tl/candidates/[id]/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import CandidateDetailView from '@/components/CandidateDetailView'
import { useParams } from 'next/navigation'

export default function TLCandidateDetailPage() {
  const params = useParams()

  return (
    <DashboardLayout>
      <CandidateDetailView 
        candidateId={params.id as string}
        userRole="team_leader"
        basePath="/tl"
      />
    </DashboardLayout>
  )
}