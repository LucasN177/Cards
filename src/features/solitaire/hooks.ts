import { type RefObject, useLayoutEffect, useRef, useState } from 'react'

export function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

/** Named drop areas (piles, cells, foundations) found by pointer position. */
export function useDropZones() {
  const zones = useRef(new Map<string, HTMLElement>())
  const register = (key: string) => (element: HTMLElement | null) => {
    if (element) zones.current.set(key, element)
    else zones.current.delete(key)
  }
  const find = (x: number, y: number): string | null => {
    for (const [key, element] of zones.current) {
      const rect = element.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return key
    }
    return null
  }
  return { register, find }
}

/** Hint that stays visible until the next move (version change) or for a few seconds. */
export function useHintTimer(version: number) {
  const [hintAt, setHintAt] = useState<number | null>(null)
  const show = () => {
    const at = version
    setHintAt(at)
    setTimeout(() => setHintAt((current) => (current === at ? null : current)), 4000)
  }
  return { active: hintAt === version, show }
}

/** Red flash plus error sound for a card that has nowhere to go. */
export function useFlash(onInvalid?: () => void) {
  const [flash, setFlash] = useState<string | null>(null)
  const trigger = (cardId: string) => {
    onInvalid?.()
    setFlash(cardId)
    setTimeout(() => setFlash(null), 450)
  }
  return { flash, trigger }
}
