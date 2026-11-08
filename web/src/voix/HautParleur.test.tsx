import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { CLE_MANIFESTE } from '@/api/audio'
import { HautParleur } from './HautParleur'
import { arreter } from './lecteur'
import { useVoix } from './store'

function creerClient(manifestes: Record<string, Record<string, string>>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })
  for (const [langue, audios] of Object.entries(manifestes)) {
    client.setQueryData(CLE_MANIFESTE(langue as 'wo'), { langue, version: 1, audios })
  }
  return client
}

function rendre(ui: ReactNode, client: QueryClient) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('HautParleur', () => {
  beforeEach(() => {
    arreter()
    useVoix.getState().definirLangue('wo')
    useVoix.getState().definirActivee(true)
  })

  it("est masqué s'il n'y a d'audio ni dans la langue ni en repli français", () => {
    rendre(<HautParleur cle="caisse.encaisser" />, creerClient({ wo: {}, fr: {} }))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('utilise le repli français quand la langue choisie ne couvre pas la clé', () => {
    rendre(<HautParleur cle="caisse.encaisser" />, creerClient({ wo: {}, fr: { 'caisse.encaisser': 'data:audio/wav;base64,FR' } }))
    expect(screen.getByRole('button', { name: 'Écouter' })).toBeInTheDocument()
  })

  it("est masqué quand l'aide vocale est désactivée (sauf langue imposée)", () => {
    useVoix.getState().definirActivee(false)
    const client = creerClient({ wo: { 'langue.wo': 'data:audio/wav;base64,WO' } })
    const { unmount } = rendre(<HautParleur cle="langue.wo" />, client)
    expect(screen.queryByRole('button')).toBeNull()
    unmount()
    rendre(<HautParleur cle="langue.wo" langue="wo" />, client)
    expect(screen.getByRole('button', { name: 'Écouter' })).toBeInTheDocument()
  })

  it('lit au clic, affiche les ondes, et ne propage pas le clic au parent', () => {
    const surParent = vi.fn()
    rendre(
      <button type="button" onClick={surParent}>
        Encaisser
        <HautParleur cle="caisse.encaisser" dansBouton />
      </button>,
      creerClient({ wo: { 'caisse.encaisser': 'data:audio/wav;base64,WO' } }),
    )
    const hp = screen.getByRole('button', { name: 'Écouter' })
    expect(hp).toHaveAttribute('tabindex', '-1')
    fireEvent.click(hp)
    expect(surParent).not.toHaveBeenCalled()
    expect(useVoix.getState().cleEnLecture).toBe('caisse.encaisser')
    expect(hp).toHaveAttribute('aria-pressed', 'true')
  })

  it('un seul son à la fois : lire une autre clé coupe la précédente', () => {
    rendre(
      <>
        <HautParleur cle="a" />
        <HautParleur cle="b" />
      </>,
      creerClient({ wo: { a: 'data:audio/wav;base64,A', b: 'data:audio/wav;base64,B' } }),
    )
    const [hpA, hpB] = screen.getAllByRole('button', { name: 'Écouter' })
    fireEvent.click(hpA!)
    expect(useVoix.getState().cleEnLecture).toBe('a')
    fireEvent.click(hpB!)
    expect(useVoix.getState().cleEnLecture).toBe('b')
    expect(hpA).toHaveAttribute('aria-pressed', 'false')
    expect(hpB).toHaveAttribute('aria-pressed', 'true')
  })

  it('est focalisable et déclenchable au clavier hors bouton', () => {
    rendre(<HautParleur cle="a" />, creerClient({ wo: { a: 'data:audio/wav;base64,A' } }))
    const hp = screen.getByRole('button', { name: 'Écouter' })
    expect(hp).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(hp, { key: 'Enter' })
    expect(useVoix.getState().cleEnLecture).toBe('a')
  })
})
