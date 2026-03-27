// lib/notificationSound.ts
// Plays a pleasant two-tone chime using the Web Audio API.
// No external library or audio file required — works in all modern browsers.
//
// Fix v2: getContext() is now async — properly awaits ctx.resume() before
// returning. Previously resume() was fire-and-forget, so the context was
// still 'suspended' when createChime ran → silent output.

type SoundType = 'celebration' | 'loss'

// ── Singleton AudioContext — created once, reused forever ─────────────────
let _ctx: AudioContext | null = null
let _unlocked = false

async function getContext(): Promise<AudioContext | null> {
  try {
    if (!_ctx) {
      _ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    // Resume if suspended — MUST be awaited or audio plays silently
    if (_ctx.state === 'suspended') {
      await _ctx.resume()
    }
    return _ctx
  } catch {
    return null
  }
}

// ── Unlock on first user gesture ──────────────────────────────────────────
// Creates + resumes the context early so it's ready when a realtime
// notification arrives later (browsers block audio without a prior gesture)
if (typeof window !== 'undefined') {
  const unlock = async () => {
    if (_unlocked) return
    _unlocked = true
    await getContext()
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
export async function playNotificationSound(type: SoundType = 'celebration') {
  try {
    const ctx = await getContext()   // awaited — context is guaranteed running
    if (!ctx) return

    // Extra guard — if still suspended after await, bail out
    if (ctx.state !== 'running') {
      console.warn('[notificationSound] AudioContext not running:', ctx.state)
      return
    }

    const now = ctx.currentTime

    if (type === 'celebration') {
      // Ascending three-note chime — E5 → G5 → B5
      createChime(ctx, 659, now)
      createChime(ctx, 784, now + 0.18)
      createChime(ctx, 988, now + 0.36)
    } else {
      // Descending two-note tone — G4 → E4
      createChime(ctx, 392, now,        0.25)
      createChime(ctx, 330, now + 0.25, 0.30)
    }
  } catch (e) {
    console.warn('[notificationSound] Audio not available:', e)
  }
}