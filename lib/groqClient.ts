// lib/groqClient.ts
// Thin wrapper around Groq REST API — OpenAI-compatible endpoint.
// No SDK needed — plain fetch keeps the bundle small on Vercel.
//
// Usage:
//   const result = await groqChat([{ role: 'user', content: '...' }])
//   const result = await groqChat([...], { json: true })  // forces JSON output

export interface GroqMessage {
  role:    'system' | 'user' | 'assistant'
  content: string
}

export interface GroqOptions {
  model?:       string   // default: llama-3.1-70b-versatile
  temperature?: number   // default: 0.1 (low = consistent structured output)
  maxTokens?:   number   // default: 1500
  json?:        boolean  // if true, forces response_format: json_object
}

export interface GroqResponse {
  content:      string
  model:        string
  promptTokens: number
  totalTokens:  number
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export async function groqChat(
  messages: GroqMessage[],
  options:  GroqOptions = {}
): Promise<GroqResponse> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set in environment variables')

  const body: Record<string, unknown> = {
    model:       options.model       ?? DEFAULT_MODEL,
    temperature: options.temperature ?? 0.1,
    max_tokens:  options.maxTokens   ?? 1500,
    messages,
  }

  // Force JSON output — model MUST see "json" in the prompt too (Groq requirement)
  if (options.json) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch(GROQ_API_URL, {
    method:  'POST',
    headers: {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const choice = data.choices?.[0]

  if (!choice) throw new Error('Groq returned no choices')

  return {
    content:      choice.message.content,
    model:        data.model,
    promptTokens: data.usage?.prompt_tokens  ?? 0,
    totalTokens:  data.usage?.total_tokens   ?? 0,
  }
}