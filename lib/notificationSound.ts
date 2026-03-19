// lib/notificationSound.ts
// Plays a pleasant two-tone chime using the Web Audio API.
// No external library or audio file required — works in all modern browsers.
// For celebration events (offer extended, joined) → ascending chime
// For loss events (offer rejected, renege) → descending tone

type SoundType = 'celebration' | 'loss'

function createChime(ctx: AudioContext, freq: number, startTime: number, duration = 0.18) {
  const osc    = ctx.createOscillator()
  const gain   = ctx.createGain()

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, startTime)

  // Smooth attack + decay envelope so it doesn't click
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

  osc.start(startTime)
  osc.stop(startTime + duration)
}

export function playNotificationSound(type: SoundType = 'celebration') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const now = ctx.currentTime

    if (type === 'celebration') {
      // Ascending two-note chime — E5 → G5
      createChime(ctx, 659, now)
      createChime(ctx, 784, now + 0.18)
    } else {
      // Single low tone — C4
      createChime(ctx, 261, now, 0.28)
    }

    // Safari requires explicit resume after user gesture
    if (ctx.state === 'suspended') {
      ctx.resume()
    }
  } catch (e) {
    // Silently fail — audio is enhancement only
    console.warn('[notificationSound] Audio not available:', e)
  }
}