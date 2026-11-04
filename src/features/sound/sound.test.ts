import { useSettings } from '@/stores/settingsStore'
import { playSound, resetSoundForTests, unlockAudio } from './sound'

/** Minimal Web Audio stand-in that records which nodes a sound creates. */
class FakeAudioContext {
  static created = 0
  static oscillators = 0
  static sources = 0
  state: AudioContextState = 'suspended'
  currentTime = 0
  sampleRate = 8000
  destination = {}
  constructor() {
    FakeAudioContext.created++
  }
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  private param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  })
  private node = () => ({ connect: (next: unknown) => next })
  createBuffer = (_c: number, length: number) => ({
    sampleRate: this.sampleRate,
    getChannelData: () => new Float32Array(length),
  })
  createBufferSource = () => {
    FakeAudioContext.sources++
    return { ...this.node(), buffer: null, start: vi.fn(), stop: vi.fn() }
  }
  createBiquadFilter = () => ({
    ...this.node(),
    type: '',
    frequency: this.param(),
    Q: this.param(),
  })
  createGain = () => ({ ...this.node(), gain: this.param() })
  createOscillator = () => {
    FakeAudioContext.oscillators++
    return { ...this.node(), type: '', frequency: this.param(), start: vi.fn(), stop: vi.fn() }
  }
}

describe('sound', () => {
  beforeEach(() => {
    resetSoundForTests()
    FakeAudioContext.created = FakeAudioContext.oscillators = FakeAudioContext.sources = 0
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('stays silent when sounds are switched off', () => {
    useSettings.getState().update({ sound: false })
    playSound('win')
    expect(FakeAudioContext.created).toBe(0)
  })

  it('plays synthesized cards and jingles', () => {
    playSound('card')
    expect(FakeAudioContext.sources).toBe(1)
    playSound('win')
    expect(FakeAudioContext.oscillators).toBe(4)
    playSound('shuffle')
    expect(FakeAudioContext.sources).toBe(9)
    expect(FakeAudioContext.created).toBe(1)
  })

  it('unlocks a suspended audio context on the first tap', () => {
    unlockAudio()
    expect(FakeAudioContext.created).toBe(1)
  })

  it('does nothing where Web Audio is missing', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => playSound('card')).not.toThrow()
  })
})
