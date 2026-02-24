// components/CandidateDetailView.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import InterviewScheduler from '@/components/InterviewScheduler'
import OfferForm from '@/components/OfferForm'

interface CandidateDetailViewProps {
  candidateId: string
  userRole: 'recruiter' | 'team_leader' | 'sr_team_leader'
  basePath: string
}

export default function CandidateDetailView({ 
  candidateId, 
  userRole, 
  basePath 
}: CandidateDetailViewProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [candidate, setCandidate] = useState<any>(null)
  const [timeline, setTimeline] = useState<any[]>([])
  const [updatingStage, setUpdatingStage] = useState(false)
  const [showScheduler, setShowScheduler] = useState(false)
  const [showOfferForm, setShowOfferForm] = useState(false)
  
  // For offer management
  const [existingOffers, setExistingOffers] = useState<any[]>([])
  const [activeOffer, setActiveOffer] = useState<any>(null)

  useEffect(() => {
    loadCandidate()
    loadTimeline()
    loadOffers()
  }, [candidateId])

  const loadCandidate = async () => {
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
          ),
          users:assigned_to (
            full_name,
            role
          )
        `)
        .eq('id', candidateId)
        .single()

      if (error) throw error
      if (data) {
        setCandidate(data)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadTimeline = async () => {
    try {
      const { data } = await supabase
        .from('candidate_timeline')
        .select(`
          *,
          users:performed_by (full_name)
        `)
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false })

      if (data) setTimeline(data)
    } catch (error) {
      console.error('Error loading timeline:', error)
    }
  }

  const loadOffers = async () => {
    try {
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false })

      if (error) throw error
      
      if (data && data.length > 0) {
        setExistingOffers(data)
        
        const active = data.find((offer: any) => 
          ['extended', 'accepted', 'joined'].includes(offer.status)
        )
        setActiveOffer(active || null)
      }
    } catch (error) {
      console.error('Error loading offers:', error)
    }
  }

  const handleStageUpdate = async (newStage: string) => {
    if (!candidate) return
    if (!confirm(`Update stage to "${newStage.replace(/_/g, ' ')}"?`)) return

    setUpdatingStage(true)
    try {
      const userData = localStorage.getItem('user')
      const user = userData ? JSON.parse(userData) : null

      if (newStage === 'joined') {
        const joiningDate = prompt('Enter joining date (YYYY-MM-DD):', new Date().toISOString().split('T')[0])
        
        if (!joiningDate) {
          setUpdatingStage(false)
          return
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) {
          alert('Invalid date format. Use YYYY-MM-DD')
          setUpdatingStage(false)
          return
        }

        const { data: jobData } = await supabase
          .from('jobs')
          .select('clients(replacement_guarantee_days)')
          .eq('id', candidate.job_id)
          .single()

        const clientData = Array.isArray(jobData?.clients) 
          ? jobData.clients[0] 
          : jobData?.clients
        const guaranteeDays = clientData?.replacement_guarantee_days || 90
        
        const guaranteeEnds = new Date(joiningDate)
        guaranteeEnds.setDate(guaranteeEnds.getDate() + guaranteeDays)

        const fixedCTC = candidate.fixed_ctc || candidate.expected_ctc || 0
        const feePercentage = 8.33 // Default fee percentage
        const revenue = (fixedCTC * feePercentage) / 100
        const revenueMonth = joiningDate.slice(0, 7)
        const revenueYear = parseInt(joiningDate.slice(0, 4))

        const { error: updateError } = await supabase
          .from('candidates')
          .update({
            current_stage: 'joined',
            date_joined: joiningDate,
            revenue_earned: revenue,
            revenue_month: revenueMonth,
            revenue_year: revenueYear,
            guarantee_period_ends: guaranteeEnds.toISOString().split('T')[0],
            is_placement_safe: false,
            placement_status: 'monitoring',
            last_activity_date: new Date().toISOString(),
          })
          .eq('id', candidate.id)

        if (updateError) throw updateError

        await supabase.from('placement_safety_tracker').insert([{
          candidate_id: candidate.id,
          recruiter_id: candidate.assigned_to,
          client_id: candidate.jobs?.client_id,
          joining_date: joiningDate,
          guarantee_period_days: guaranteeDays,
          guarantee_period_ends: guaranteeEnds.toISOString().split('T')[0],
          days_remaining: guaranteeDays,
          safety_status: 'monitoring',
        }])

        await supabase.from('candidate_timeline').insert([{
          candidate_id: candidate.id,
          activity_type: 'candidate_joined',
          activity_title: 'Candidate Joined (Manual)',
          activity_description: `Manually marked as joined on ${new Date(joiningDate).toLocaleDateString()}. Fee: ${feePercentage}%. Revenue: Rs.${revenue.toFixed(2)}L`,
          performed_by: user?.id,
        }])

        alert(`Candidate marked as joined!\n\nRevenue: Rs.${revenue.toFixed(2)}L\nRevenue Month: ${revenueMonth}`)

      } else {
        const { error: updateError } = await supabase
          .from('candidates')
          .update({
            current_stage: newStage,
            last_activity_date: new Date().toISOString(),
          })
          .eq('id', candidate.id)

        if (updateError) throw updateError

        let offerStatus: string | null = null

        switch (newStage) {
          case 'offer_extended':
            offerStatus = 'extended'
            break
          case 'offer_accepted':
            offerStatus = 'accepted'
            break
          case 'rejected':
            offerStatus = 'rejected'
            break
          case 'dropped':
            offerStatus = 'renege'
            break
        }

        if (offerStatus) {
          const { data: existingOffer } = await supabase
            .from('offers')
            .select('id, status')
            .eq('candidate_id', candidate.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (existingOffer) {
            await supabase
              .from('offers')
              .update({ status: offerStatus })
              .eq('id', existingOffer.id)
          }
        }

        await supabase.from('candidate_timeline').insert([{
          candidate_id: candidate.id,
          activity_type: 'stage_change',
          activity_title: 'Stage Updated',
          activity_description: `Stage changed to: ${newStage.replace(/_/g, ' ')}`,
          performed_by: user?.id,
        }])

        alert('Stage updated successfully!')
      }

      loadCandidate()
      loadTimeline()
      loadOffers()

    } catch (error: any) {
      console.error('Stage update error:', error)
      alert('Error updating stage: ' + (error.message || 'Unknown error'))
    } finally {
      setUpdatingStage(false)
    }
  }

  const handleMarkAsJoined = async () => {
    if (!activeOffer || !candidate) return
    
    const joiningDate = prompt('Enter joining date (YYYY-MM-DD):', new Date().toISOString().split('T')[0])
    
    if (!joiningDate) return
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) {
      alert('Invalid date format. Please use YYYY-MM-DD')
      return
    }
    
    const confirmed = window.confirm(
      `Mark ${candidate.full_name} as joined?\n\n` +
      `Joining Date: ${new Date(joiningDate).toLocaleDateString()}\n` +
      `Client: ${candidate.jobs?.clients?.company_name}\n` +
      `Billable CTC: Rs. ${(activeOffer.billable_ctc / 100000).toFixed(2)}L\n` +
      `Fee: ${activeOffer.revenue_percentage || 8.33}%\n` +
      `Revenue: Rs. ${((activeOffer.billable_ctc * (activeOffer.revenue_percentage || 8.33) / 100) / 100000).toFixed(2)}L`
    )
    
    if (!confirmed) return
    
    setUpdatingStage(true)
    
    try {
      const userData = localStorage.getItem('user')
      const user = userData ? JSON.parse(userData) : null
      
      // Use offer's revenue percentage or default to 8.33%
      const feePercentage = activeOffer.revenue_percentage || 8.33
      const revenue = (activeOffer.billable_ctc * feePercentage) / 100 / 100000
      const revenueMonth = joiningDate.slice(0, 7)
      const revenueYear = parseInt(joiningDate.slice(0, 4))
      
      const { data: jobData } = await supabase
        .from('jobs')
        .select('clients(replacement_guarantee_days)')
        .eq('id', candidate.job_id)
        .single()

      const clientData = Array.isArray(jobData?.clients) 
        ? jobData.clients[0] 
        : jobData?.clients
      const guaranteeDays = clientData?.replacement_guarantee_days || 90
      
      const guaranteeEnds = new Date(joiningDate)
      guaranteeEnds.setDate(guaranteeEnds.getDate() + guaranteeDays)
      
      const { error: offerError } = await supabase
        .from('offers')
        .update({
          status: 'joined',
          actual_joining_date: joiningDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeOffer.id)
      
      if (offerError) throw offerError
      
      const { error: candidateError } = await supabase
        .from('candidates')
        .update({
          current_stage: 'joined',
          date_joined: joiningDate,
          billable_ctc: activeOffer.billable_ctc,
          revenue_earned: revenue,
          revenue_month: revenueMonth,
          revenue_year: revenueYear,
          guarantee_period_ends: guaranteeEnds.toISOString().split('T')[0],
          is_placement_safe: false,
          placement_status: 'monitoring',
          last_activity_date: new Date().toISOString(),
        })
        .eq('id', candidate.id)
      
      if (candidateError) throw candidateError
      
      await supabase.from('placement_safety_tracker').insert([{
        candidate_id: candidate.id,
        recruiter_id: candidate.assigned_to,
        client_id: candidate.jobs?.client_id,
        joining_date: joiningDate,
        guarantee_period_days: guaranteeDays,
        guarantee_period_ends: guaranteeEnds.toISOString().split('T')[0],
        days_remaining: guaranteeDays,
        safety_status: 'monitoring',
      }])
      
      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidate.id,
        activity_type: 'candidate_joined',
        activity_title: 'Candidate Joined',
        activity_description: `Marked as joined on ${new Date(joiningDate).toLocaleDateString()}. Fee: ${feePercentage}%. Revenue: Rs. ${revenue.toFixed(2)}L`,
        performed_by: user?.id,
      }])
      
      alert(
        `✓ Successfully marked as joined!\n\n` +
        `Revenue Earned: Rs. ${revenue.toFixed(2)}L\n` +
        `Revenue Month: ${revenueMonth}\n` +
        `Guarantee Period: ${guaranteeDays} days`
      )
      
      await Promise.all([
        loadCandidate(),
        loadTimeline(),
        loadOffers()
      ])
      
    } catch (error: any) {
      console.error('Error marking as joined:', error)
      alert(`Error: ${error.message || 'Failed to mark as joined'}`)
    } finally {
      setUpdatingStage(false)
    }
  }

  const handleRenege = async () => {
    if (!candidate) return
    
    const reason = prompt('Enter reason for renege:')
    if (!reason) return
    
    const confirmed = window.confirm(
      `Mark ${candidate.full_name} as reneged?\n\n` +
      `This will:\n` +
      `- Update status to "Dropped"\n` +
      `- Reverse revenue if within guarantee period\n` +
      `- Record renege reason\n\n` +
      `Continue?`
    )
    
    if (!confirmed) return
    
    setUpdatingStage(true)
    
    try {
      const userData = localStorage.getItem('user')
      const user = userData ? JSON.parse(userData) : null
      
      const withinGuarantee = candidate.guarantee_period_ends 
        ? new Date() <= new Date(candidate.guarantee_period_ends)
        : false
      
      const { error: candidateError } = await supabase
        .from('candidates')
        .update({
          current_stage: 'dropped',
          placement_status: 'renege',
          renege_reason: reason,
          renege_date: new Date().toISOString().split('T')[0],
          revenue_earned: withinGuarantee ? 0 : candidate.revenue_earned,
          last_activity_date: new Date().toISOString(),
        })
        .eq('id', candidate.id)
      
      if (candidateError) throw candidateError
      
      if (activeOffer) {
        await supabase
          .from('offers')
          .update({ 
            status: 'renege',
            updated_at: new Date().toISOString()
          })
          .eq('id', activeOffer.id)
      }
      
      await supabase
        .from('placement_safety_tracker')
        .update({
          safety_status: 'renege',
          renege_date: new Date().toISOString().split('T')[0],
          renege_reason: reason,
        })
        .eq('candidate_id', candidate.id)
      
      await supabase.from('candidate_timeline').insert([{
        candidate_id: candidate.id,
        activity_type: 'renege',
        activity_title: 'Candidate Reneged',
        activity_description: `Marked as reneged. Reason: ${reason}${withinGuarantee ? ' (Revenue reversed)' : ''}`,
        performed_by: user?.id,
      }])
      
      alert(
        `✓ Candidate marked as reneged!\n\n` +
        `Status: Dropped\n` +
        (withinGuarantee ? 'Revenue: Reversed to Rs. 0\n' : '') +
        `Reason: ${reason}`
      )
      
      await Promise.all([
        loadCandidate(),
        loadTimeline(),
        loadOffers()
      ])
      
    } catch (error: any) {
      console.error('Error marking as renege:', error)
      alert(`Error: ${error.message || 'Failed to mark as renege'}`)
    } finally {
      setUpdatingStage(false)
    }
  }

  const canCreateOffer = () => {
    // Check if stage is interview_completed
    if (candidate?.current_stage !== 'interview_completed') return false
    
    // Check if there's already an active offer
    if (activeOffer) return false
    
    // TL and Sr.TL can create offers
    return ['team_leader', 'sr_team_leader'].includes(userRole)
  }

  const canEditOffer = () => {
    // Only Sr.TL can edit offers
    return userRole === 'sr_team_leader' && activeOffer
  }

  const renderOfferButtons = () => {
    // If showing offer form, don't show buttons
    if (showOfferForm) return null

    // If there's an active offer
    if (activeOffer) {
      if (activeOffer.status === 'extended') {
        return (
          <>
            {canEditOffer() && (
              <button
                onClick={() => setShowOfferForm(true)}
                className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium"
              >
                Edit Offer
              </button>
            )}
          </>
        )
      }

      if (activeOffer.status === 'accepted') {
        return (
          <>
            <button
              onClick={handleMarkAsJoined}
              disabled={updatingStage}
              className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
            >
              {updatingStage ? 'Processing...' : 'Mark as Joined'}
            </button>
            <button
              onClick={handleRenege}
              disabled={updatingStage}
              className="mt-6 bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 font-medium disabled:opacity-50"
            >
              Renege
            </button>
          </>
        )
      }

      if (activeOffer.status === 'joined') {
        return (
          <>
            <div className="mt-6 px-6 py-2 bg-green-100 text-green-800 rounded-lg font-semibold inline-flex items-center gap-2">
              <span className="text-green-600">✓</span>
              Joined on {activeOffer.actual_joining_date ? new Date(activeOffer.actual_joining_date).toLocaleDateString() : 'N/A'}
            </div>
            {candidate.guarantee_period_ends && new Date() <= new Date(candidate.guarantee_period_ends) && (
              <button
                onClick={handleRenege}
                disabled={updatingStage}
                className="mt-6 bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 font-medium disabled:opacity-50"
              >
                Mark as Renege
              </button>
            )}
          </>
        )
      }
    }

    // If no active offer and can create
    if (canCreateOffer()) {
      return (
        <button
          onClick={() => setShowOfferForm(true)}
          className="mt-6 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-medium"
        >
          Create Offer
        </button>
      )
    }

    return null
  }

  const handleOfferSuccess = async () => {
    setShowOfferForm(false)
    await Promise.all([
      loadCandidate(),
      loadTimeline(),
      loadOffers()
    ])
  }

  const handleViewResume = async () => {
    if (!candidate.resume_url) {
      alert('No resume uploaded for this candidate')
      return
    }

    try {
      if (candidate.resume_url.includes('supabase')) {
        let filePath = ''
        
        if (candidate.resume_url.includes('/resumes/')) {
          const urlParts = candidate.resume_url.split('/resumes/')
          filePath = urlParts.length > 1 ? decodeURIComponent(urlParts[1]) : ''
        } else if (candidate.resume_url.includes('/object/public/resumes/')) {
          const urlParts = candidate.resume_url.split('/object/public/resumes/')
          filePath = urlParts.length > 1 ? decodeURIComponent(urlParts[1]) : ''
        }

        if (!filePath) throw new Error('Could not extract file path from URL')

        const { data, error } = await supabase.storage
          .from('resumes')
          .createSignedUrl(filePath, 3600)

        if (error) throw error
        window.open(data.signedUrl, '_blank')
      } else {
        window.open(candidate.resume_url, '_blank')
      }
    } catch (error: any) {
      console.error('View error:', error)
      alert('Error viewing resume: ' + error.message)
    }
  }

  const handleDownloadResume = async () => {
    if (!candidate.resume_url) {
      alert('No resume uploaded for this candidate')
      return
    }

    try {
      if (candidate.resume_url.includes('supabase')) {
        let filePath = ''
        
        if (candidate.resume_url.includes('/resumes/')) {
          const urlParts = candidate.resume_url.split('/resumes/')
          filePath = urlParts.length > 1 ? decodeURIComponent(urlParts[1]) : ''
        } else if (candidate.resume_url.includes('/object/public/resumes/')) {
          const urlParts = candidate.resume_url.split('/object/public/resumes/')
          filePath = urlParts.length > 1 ? decodeURIComponent(urlParts[1]) : ''
        }

        if (!filePath) throw new Error('Could not extract file path from URL')

        const { data, error } = await supabase.storage
          .from('resumes')
          .download(filePath)

        if (error) throw new Error('Resume file not found in storage')

        const url = URL.createObjectURL(data)
        const a = document.createElement('a')
        a.href = url
        a.download = candidate.resume_file_name || `Resume_${candidate.full_name}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } else {
        window.open(candidate.resume_url, '_blank')
      }
    } catch (error: any) {
      console.error('Download error:', error)
      alert('Error downloading resume: ' + error.message)
      window.open(candidate.resume_url, '_blank')
    }
  }

  const getTimelineIcon = (type: string) => {
    const iconMap: { [key: string]: { color: string; symbol: string } } = {
      candidate_created: { color: 'bg-blue-500', symbol: '+' },
      stage_change: { color: 'bg-yellow-500', symbol: '→' },
      interview_scheduled: { color: 'bg-purple-500', symbol: 'I' },
      offer_extended: { color: 'bg-green-500', symbol: '$' },
      candidate_joined: { color: 'bg-teal-500', symbol: 'J' },
      renege: { color: 'bg-red-500', symbol: 'R' },
    }
    
    const config = iconMap[type] || { color: 'bg-gray-400', symbol: '•' }
    
    return (
      <div className={`w-8 h-8 rounded-full ${config.color} flex items-center justify-center text-white font-bold flex-shrink-0`}>
        {config.symbol}
      </div>
    )
  }

  // Check if interview scheduler should be disabled
  const isInterviewDisabled = () => {
    return ['offer_accepted', 'offer_extended', 'joined', 'dropped', 'rejected'].includes(candidate?.current_stage || '')
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
      <div className="card text-center py-12">
        <p className="text-gray-600">Candidate not found</p>
        <button onClick={() => router.back()} className="mt-4 btn-primary">
          Go Back
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-900">
            ← Back to List
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{candidate.full_name}</h2>
            <p className="text-gray-600">{candidate.current_designation || 'Candidate'}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Sourced on</div>
          <div className="font-medium text-gray-900">
            {new Date(candidate.date_sourced || candidate.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Offer Form (Embedded) */}
      {showOfferForm && (
        <div className="card bg-blue-50 border-2 border-blue-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-blue-900">
              {activeOffer ? 'Edit Offer' : 'Create Offer'}
            </h3>
            <button
              onClick={() => setShowOfferForm(false)}
              className="text-blue-600 hover:text-blue-900 font-medium"
            >
              ✕ Close
            </button>
          </div>
          <OfferForm
            candidateId={candidateId}
            candidate={candidate}
            existingOffer={activeOffer}
            isEditMode={!!activeOffer}
            onSuccess={handleOfferSuccess}
            onCancel={() => setShowOfferForm(false)}
          />
        </div>
      )}

      {/* Update Stage & Actions */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Update Pipeline Stage</h3>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Stage
            </label>
            <select
              value={candidate.current_stage}
              onChange={(e) => handleStageUpdate(e.target.value)}
              disabled={updatingStage}
              className="input"
            >
              <option value="sourced">Sourced</option>
              <option value="screening">Screening</option>
              <option value="interview_scheduled">Interview Scheduled</option>
              <option value="interview_completed">Interview Completed</option>
              <option value="offer_extended">Offer Extended</option>
              <option value="offer_accepted">Offer Accepted</option>
              <option value="documentation">Documentation</option>
              <option value="joined">Joined</option>
              <option value="rejected">Rejected</option>
              <option value="on_hold">On Hold</option>
            </select>
          </div>

          <button
            onClick={() => setShowScheduler(true)}
            disabled={isInterviewDisabled()}
            className={`mt-6 px-6 py-2 rounded-lg font-medium ${
              isInterviewDisabled()
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
            title={isInterviewDisabled() ? 'Interview scheduling disabled for this stage' : 'Schedule Interview'}
          >
            Schedule Interview
          </button>

          {renderOfferButtons()}

          {existingOffers.length > 0 && !showOfferForm && (
            <button
              onClick={() => router.push(`${basePath}/offers?candidate=${candidate.id}`)}
              className="mt-6 bg-yellow-600 text-white px-6 py-2 rounded-lg hover:bg-yellow-700 font-medium"
            >
              View All Offers ({existingOffers.length})
            </button>
          )}

          <button
            onClick={() => router.push(`${basePath}/candidates/${candidate.id}/edit`)}
            className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium"
          >
            Edit Details
          </button>
        </div>
      </div>

      {/* Contact Information */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500">Email</label>
            <p className="font-medium">{candidate.email || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Phone</label>
            <p className="font-medium">{candidate.phone}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Source</label>
            <p className="font-medium">{candidate.source_portal || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Location</label>
            <p className="font-medium">{candidate.current_location || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Professional Details */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Professional Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500">Current Company</label>
            <p className="font-medium">{candidate.current_company || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Current Designation</label>
            <p className="font-medium">{candidate.current_designation || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Total Experience</label>
            <p className="font-medium">{candidate.total_experience || 0} years</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Relevant Experience</label>
            <p className="font-medium">{candidate.relevant_experience || 0} years</p>
          </div>
        </div>
      </div>

      {/* Compensation */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Compensation</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-gray-500">Current CTC</label>
            <p className="font-medium text-blue-600 text-xl">Rs.{candidate.current_ctc || 0}L</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Expected CTC</label>
            <p className="font-medium text-green-600 text-xl">Rs.{candidate.expected_ctc || 0}L</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Notice Period</label>
            <p className="font-medium">{candidate.notice_period || 0} days</p>
          </div>
        </div>
      </div>

      {/* Job Details */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Job Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500">Position</label>
            <p className="font-medium">{candidate.jobs?.job_title || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Job Code</label>
            <p className="font-medium">{candidate.jobs?.job_code || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Client</label>
            <p className="font-medium">{candidate.jobs?.clients?.company_name || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Added By (Revenue Credit)</label>
            <p className="font-medium text-green-600">{candidate.users?.full_name || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Skills */}
      {candidate.key_skills && candidate.key_skills.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Skills</h3>
          <div className="flex flex-wrap gap-2">
            {candidate.key_skills.map((skill: string, index: number) => (
              <span
                key={index}
                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Resume */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Resume / CV</h3>
        {candidate.resume_url ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-bold text-lg">D</span>
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {candidate.resume_file_name || `Resume_${candidate.full_name}.pdf`}
                </p>
                <p className="text-sm text-gray-500">
                  Uploaded on {new Date(candidate.resume_uploaded_at || candidate.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleViewResume}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  View
                </button>
                <button
                  onClick={handleDownloadResume}
                  className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No resume uploaded</p>
        )}
      </div>

      {/* Timeline */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Timeline</h3>
        {timeline.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No activity yet</p>
        ) : (
          <div className="space-y-4">
            {timeline.map((activity) => (
              <div key={activity.id} className="flex gap-4 p-3 bg-gray-50 rounded-lg">
                {getTimelineIcon(activity.activity_type)}
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{activity.activity_title}</div>
                  <p className="text-sm text-gray-600 mt-1">{activity.activity_description}</p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{new Date(activity.created_at).toLocaleDateString()}</div>
                  <div>{activity.users?.full_name || 'System'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interview Scheduler Modal */}
      {showScheduler && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {candidate.job_id ? (
              <div className="p-6">
                <InterviewScheduler
                  candidateId={candidate.id}
                  candidateName={candidate.full_name}
                  jobId={candidate.job_id}
                  onScheduled={() => {
                    setShowScheduler(false)
                    loadCandidate()
                    loadTimeline()
                  }}
                  onCancel={() => setShowScheduler(false)}
                />
              </div>
            ) : (
              <div className="p-6">
                <h3 className="text-lg font-semibold text-red-900 mb-4">Cannot Schedule Interview</h3>
                <p className="text-gray-700 mb-6">
                  This candidate doesn&apos;t have an assigned job. Please assign them to a job first.
                </p>
                <button
                  onClick={() => setShowScheduler(false)}
                  className="btn-primary w-full"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
