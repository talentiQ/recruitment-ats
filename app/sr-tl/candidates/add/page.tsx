'use client'

import DashboardLayout from '@/components/DashboardLayout'
import AddCandidateForm from '@/components/AddCandidateForm'

export default function SrTLAddCandidatePage() {
  return (
    <DashboardLayout>
      <AddCandidateForm 
        userRole="sr_team_leader" 
        redirectPath="/sr-tl/candidates"
      />
    </DashboardLayout>
  )
}