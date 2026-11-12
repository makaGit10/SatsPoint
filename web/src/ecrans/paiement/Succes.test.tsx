import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render as rendre, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { chargerPaquet } from '@/i18n'
import { queryClient } from '@/lib/queryClient'
import { Succes } from './Succes'

// Textes de l'encaissement : paquet chargé à la demande avec l'écran de paiement.
beforeAll(() => chargerPaquet('paiement'))

const render = (ui: ReactElement) => rendre(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)

describe('écran de succès', () => {
  it('affiche le montant, les sats, le moyen, le n° et propose le reçu', async () => {
    const nouvelle = vi.fn()
    render(
      <Succes montant={15000} sats={23450} methode="lightning" operateur={null} numero="V-000142" boutique="Boutique Démo" recuUrl="/r/abc" alerte={null} onNouvelleVente={nouvelle} />,
    )
    expect(screen.getByText('Paiement reçu')).toBeInTheDocument()
    expect(screen.getByText('15 000 FCFA')).toBeInTheDocument()
    expect(screen.getByText(/23 450 sats · par Bitcoin/)).toBeInTheDocument()
    expect(screen.getByText('Vente V-000142')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Nouvelle vente/ }))
    expect(nouvelle).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Envoyer le reçu/ }))
    const whatsapp = await screen.findByRole('link', { name: /WhatsApp/ }, { timeout: 5000 })
    const href = whatsapp.getAttribute('href') ?? ''
    expect(href.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(href)).toContain('Votre reçu Boutique Démo (15 000 FCFA) : http://localhost:3000/r/abc')
    expect(screen.getByRole('link', { name: /SMS/ }).getAttribute('href')).toMatch(/^sms:\?body=/)
  })

  it('désactive l’envoi tant que le reçu n’est pas prêt et affiche l’alerte trop-perçu', async () => {
    render(<Succes montant={5000} sats={null} methode="paytech" operateur="wave" numero="V-000143" boutique="B" recuUrl={null} alerte="trop_percu" onNouvelleVente={() => {}} />)
    expect(screen.getByRole('button', { name: /Reçu en préparation/ })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Ce client a payé deux fois. Remboursez le second paiement de 5 000 FCFA hors application.')
    await waitFor(() => expect(screen.getByText(/par Mobile money · Wave/)).toBeInTheDocument())
  })
})
