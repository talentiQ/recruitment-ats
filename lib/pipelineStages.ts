// lib/pipelineStages.ts
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for all candidate pipeline stages.
// Import this file in every page, component, and utility that references stages.
//
// Usage:
//   import { PIPELINE_STAGES, STAGE_LABEL, STAGE_BADGE, isRejectedStage, isActiveStage } from '@/lib/pipelineStages'
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Ordered stage values ───────────────────────────────────────────────────

export const PIPELINE_STAGES = [
  'sourced',              // CV Sourced
  'screening',            // Sent to client
  'screening_rejected',   // CV Rejected by client
  'interview_scheduled',  // Interview Scheduled
  'interview_completed',  // All interviews done — Selected
  'interview_rejected',   // Interview Rejected
  'documentation',        // Client asked for docs before offer
  'offer_extended',       // Offer Extended
  'offer_accepted',       // Offer Accepted by candidate
  'offer_rejected',       // Offer Rejected by candidate
  'joined',               // Joined
  'renege',               // Left after joining
  'on_hold',              // Candidate on hold after interview
] as const

// Derive the union type automatically — use this for typing stage values
export type PipelineStage = typeof PIPELINE_STAGES[number]

// ── 2. Human-readable labels ──────────────────────────────────────────────────

export const STAGE_LABEL: Record<PipelineStage, string> = {
  sourced:              'CV Sourced',
  screening:            'Sent to Client',
  screening_rejected:   'CV Rejected by Client',
  interview_scheduled:  'Interview Scheduled',
  interview_completed:  'Interview Completed',
  interview_rejected:   'Interview Rejected',
  documentation:        'Documentation',
  offer_extended:       'Offer Extended',
  offer_accepted:       'Offer Accepted',
  offer_rejected:       'Offer Rejected',
  joined:               'Joined',
  renege:               'Renege',
  on_hold:              'On Hold / Dropped',
}

// ── 3. Tailwind badge classes (bg + text colour) ──────────────────────────────

export const STAGE_BADGE: Record<PipelineStage, string> = {
  sourced:              'bg-gray-100 text-gray-700',
  screening:            'bg-yellow-100 text-yellow-800',
  screening_rejected:   'bg-orange-100 text-orange-800',
  interview_scheduled:  'bg-blue-100 text-blue-800',
  interview_completed:  'bg-purple-100 text-purple-800',
  interview_rejected:   'bg-red-200 text-red-800',
  documentation:        'bg-cyan-100 text-cyan-800',
  offer_extended:       'bg-indigo-100 text-indigo-800',
  offer_accepted:       'bg-green-100 text-green-800',
  offer_rejected:       'bg-rose-100 text-rose-800',
  joined:               'bg-green-600 text-white',
  renege:               'bg-orange-200 text-orange-900',
  on_hold:              'bg-gray-200 text-gray-600',
}

/** Stages that are set automatically by modules — not manually selectable */
export const LOCKED_STAGES: PipelineStage[] = [
  'interview_scheduled',
  'interview_completed',
  'interview_rejected',
  'documentation',
  'offer_extended',
  'offer_accepted',
  'offer_rejected',
  'joined',
  'renege',
]

// ── 4. Helper groupings ───────────────────────────────────────────────────────

/** Stages that count as a "rejection" — excluded from active pipeline */
export const REJECTED_STAGES: PipelineStage[] = [
  'screening_rejected',
  'interview_rejected',
  'offer_rejected',
  'renege',
]

/** Terminal stages — candidate is no longer in active pipeline */
export const TERMINAL_STAGES: PipelineStage[] = [
  'screening_rejected',
  'interview_rejected',
  'offer_rejected',
  'joined',
  'renege',
]

/** Active stages — candidate is still being worked */
export const ACTIVE_STAGES: PipelineStage[] = PIPELINE_STAGES.filter(
  s => !TERMINAL_STAGES.includes(s) && s !== 'on_hold'
) as PipelineStage[]

// ── 5. Helper functions ───────────────────────────────────────────────────────

/** Returns true if the stage is any kind of rejection */
export function isRejectedStage(stage: string): boolean {
  return REJECTED_STAGES.includes(stage as PipelineStage)
}

/** Returns true if the stage means the candidate is still actively in pipeline */
export function isActiveStage(stage: string): boolean {
  return ACTIVE_STAGES.includes(stage as PipelineStage)
}

/** Returns true if candidate has successfully joined */
export function isJoined(stage: string): boolean {
  return stage === 'joined'
}

/** Returns the Tailwind badge class for any stage string (safe fallback) */
export function getStageBadge(stage: string): string {
  return STAGE_BADGE[stage as PipelineStage] ?? 'bg-gray-100 text-gray-700'
}

/** Returns the human-readable label for any stage string (safe fallback) */
export function getStageLabel(stage: string): string {
  return STAGE_LABEL[stage as PipelineStage] ?? stage.replace(/_/g, ' ')
}