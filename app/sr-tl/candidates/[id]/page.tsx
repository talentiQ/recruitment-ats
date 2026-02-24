//app/sr-tl/candidates/[id]/page.tsx
'use client'

import DashboardLayout from '@/components/DashboardLayout'
import CandidateDetailView from '@/components/CandidateDetailView'
import { useParams } from 'next/navigation'

export default function SrTLCandidateDetailPage() {
  const params = useParams()

  return (
    <DashboardLayout>
      <CandidateDetailView 
        candidateId={params.id as string}
        userRole="sr_team_leader"
        basePath="/sr-tl"
      />
    </DashboardLayout>
  )
}