import { createContext, type ReactNode, useContext } from 'react'
import type { Card } from '@/engine'

/**
 * Lets a game draw something extra on certain cards (e.g. Hearts puts a black pig on the queen
 * of spades). Every `PlayingCard` below the provider asks it; without one nothing changes.
 */
export type CardDecoration = (card: Card) => ReactNode

export const CardDecorationContext = createContext<CardDecoration | null>(null)

export const useCardDecoration = () => useContext(CardDecorationContext)
