import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErreurApi } from '@/api/client'
import type { ReponsePaiement } from '@/api/types'
import * as paiements from '@/api/paiements'
import { useAuth } from '@/auth/store'
import { queryClient } from '@/lib/queryClient'
import { emettreSignal } from '@/temps-reel/signaux'
import { DELAI_REGROUPEMENT } from '@/temps-reel/useDonneesEnDirect'
import { deriverEtat, useSuiviPaiement } from './useSuiviPaiement'

vi.mock('@/api/paiements', async (importer) => {
  const original = await importer<typeof import('@/api/paiements')>()
  return { ...original, lirePaiement: vi.fn(), verifierPaiement: vi.fn() }
})

const lirePaiement = vi.mocked(paiements.lirePaiement)
const verifierPaiement = vi.mocked(paiements.verifierPaiement)

function reponse(statutPaiement: ReponsePaiement['paiement']['statut'], statutVente: ReponsePaiement['vente']['statut'] = 'en_attente'): ReponsePaiement {
  return {
    paiement: {
      ulid: 'P1',
      methode: 'lightning',
      operateur: null,
      statut: statutPaiement,
      montant_xof: 15000,
      montant_sats: 23450,
      cours_xof_par_btc: 64_000_000,
      bolt11: 'lnbc234500n1demo',
      payment_hash_abrege: null,
      paytech: null,
      wave_lien: null,
      simule: true,
      cree_le: '2026-11-08T12:00:00Z',
      expire_le: '2026-11-08T12:05:00Z',
      regle_le: null,
    },
    vente: { ulid: 'V1', statut: statutVente, numero: 'V-000001' },
  }
}

const enveloppe = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>

describe('deriverEtat : le serveur fait foi', () => {
  it('vente payée → reussi, quelle que soit la tentative lue', () => {
    expect(deriverEtat(reponse('annule', 'payee'), null, false)).toBe('reussi')
    expect(deriverEtat(reponse('reussi', 'payee'), null, false)).toBe('reussi')
  })
  it('états de la tentative', () => {
    expect(deriverEtat(reponse('en_attente'), null, false)).toBe('en_attente')
    expect(deriverEtat(reponse('expire'), null, false)).toBe('expire')
    expect(deriverEtat(reponse('echoue'), null, false)).toBe('echoue')
    expect(deriverEtat(reponse('annule', 'annulee'), null, false)).toBe('annule')
  })
  it('erreurs', () => {
    expect(deriverEtat(undefined, new ErreurApi(404, null), false)).toBe('introuvable')
    expect(deriverEtat(undefined, new ErreurApi(500, null), false)).toBe('erreur')
    expect(deriverEtat(undefined, null, true)).toBe('chargement')
  })
})

describe('useSuiviPaiement', () => {
  beforeEach(() => {
    queryClient.clear()
    lirePaiement.mockReset()
    verifierPaiement.mockReset()
    useAuth.getState().definir({
      ulid: 'MOI',
      nom: 'Awa',
      email: 'awa@test',
      telephone: null,
      role_plateforme: null,
      preferences: { locale: 'fr', langue_audio: null, theme: 'auto', aide_vocale: false },
      boutique: { ulid: 'B1', nom: 'Boutique', ville: 'Dakar', devise: 'XOF', role: 'proprietaire', configuration: { wallet: true, paytech: true, paiement_test: true } },
    })
  })
  afterEach(() => queryClient.clear())

  it('lit le statut, puis relit toutes les N ms (secours) tant que la tentative est en attente', async () => {
    lirePaiement.mockResolvedValue(reponse('en_attente'))
    const { result } = renderHook(() => useSuiviPaiement('P1', { intervalle: 40 }), { wrapper: enveloppe })
    expect(result.current.etat).toBe('chargement')
    await waitFor(() => expect(result.current.etat).toBe('en_attente'))
    await waitFor(() => expect(lirePaiement.mock.calls.length).toBeGreaterThanOrEqual(3), { timeout: 2000 })
  })

  it('ne décide jamais « payé » : c’est la relecture après le signal temps réel qui le dit', async () => {
    lirePaiement.mockResolvedValue(reponse('en_attente'))
    const { result } = renderHook(() => useSuiviPaiement('P1', { intervalle: 60_000 }), { wrapper: enveloppe })
    await waitFor(() => expect(result.current.etat).toBe('en_attente'))
    const appelsAvant = lirePaiement.mock.calls.length

    // Le serveur constate le règlement (auteur inconnu : le client qui paie) et émet le signal `paiements`.
    lirePaiement.mockResolvedValue(reponse('reussi', 'payee'))
    act(() => emettreSignal({ rubrique: 'paiements', auteur: null, horodatage: new Date().toISOString(), canal: 'boutique.B1' }))
    // Rien avant la fenêtre de regroupement (~800 ms) : l'état reste « en attente ».
    expect(result.current.etat).toBe('en_attente')
    await waitFor(() => expect(lirePaiement.mock.calls.length).toBeGreaterThan(appelsAvant), { timeout: DELAI_REGROUPEMENT + 1500 })
    await waitFor(() => expect(result.current.etat).toBe('reussi'))
    expect(result.current.vente?.statut).toBe('payee')
  })

  it('arrête la vérification de secours une fois la tentative expirée', async () => {
    lirePaiement.mockResolvedValue(reponse('expire'))
    const { result } = renderHook(() => useSuiviPaiement('P1', { intervalle: 30 }), { wrapper: enveloppe })
    await waitFor(() => expect(result.current.etat).toBe('expire'))
    const appels = lirePaiement.mock.calls.length
    await new Promise((r) => setTimeout(r, 150))
    expect(lirePaiement.mock.calls.length).toBe(appels)
  })

  it('verifier() force la consultation et met le cache à jour', async () => {
    lirePaiement.mockResolvedValue(reponse('en_attente'))
    verifierPaiement.mockResolvedValue(reponse('reussi', 'payee'))
    const { result } = renderHook(() => useSuiviPaiement('P1', { intervalle: 60_000 }), { wrapper: enveloppe })
    await waitFor(() => expect(result.current.etat).toBe('en_attente'))
    await act(async () => {
      await result.current.verifier()
    })
    expect(verifierPaiement).toHaveBeenCalledWith('P1')
    await waitFor(() => expect(result.current.etat).toBe('reussi'))
  })

  it('404 → introuvable', async () => {
    lirePaiement.mockRejectedValue(new ErreurApi(404, { message: 'Introuvable' }))
    const { result } = renderHook(() => useSuiviPaiement('INCONNU'), { wrapper: enveloppe })
    await waitFor(() => expect(result.current.etat).toBe('introuvable'))
  })
})
