import { type SoundVolume, useSettings } from '@/stores/settingsStore'

/**
 * Card sounds synthesized with the Web Audio API: no audio files to license, download or cache,
 * so they work offline and cost nothing on the first load.
 */
export type SoundName =
  | 'card'
  | 'draw'
  | 'shuffle'
  | 'invalid'
  | 'undo'
  | 'win'
  | 'lose'
  /** Hearts: the black pig of the queen of spades. */
  | 'grunt'

export const VOLUME: Readonly<Record<SoundVolume, number>> = { low: 0.25, medium: 0.5, high: 0.9 }

let context: AudioContext | null = null
let noise: AudioBuffer | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null
  context ??= new window.AudioContext()
  // Browsers suspend audio until a user gesture, and phones again after backgrounding.
  if (context.state === 'suspended') void context.resume()
  return context
}

/** Call from a user gesture (first tap) so later sounds, e.g. AI moves, are allowed to play. */
export function unlockAudio(): void {
  getContext()
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return noise
}

/** A short filtered noise burst – the "snap" of a card. */
function snap(ctx: AudioContext, volume: number, at: number, length = 0.05, frequency = 2400) {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = frequency
  filter.Q.value = 0.9
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume, at)
  gain.gain.exponentialRampToValueAtTime(0.001, at + length)
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start(at)
  source.stop(at + length + 0.02)
}

/** A sliding noise – a card pulled from the stock. */
function slide(ctx: AudioContext, volume: number, at: number) {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(3200, at)
  filter.frequency.exponentialRampToValueAtTime(700, at + 0.14)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.001, at)
  gain.gain.exponentialRampToValueAtTime(volume * 0.7, at + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16)
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start(at)
  source.stop(at + 0.2)
}

function tone(
  ctx: AudioContext,
  volume: number,
  at: number,
  frequency: number,
  length: number,
  type: OscillatorType = 'triangle',
) {
  const oscillator = ctx.createOscillator()
  oscillator.type = type
  oscillator.frequency.value = frequency
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.001, at)
  gain.gain.exponentialRampToValueAtTime(volume * 0.35, at + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.001, at + length)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(at)
  oscillator.stop(at + length + 0.02)
}

/** One pig grunt: a low, falling sawtooth through a muffling filter, with some breath. */
function oink(ctx: AudioContext, volume: number, at: number, pitch: number, length: number) {
  const voice = ctx.createOscillator()
  voice.type = 'sawtooth'
  voice.frequency.setValueAtTime(pitch, at)
  voice.frequency.exponentialRampToValueAtTime(pitch * 0.7, at + length)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 700
  filter.Q.value = 6
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.001, at)
  gain.gain.exponentialRampToValueAtTime(volume * 0.6, at + 0.025)
  gain.gain.exponentialRampToValueAtTime(0.001, at + length)
  voice.connect(filter).connect(gain).connect(ctx.destination)
  voice.start(at)
  voice.stop(at + length + 0.02)
  snap(ctx, volume * 0.35, at, length * 0.8, 450)
}

const SOUNDS: Readonly<Record<SoundName, (ctx: AudioContext, volume: number, at: number) => void>> =
  {
    card: (ctx, v, at) => snap(ctx, v, at),
    draw: (ctx, v, at) => slide(ctx, v, at),
    undo: (ctx, v, at) => slide(ctx, v * 0.6, at),
    shuffle: (ctx, v, at) => {
      for (let i = 0; i < 8; i++) snap(ctx, v * 0.6, at + i * 0.04, 0.03, 1800 + i * 120)
    },
    invalid: (ctx, v, at) => {
      tone(ctx, v, at, 196, 0.09, 'sine')
      tone(ctx, v, at + 0.1, 147, 0.12, 'sine')
    },
    win: (ctx, v, at) => {
      ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, v, at + i * 0.11, f, 0.25))
    },
    grunt: (ctx, v, at) => {
      oink(ctx, v, at, 125, 0.2)
      oink(ctx, v, at + 0.27, 105, 0.26)
    },
    lose: (ctx, v, at) => {
      ;[392, 329.63, 261.63].forEach((f, i) => tone(ctx, v, at + i * 0.16, f, 0.3, 'sine'))
    },
  }

/** Plays a sound unless sounds are switched off in the settings. */
export function playSound(name: SoundName): void {
  const { sound, soundVolume } = useSettings.getState()
  if (!sound) return
  const ctx = getContext()
  if (!ctx) return
  try {
    SOUNDS[name](ctx, VOLUME[soundVolume], ctx.currentTime)
  } catch {
    // Audio is a nice-to-have; never let it break the game.
  }
}

/** Tests only. */
export function resetSoundForTests(): void {
  context = null
  noise = null
}
