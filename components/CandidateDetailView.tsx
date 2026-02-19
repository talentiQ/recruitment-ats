// components/CandidateDetailView.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import InterviewScheduler from '@/components/InterviewScheduler'

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

  useEffect(() => {
    loadCandidate()
    loadTimeline()
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
            clients (company_name)
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

  const handleStageUpdate = async (newStage: string) => {
    if (!candidate) return
    if (!confirm(`Update stage to "${newStage.replace(/_/g, ' ')}"?`)) return

    setUpdatingStage(true)
    try {
      const userData = localStorage.getItem('user')
      const user = userData ? JSON.parse(userData) : null

      // Special handling for 'joined' stage
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

        const guaranteeDays = jobData?.clients?.[0]?.replacement_guarantee_days || 90
        const guaranteeEnds = new Date(joiningDate)
        guaranteeEnds.setDate(guaranteeEnds.getDate() + guaranteeDays)

        const fixedCTC = candidate.fixed_ctc || candidate.expected_ctc || 0
        const revenue = fixedCTC * 0.0833
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
          activity_description: `Manually marked as joined on ${new Date(joiningDate).toLocaleDateString()}. Revenue: Rs.${revenue.toFixed(2)}L`,
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

        const stageToOfferStatus: { [key: string]: string } = {
          'offer_extended': 'extended',
          'offer_accepted': 'accepted',
          'rejected': 'rejected',
          'dropped': 'renege',
        }

        if (stageToOfferStatus[newStage]) {
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
              .update({ status: stageToOfferStatus[newStage] })
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

    } catch (error: any) {
      console.error('Stage update error:', error)
      alert('Error updating stage: ' + (error.message || 'Unknown error'))
    } finally {
      setUpdatingStage(false)
    }
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
    }
    
    const config = iconMap[type] || { color: 'bg-gray-400', symbol: '•' }
    
    return (
      <div className={`w-8 h-8 rounded-full ${config.color} flex items-center justify-center text-white font-bold flex-shrink-0`}>
        {config.symbol}
      </div>
    )
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

          {/* Schedule Interview Button */}
          <button
            onClick={() => setShowScheduler(true)}
            className="mt-6 bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 font-medium"
          >Schedule Interview
          </button>

          {/* Create Offer Button */}
          {candidate.current_stage !== 'sourced' &&
           candidate.current_stage !== 'screening' &&
           candidate.current_stage !== 'joined' &&
           candidate.current_stage !== 'dropped' &&
           candidate.current_stage !== 'rejected' &&
           candidate.current_stage !== 'on_hold' && (
            <button
              onClick={() => router.push(`${basePath}/offers/create?candidate=${candidate.id}`)}
              className="mt-6 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-medium"
            >
            Create Offer
            </button>
          )}

          {/* View Offers Button */}
          {(candidate.current_stage === 'offer_extended' ||
            candidate.current_stage === 'offer_accepted' ||
            candidate.current_stage === 'documentation' ||
            candidate.current_stage === 'joined' ||
            candidate.current_stage === 'dropped') && (
            <button
              onClick={() => router.push(`${basePath}/offers?candidate=${candidate.id}`)}
              className="mt-6 bg-yellow-600 text-white px-6 py-2 rounded-lg hover:bg-yellow-700 font-medium"
            >
            View Offers
            </button>
          )}

          {/* Edit Details Button */}
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
            <label className="text-sm text-gray-500">Added By</label>
            <p className="font-medium">{candidate.users?.full_name || 'N/A'}</p>
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
