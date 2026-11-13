import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { CLE_MANIFESTE } from '@/api/audio'
import { useVoix } from '@/voix/store'
import { Bouton } from './Bouton'

function Enveloppe({ children, client }: { children: ReactNode; client: QueryClient }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function clientAvecManifeste() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(CLE_MANIFESTE('wo'), { langue: 'wo', version: 1, audios: { 'caisse.encaisser': 'data:audio/wav;base64,AAAA' } })
  client.setQueryData(CLE_MANIFESTE('fr'), { langue: 'fr', version: 1, audios: {} })
  return client
}

describe('Bouton', () => {
  it('rend un bouton de type button par défaut et déclenche onClick', () => {
    const onClick = vi.fn()
    render(<Bouton onClick={onClick}>Encaisser</Bouton>, { wrapper: ({ children }) => <Enveloppe client={new QueryClient()}>{children}</Enveloppe> })
    const bouton = screen.getByRole('button', { name: 'Encaisser' })
    expect(bouton).toHaveAttribute('type', 'button')
    fireEvent.click(bouton)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('état chargement : désactivé, aria-busy, onClick inactif', () => {
    const onClick = vi.fn()
    render(
      <Bouton chargement onClick={onClick}>
        Encaisser
      </Bouton>,
      { wrapper: ({ children }) => <Enveloppe client={new QueryClient()}>{children}</Enveloppe> },
    )
    const bouton = screen.getByRole('button', { name: 'Encaisser' })
    expect(bouton).toBeDisabled()
    expect(bouton).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(bouton)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('applique les variantes et tailles', () => {
    const { rerender } = render(<Bouton variante="danger">X</Bouton>, {
      wrapper: ({ children }) => <Enveloppe client={new QueryClient()}>{children}</Enveloppe>,
    })
    expect(screen.getByRole('button')).toHaveClass('bg-danger')
    rerender(
      <Bouton variante="secondaire" taille="xl" pleineLargeur>
        X
      </Bouton>,
    )
    expect(screen.getByRole('button')).toHaveClass('verre-fort', 'h-16', 'w-full')
  })

  it('affiche le haut-parleur si un audio existe, et le clic sur celui-ci ne déclenche pas le bouton', () => {
    useVoix.getState().definirLangue('wo')
    useVoix.getState().definirActivee(true)
    const onClick = vi.fn()
    render(
      <Bouton voix="caisse.encaisser" onClick={onClick}>
        Encaisser
      </Bouton>,
      { wrapper: ({ children }) => <Enveloppe client={clientAvecManifeste()}>{children}</Enveloppe> },
    )
    const hautParleur = document.querySelector<HTMLElement>('[data-haut-parleur]')!
    expect(hautParleur).toHaveAttribute('aria-hidden', 'true')
    expect(hautParleur).toBeInTheDocument()
    fireEvent.click(hautParleur)
    expect(onClick).not.toHaveBeenCalled()
    expect(useVoix.getState().cleEnLecture).toBe('caisse.encaisser')
  })

  it("masque le haut-parleur quand aucun audio n'existe pour la clé", () => {
    useVoix.getState().definirLangue('wo')
    useVoix.getState().definirActivee(true)
    render(<Bouton voix="cle.sans.audio">Encaisser</Bouton>, {
      wrapper: ({ children }) => <Enveloppe client={clientAvecManifeste()}>{children}</Enveloppe>,
    })
    expect(document.querySelector('[data-haut-parleur]')).toBeNull()
  })
})
