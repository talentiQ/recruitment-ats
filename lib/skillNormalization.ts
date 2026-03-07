// lib/skillNormalization.ts - Normalize skills using skill_vocabulary table
import { supabase } from './supabase'

// Cache for skill vocabulary (load once, use many times)
let skillVocabularyCache: Map<string, {
  skill_name: string
  skill_category: string
  skill_aliases: string[]
}> | null = null

// Load skill vocabulary from database
export async function loadSkillVocabulary() {
  if (skillVocabularyCache) {
    return skillVocabularyCache
  }

  const { data: skills, error } = await supabase
    .from('skill_vocabulary')
    .select('skill_name, skill_category, skill_aliases')
    .eq('is_active', true)

  if (error) {
    console.error('Error loading skill vocabulary:', error)
    return null
  }

  const cache = new Map<string, any>()
  
  for (const skill of skills) {
    // Index by skill name (lowercase)
    cache.set(skill.skill_name.toLowerCase(), skill)
    
    // Index by each alias
    if (skill.skill_aliases && Array.isArray(skill.skill_aliases)) {
      for (const alias of skill.skill_aliases) {
        cache.set(alias.toLowerCase(), skill)
      }
    }
  }

  skillVocabularyCache = cache
  console.log(`✅ Loaded ${skills.length} skills with ${cache.size} total entries (including aliases)`)
  
  return cache
}

// Find standardized skill from raw input
function findStandardSkill(rawSkill: string, vocabulary: Map<string, any>) {
  const cleaned = rawSkill.trim().toLowerCase()
  
  // Direct match
  const match = vocabulary.get(cleaned)
  if (match) {
    return match
  }
  
  // Fuzzy match (simple Levenshtein distance)
  const candidates: Array<{ skill: any; distance: number }> = []
  
  for (const [key, skill] of vocabulary.entries()) {
    // Only check against main skill names (not aliases)
    if (key === skill.skill_name.toLowerCase()) {
      const distance = levenshteinDistance(cleaned, key)
      
      // If very similar (1-2 char difference)
      if (distance <= 2) {
        candidates.push({ skill, distance })
      }
    }
  }
  
  // Return closest match
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.distance - b.distance)
    return candidates[0].skill
  }
  
  return null
}

// Simple Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

// Normalize array of raw skills
export async function normalizeSkills(rawSkills: string[]) {
  // Load vocabulary
  const vocabulary = await loadSkillVocabulary()
  
  if (!vocabulary) {
    // Fallback: return raw skills if vocabulary load failed
    console.warn('⚠️ Skill vocabulary not loaded, returning raw skills')
    return {
      normalized: rawSkills,
      categories: {},
      matched: 0,
      unmatched: rawSkills.length,
      confidence: 0
    }
  }

  const normalized = new Set<string>()
  const categories: Record<string, string[]> = {}
  const unmatchedSkills: string[] = []
  let matched = 0

  for (const rawSkill of rawSkills) {
    const standardSkill = findStandardSkill(rawSkill, vocabulary)
    
    if (standardSkill) {
      normalized.add(standardSkill.skill_name)
      matched++
      
      // Add to category
      const category = standardSkill.skill_category || 'Other'
      if (!categories[category]) {
        categories[category] = []
      }
      if (!categories[category].includes(standardSkill.skill_name)) {
        categories[category].push(standardSkill.skill_name)
      }
    } else {
      // Keep unmatched skills
      normalized.add(rawSkill)
      unmatchedSkills.push(rawSkill)
      
      const category = 'Unmatched'
      if (!categories[category]) {
        categories[category] = []
      }
      categories[category].push(rawSkill)
    }
  }

  const confidence = rawSkills.length > 0 ? (matched / rawSkills.length) : 0

  return {
    normalized: Array.from(normalized),
    categories,
    matched,
    unmatched: unmatchedSkills.length,
    unmatchedSkills,
    confidence
  }
}

// Update skill usage count (for analytics)
// Note: This uses a PostgreSQL function for atomic updates
// Run skill-usage-update-function.sql in Supabase SQL Editor first
export async function updateSkillUsage(skillName: string) {
  try {
    const { error } = await supabase.rpc('increment_skill_usage', {
      skill_name_param: skillName
    })

    if (error) {
      console.error('Error updating skill usage:', error)
    }
  } catch (err) {
    console.error('Error calling increment_skill_usage:', err)
  }
}

// Batch update skill usage
export async function batchUpdateSkillUsage(skillNames: string[]) {
  for (const skillName of skillNames) {
    await updateSkillUsage(skillName)
  }
}