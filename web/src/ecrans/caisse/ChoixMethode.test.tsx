import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { MoyenBoutique } from '@/api/types'
import { queryClient } from '@/lib/queryClient'
import { ChoixMethode, type MoyensDisponibles } from './ChoixMethode'

const avec = (noeud: ReactNode) => render(<QueryClientProvider client={queryClient}>{noeud}</QueryClientProvider>)

const ORANGE: MoyenBoutique = {
  ulid: '01MOYEN0000000000000000002',
  nom: 'Orange Money',
  type: 'numero',
  couleur: 'orange',
  instructions_fr: null,
  instructions_en: null,
  active: true,
  valeur: '+2250708091011',
}

const moyens = (pays: MoyenBoutique[]): MoyensDisponibles => ({ lightning: true, lightningRaison: null, paytech: false, wave_manuel: false, pays })

describe('Caisse : choix du moyen de paiement avec les moyens du pays', () => {
  it('propose chaque moyen du pays activé et transmet son identifiant', async () => {
    const onChoisir = vi.fn()
    avec(<ChoixMethode ouvert onFermer={() => {}} montant={8500} sats={null} moyens={moyens([ORANGE])} enCours={false} erreur={null} onChoisir={onChoisir} />)
    fireEvent.click(await screen.findByRole('button', { name: /Orange Money/ }, { timeout: 5000 }))
    expect(onChoisir).toHaveBeenCalledWith('moyen_pays', undefined, ORANGE.ulid)
  })

  it('Sénégal sans moyen du pays : rien de plus que le bitcoin (comportement inchangé)', async () => {
    avec(<ChoixMethode ouvert onFermer={() => {}} montant={8500} sats={null} moyens={moyens([])} enCours={false} erreur={null} onChoisir={() => {}} />)
    expect(await screen.findByRole('button', { name: /Bitcoin/ }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Orange Money/ })).not.toBeInTheDocument()
  })
})
