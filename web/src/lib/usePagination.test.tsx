import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useCorrectionPage, usePageUrl, usePaginationLocale } from './usePagination'

function routeur(adresse: string) {
  return ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[adresse]}>{children}</MemoryRouter>
}

const LISTE = Array.from({ length: 45 }, (_, i) => i + 1)

describe('usePageUrl', () => {
  it("lit la page dans l'adresse et la change en gardant les autres paramètres", () => {
    const { result } = renderHook(() => ({ p: usePageUrl(), l: useLocation() }), { wrapper: routeur('/ventes?vente=X&page=3') })
    expect(result.current.p.page).toBe(3)
    act(() => result.current.p.allerA(5))
    expect(result.current.l.search).toBe('?vente=X&page=5')
    act(() => result.current.p.reinitialiser())
    expect(result.current.l.search).toBe('?vente=X')
    expect(result.current.p.page).toBe(1)
  })

  it('ignore une page invalide', () => {
    const { result } = renderHook(() => usePageUrl(), { wrapper: routeur('/ventes?page=abc') })
    expect(result.current.page).toBe(1)
  })
})

describe('usePaginationLocale', () => {
  it('découpe la liste filtrée et donne le rang de départ', () => {
    const { result } = renderHook(() => usePaginationLocale(LISTE, { parPage: 20 }), { wrapper: routeur('/articles?page=2') })
    expect(result.current.visibles).toEqual(LISTE.slice(20, 40))
    expect(result.current).toMatchObject({ page: 2, pages: 3, total: 45, debut: 20 })
  })

  it("ramène à la dernière page si la page de l'adresse n'existe plus", () => {
    const { result } = renderHook(() => ({ p: usePaginationLocale(LISTE, { parPage: 20 }), l: useLocation() }), { wrapper: routeur('/articles?page=9') })
    expect(result.current.p.page).toBe(3)
    expect(result.current.p.visibles).toEqual([41, 42, 43, 44, 45])
    expect(result.current.l.search).toBe('?page=3')
  })

  it("garde la page demandée tant que la liste n'est pas chargée", () => {
    const { result } = renderHook(() => ({ p: usePaginationLocale<number>(undefined), l: useLocation() }), { wrapper: routeur('/equipe?page=2') })
    expect(result.current.p.page).toBe(2)
    expect(result.current.l.search).toBe('?page=2')
  })

  it('utilise son propre paramètre (deux listes sur un écran)', () => {
    const { result } = renderHook(() => usePaginationLocale(LISTE, { parPage: 20, param: 'page_invitations' }), { wrapper: routeur('/equipe?page=1&page_invitations=2') })
    expect(result.current.page).toBe(2)
  })
})

describe('useCorrectionPage', () => {
  it('revient à la dernière page quand le serveur renvoie une page au-delà', () => {
    const { result } = renderHook(
      () => {
        const p = usePageUrl()
        useCorrectionPage({ page: 7, par_page: 20, total: 45, pages: 3 }, p.allerA)
        return useLocation()
      },
      { wrapper: routeur('/ventes?page=7') },
    )
    expect(result.current.search).toBe('?page=3')
  })
})
