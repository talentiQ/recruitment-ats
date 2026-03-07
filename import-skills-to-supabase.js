// import-skills-to-supabase.js - Import 3200 skills to skill_vocabulary table
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

// Initialize Supabase client
const supabaseUrl = 'https://uatvadvllyuhcmegkehh.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhdHZhZHZsbHl1aGNtZWdrZWhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYxNzY5OCwiZXhwIjoyMDg2MTkzNjk4fQ.XJ6-sgPrFT12-aelSDkO4KrCmQZlujDejJbiGjiYiz8' // Use service role for bulk insert

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Parse CSV file
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())
  
  // Skip header
  const dataLines = lines.slice(1)
  
  const skills = []
  
  for (const line of dataLines) {
    // Handle CSV parsing (considering commas in quoted fields)
    const parts = parseCSVLine(line)
    
    if (parts.length >= 3) {
      const skill_name = parts[0].trim()
      const skill_category = parts[1].trim()
      const aliases_string = parts[2].trim()
      
      // Parse aliases (comma-separated) into array
      const aliases = aliases_string
        .split(',')
        .map(a => a.trim())
        .filter(a => a && a !== skill_name.toLowerCase())
      
      skills.push({
        skill_name,
        skill_category,
        skill_aliases: aliases,
        usage_count: 0,
        is_verified: true,
        is_active: true
      })
    }
  }
  
  return skills
}

// Simple CSV line parser (handles quoted fields)
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  
  result.push(current)
  return result
}

// Remove duplicates (keep first occurrence)
function deduplicateSkills(skills) {
  const seen = new Set()
  const unique = []
  
  for (const skill of skills) {
    const key = `${skill.skill_name.toLowerCase()}|${skill.skill_category}`
    
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(skill)
    }
  }
  
  return unique
}

// Insert skills in batches
async function insertSkillsBatch(skills, batchSize = 100) {
  console.log(`📥 Inserting ${skills.length} skills in batches of ${batchSize}...`)
  
  let inserted = 0
  let errors = 0
  
  for (let i = 0; i < skills.length; i += batchSize) {
    const batch = skills.slice(i, i + batchSize)
    
    try {
      const { data, error } = await supabase
        .from('skill_vocabulary')
        .insert(batch)
        .select()
      
      if (error) {
        console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} error:`, error.message)
        errors += batch.length
      } else {
        inserted += data.length
        console.log(`✅ Batch ${Math.floor(i / batchSize) + 1}: Inserted ${data.length} skills (${inserted}/${skills.length})`)
      }
    } catch (err) {
      console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} failed:`, err.message)
      errors += batch.length
    }
  }
  
  return { inserted, errors }
}

// Main import function
async function importSkills() {
  console.log('🚀 Starting skills import...\n')
  
  // Parse CSV
  console.log('📖 Reading CSV file...')
  const skills = parseCSV('C:/Users/Kunal Bhatia/OneDrive/Desktop/recruitment-ats/skills_master_3200.csv')
  console.log(`✅ Parsed ${skills.length} skills from CSV\n`)
  
  // Show sample
  console.log('📋 Sample skills:')
  console.log(skills.slice(0, 3))
  console.log('')
  
  // Deduplicate
  console.log('🔄 Removing duplicates...')
  const uniqueSkills = deduplicateSkills(skills)
  console.log(`✅ ${uniqueSkills.length} unique skills (removed ${skills.length - uniqueSkills.length} duplicates)\n`)
  
  // Check existing skills
  console.log('🔍 Checking existing skills in database...')
  const { data: existingSkills, error: fetchError } = await supabase
    .from('skill_vocabulary')
    .select('skill_name, skill_category')
  
  if (fetchError) {
    console.error('❌ Error fetching existing skills:', fetchError.message)
  } else {
    console.log(`✅ Found ${existingSkills.length} existing skills in database\n`)
    
    // Filter out skills that already exist
    const existingSet = new Set(
      existingSkills.map(s => `${s.skill_name.toLowerCase()}|${s.skill_category}`)
    )
    
    const newSkills = uniqueSkills.filter(skill => {
      const key = `${skill.skill_name.toLowerCase()}|${skill.skill_category}`
      return !existingSet.has(key)
    })
    
    console.log(`📊 Skills to insert: ${newSkills.length} (${uniqueSkills.length - newSkills.length} already exist)\n`)
    
    if (newSkills.length === 0) {
      console.log('✅ All skills already exist in database!')
      return
    }
    
    // Insert new skills
    const { inserted, errors } = await insertSkillsBatch(newSkills, 100)
    
    console.log('\n📊 IMPORT SUMMARY:')
    console.log(`✅ Successfully inserted: ${inserted}`)
    console.log(`❌ Errors: ${errors}`)
    console.log(`📈 Total skills in database: ${existingSkills.length + inserted}`)
  }
}

// Run import
importSkills()
  .then(() => {
    console.log('\n✅ Import complete!')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n❌ Import failed:', err)
    process.exit(1)
  })