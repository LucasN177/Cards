import { fireEvent, render, screen } from '@testing-library/react'
import { parseCards } from '@/engine'
import { cardName } from '@/features/cards/cardFaces'
import { useSettings } from '@/stores/settingsStore'
import { Hand } from './Hand'
import { cardSpacing, handRows } from './handLayout'

const cards = parseCards('QH 10S AC')

function renderHand(props: Partial<React.ComponentProps<typeof Hand>> = {}) {
  const onPlay = vi.fn()
  render(<Hand cards={cards} enabled onPlay={onPlay} {...props} />)
  const button = (name: string) => screen.getByRole('button', { name })
  return { onPlay, button }
}

describe('Hand', () => {
  it('plays a card with a single mouse click', () => {
    const { onPlay, button } = renderHand()
    fireEvent.pointerDown(button('Herz Dame'), { pointerType: 'mouse' })
    fireEvent.click(button('Herz Dame'), { detail: 1 })
    expect(onPlay).toHaveBeenCalledWith(cards[0])
  })

  it('plays a card from the keyboard', () => {
    const { onPlay, button } = renderHand()
    fireEvent.click(button('Pik 10'), { detail: 0 })
    expect(onPlay).toHaveBeenCalledWith(cards[1])
  })

  it('needs two taps on touch screens', () => {
    const { onPlay, button } = renderHand()
    const ace = button('Kreuz Ass')
    fireEvent.pointerDown(ace, { pointerType: 'touch' })
    fireEvent.click(ace, { detail: 1 })
    expect(onPlay).not.toHaveBeenCalled()
    expect(ace).toHaveAttribute('aria-pressed', 'true')

    fireEvent.pointerDown(ace, { pointerType: 'touch' })
    fireEvent.click(ace, { detail: 1 })
    expect(onPlay).toHaveBeenCalledWith(cards[2])
  })

  it('ignores cards that cannot be played and turns where it is not your move', () => {
    const { onPlay, button } = renderHand({ isPlayable: (c) => c.id !== 'QH' })
    fireEvent.click(button('Herz Dame'), { detail: 0 })
    expect(onPlay).not.toHaveBeenCalled()
    expect(button('Herz Dame')).toHaveAttribute('aria-disabled', 'true')
  })

  it('does nothing while disabled', () => {
    const { onPlay, button } = renderHand({ enabled: false })
    fireEvent.click(button('Pik 10'), { detail: 0 })
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('names cards in the selected deck style', () => {
    useSettings.getState().update({ deckStyle: 'german' })
    renderHand()
    expect(screen.getByRole('button', { name: 'Herz Ober' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eichel Ass' })).toBeInTheDocument()
  })
})

describe('cardName', () => {
  it('uses German names for both deck styles', () => {
    const [jack, ten] = parseCards('JD 10C')
    expect(cardName(jack!, 'french')).toBe('Karo Bube')
    expect(cardName(jack!, 'german')).toBe('Schellen Unter')
    expect(cardName(ten!, 'german')).toBe('Eichel 10')
    expect(cardName(parseCards('JKB')[0]!, 'french')).toBe('Schwarzer Joker')
  })
})

describe('cardSpacing', () => {
  it('keeps a gap when everything fits', () => {
    expect(cardSpacing(3, 1000, 60)).toBe(66)
  })

  it('overlaps cards to fit the width', () => {
    expect(cardSpacing(8, 351, 64)).toBeCloseTo((351 - 64) / 7)
  })

  it('never hides more than the minimum visible part', () => {
    expect(cardSpacing(20, 200, 60)).toBeCloseTo(60 * 0.28)
  })
})

describe('handRows', () => {
  it('keeps one row while every card stays tappable', () => {
    expect(handRows(8, 351, 64)).toBe(1)
    expect(handRows(15, 800, 64)).toBe(1)
  })

  it('splits big hands on narrow screens into two rows', () => {
    expect(handRows(12, 351, 64)).toBe(2)
  })
})
