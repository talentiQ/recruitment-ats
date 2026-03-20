// lib/notificationSound.ts
// Plays a pleasant two-tone chime using the Web Audio API.
// No external library or audio file required — works in all modern browsers.
//
// Fix: AudioContext is created and unlocked on first user gesture,
// then reused for all subsequent sounds. This bypasses the browser
// autoplay policy that blocks audio triggered by WebSocket/realtime events.

type SoundType = 'celebration' | 'loss'

// ── Singleton AudioContext — created once, reused forever ─────────────────
let _ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  try {
    if (!_ctx) {
      _ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    // Resume if suspended (happens after page load before user gesture)
    if (_ctx.state === 'suspended') {
      _ctx.resume()
    }
    return _ctx
  } catch {
    return null
  }
}

// ── Unlock on first user gesture ──────────────────────────────────────────
// Attach once to document — creates + resumes the context early
// so it's ready when a realtime notification arrives later
if (typeof window !== 'undefined') {
  const unlock = () => {
    getContext()
    document.removeEventListener('click',     unlock)
    document.removeEventListener('keydown',   unlock)
    document.removeEventListener('touchstart', unlock)
  }
  document.addEventListener('click',      unlock, { once: true })
  document.addEventListener('keydown',    unlock, { once: true })
  document.addEventListener('touchstart', unlock, { once: true, passive: true })
}

// ── Chime generator ───────────────────────────────────────────────────────
function createChime(ctx: AudioContext, freq: number, startTime: number, duration = 0.18) {
  const osc  = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, startTime)

  // Smooth attack + decay envelope — no clicks
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

  osc.start(startTime)
  osc.stop(startTime + duration)
}

// ── Main export ───────────────────────────────────────────────────────────
export function playNotificationSound(type: SoundType = 'celebration') {
  try {
    const ctx = getContext()
    if (!ctx) return

    const now = ctx.currentTime

    if (type === 'celebration') {
      // Ascending three-note chime — E5 → G5 → B5 (alert, hard to miss)
      createChime(ctx, 659, now)
      createChime(ctx, 784, now + 0.18)
      createChime(ctx, 988, now + 0.36)
    } else {
      // Descending two-note tone — G4 → E4 (distinct loss sound)
      createChime(ctx, 392, now,        0.25)
      createChime(ctx, 330, now + 0.25, 0.30)
    }
  } catch (e) {
    console.warn('[notificationSound] Audio not available:', e)
  }
}