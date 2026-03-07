// generate-sql-inserts.js - Convert CSV to SQL INSERT statements
const fs = require('fs')

// Parse CSV file
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())
  
  const dataLines = lines.slice(1)
  const skills = []
  
  for (const line of dataLines) {
    const parts = parseCSVLine(line)
    
    if (parts.length >= 3) {
      const skill_name = parts[0].trim()
      const skill_category = parts[1].trim()
      const aliases_string = parts[2].trim()
      
      const aliases = aliases_string
        .split(',')
        .map(a => a.trim())
        .filter(a => a && a !== skill_name.toLowerCase())
      
      skills.push({
        skill_name,
        skill_category,
        skill_aliases: aliases
      })
    }
  }
  
  return skills
}

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

// Deduplicate
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

// Generate SQL
function generateSQL(skills) {
  let sql = `-- Import ${skills.length} skills to skill_vocabulary table
-- Generated: ${new Date().toISOString()}

BEGIN;

`
  
  // Insert in batches of 100
  for (let i = 0; i < skills.length; i += 100) {
    const batch = skills.slice(i, i + 100)
    
    sql += `-- Batch ${Math.floor(i / 100) + 1} (${i + 1} to ${Math.min(i + 100, skills.length)})\n`
    sql += `INSERT INTO skill_vocabulary (skill_name, skill_category, skill_aliases, usage_count, is_verified, is_active)\nVALUES\n`
    
    const values = batch.map(skill => {
      const name = skill.skill_name.replace(/'/g, "''")
      const category = skill.skill_category.replace(/'/g, "''")
      const aliases = JSON.stringify(skill.skill_aliases).replace(/'/g, "''")
      
      return `  ('${name}', '${category}', ARRAY${aliases.replace(/"/g, "'")}::TEXT[], 0, true, true)`
    })
    
    sql += values.join(',\n')
    sql += '\nON CONFLICT (skill_name, skill_category) DO NOTHING;\n\n'
  }
  
  sql += 'COMMIT;\n'
  
  return sql
}

// Main
console.log('📖 Reading CSV file...')
const allSkills = parseCSV('C:/Users/Kunal Bhatia/OneDrive/Desktop/recruitment-ats/skills_master_3200.csv')
console.log(`✅ Parsed ${allSkills.length} skills`)

console.log('🔄 Removing duplicates...')
const uniqueSkills = deduplicateSkills(allSkills)
console.log(`✅ ${uniqueSkills.length} unique skills (removed ${allSkills.length - uniqueSkills.length} duplicates)`)

console.log('📝 Generating SQL...')
const sql = generateSQL(uniqueSkills)

console.log('💾 Writing to insert-skills.sql...')
fs.writeFileSync('/home/claude/insert-skills.sql', sql)

console.log(`✅ Done! Created insert-skills.sql with ${uniqueSkills.length} skills`)
console.log('\nNext steps:')
console.log('1. Copy contents of insert-skills.sql')
console.log('2. Go to Supabase Dashboard → SQL Editor')
console.log('3. Paste and run the SQL')
console.log('4. Verify import completed successfully')