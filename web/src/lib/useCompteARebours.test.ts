import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formaterCompteARebours } from './format'
import { useCompteARebours } from './useCompteARebours'

describe('useCompteARebours', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('décompte chaque seconde jusqu’à 0, puis s’arrête', () => {
    const { result } = renderHook(() => useCompteARebours('2026-11-08T12:00:03Z'))
    expect(result.current).toBe(3)
    expect(formaterCompteARebours(result.current!)).toBe('0:03')
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(2)
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current).toBe(0)
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(0)
  })

  it('se recale sur l’horloge (pas de dérive si l’onglet a dormi)', () => {
    const { result } = renderHook(() => useCompteARebours('2026-11-08T12:05:00Z'))
    expect(result.current).toBe(300)
    act(() => {
      vi.setSystemTime(new Date('2026-11-08T12:04:29Z'))
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe(30)
  })

  it('suit un changement d’échéance (nouvelle demande de paiement)', () => {
    const { result, rerender } = renderHook(({ fin }) => useCompteARebours(fin), { initialProps: { fin: '2026-11-08T12:00:10Z' as string | null } })
    expect(result.current).toBe(10)
    rerender({ fin: '2026-11-08T12:05:00Z' })
    expect(result.current).toBe(300)
    rerender({ fin: null })
    expect(result.current).toBeNull()
  })
})
