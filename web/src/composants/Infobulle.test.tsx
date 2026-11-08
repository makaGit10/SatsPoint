import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Infobulle } from './Infobulle'

function simulerPointeur(fin: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: fin && query.includes('pointer: fine'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

describe('Infobulle (chargée à la demande)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'requestIdleCallback', { writable: true, configurable: true, value: (cb: () => void) => setTimeout(cb, 0) })
    Object.defineProperty(window, 'cancelIdleCallback', { writable: true, configurable: true, value: (id: number) => clearTimeout(id) })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('au tactile, rend seulement son enfant (rien de chargé)', () => {
    simulerPointeur(false)
    render(
      <Infobulle contenu="Exporter">
        <button type="button">A</button>
      </Infobulle>,
    )
    const bouton = screen.getByRole('button', { name: 'A' })
    expect(bouton).toBeInTheDocument()
    expect(bouton).not.toHaveAttribute('data-state')
  })

  it('à la souris, charge Radix au repos puis habille le déclencheur ; un second montage réutilise le module sans planter', async () => {
    simulerPointeur(true)
    render(
      <Infobulle contenu="Exporter">
        <button type="button">B</button>
      </Infobulle>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('data-state', 'closed'))

    // Le module est désormais en cache : l'état initial doit être le composant lui-même, pas son résultat.
    render(
      <Infobulle contenu="Filtrer">
        <button type="button">C</button>
      </Infobulle>,
    )
    expect(screen.getByRole('button', { name: 'C' })).toHaveAttribute('data-state', 'closed')
  })

  it('désactivée : enfant brut même à la souris', () => {
    simulerPointeur(true)
    render(
      <Infobulle contenu="Exporter" desactivee>
        <button type="button">D</button>
      </Infobulle>,
    )
    expect(screen.getByRole('button', { name: 'D' })).not.toHaveAttribute('data-state')
  })
})
