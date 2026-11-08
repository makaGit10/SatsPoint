import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Utilisateur } from '@/api/types'
import { useAuth } from '@/auth/store'
import { abonnerCanaux, EVENEMENT, type CanalMinimal, type EchoMinimal } from './abonnements'
import { nombreEcouteurs } from './signaux'
import { DELAI_REGROUPEMENT, DELAI_SAISIE, useDonneesEnDirect } from './useDonneesEnDirect'
import { reinitialiserSaisie, useSaisieEnCours } from './useSaisieEnCours'

/** Faux Echo : mémorise les écouteurs par canal et permet d'émettre. */
class FauxEcho implements EchoMinimal {
  ecouteurs = new Map<string, Map<string, Set<(d: unknown) => void>>>()
  quittes: string[] = []

  private canal(nom: string): CanalMinimal {
    if (!this.ecouteurs.has(nom)) this.ecouteurs.set(nom, new Map())
    const evenements = this.ecouteurs.get(nom)!
    return {
      listen: (ev, cb) => {
        if (!evenements.has(ev)) evenements.set(ev, new Set())
        evenements.get(ev)!.add(cb)
      },
      stopListening: (ev, cb) => {
        if (cb) evenements.get(ev)?.delete(cb)
        else evenements.delete(ev)
      },
    }
  }
  private(nom: string) {
    return this.canal(nom)
  }
  channel(nom: string) {
    return this.canal(nom)
  }
  leave(nom: string) {
    this.quittes.push(nom)
    this.ecouteurs.delete(nom)
  }
  emettre(nom: string, donnees: unknown) {
    for (const cb of this.ecouteurs.get(nom)?.get(EVENEMENT) ?? []) cb(donnees)
  }
}

const MOI: Utilisateur = {
  ulid: 'MOI',
  nom: 'Awa',
  email: 'awa@test',
  telephone: null,
  role_plateforme: null,
  preferences: { locale: 'fr', langue_audio: 'wo', theme: 'auto', aide_vocale: true },
  boutique: { ulid: 'B1', nom: 'Boutique', ville: 'Dakar', devise: 'XOF', role: 'proprietaire', configuration: { wallet: true, paytech: false, paiement_test: false } },
}

let visibilite: DocumentVisibilityState = 'visible'

function signal(rubrique: string, auteur: string | null = 'AUTRE') {
  return { rubrique, auteur, horodatage: '2026-11-08T12:00:00Z' }
}

describe('useDonneesEnDirect', () => {
  let echo: FauxEcho
  let desabonner: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    visibilite = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilite })
    useAuth.getState().definir(MOI)
    reinitialiserSaisie()
    echo = new FauxEcho()
    desabonner = abonnerCanaux(echo, { boutiqueUlid: 'B1', utilisateurUlid: 'MOI' })
  })

  afterEach(() => {
    desabonner()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it("abonne les canaux boutique, user et plateforme et émet l'événement unique", () => {
    expect([...echo.ecouteurs.keys()]).toEqual(['boutique.B1', 'user.MOI', 'plateforme'])
    expect(echo.ecouteurs.get('boutique.B1')?.has(EVENEMENT)).toBe(true)
  })

  it("recharge une seule fois, ~800 ms après le signal d'une autre personne", () => {
    const recharger = vi.fn()
    renderHook(() => useDonneesEnDirect(['ventes'], recharger))

    act(() => echo.emettre('boutique.B1', signal('ventes')))
    expect(recharger).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(DELAI_REGROUPEMENT - 1))
    expect(recharger).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(recharger).toHaveBeenCalledTimes(1)
  })

  it('ignore ses propres modifications', () => {
    const recharger = vi.fn()
    renderHook(() => useDonneesEnDirect(['ventes'], recharger))
    act(() => echo.emettre('boutique.B1', signal('ventes', 'MOI')))
    act(() => vi.advanceTimersByTime(5000))
    expect(recharger).not.toHaveBeenCalled()
  })

  it("ignore les rubriques qu'il n'écoute pas", () => {
    const recharger = vi.fn()
    renderHook(() => useDonneesEnDirect(['ventes'], recharger))
    act(() => echo.emettre('boutique.B1', signal('articles')))
    act(() => vi.advanceTimersByTime(5000))
    expect(recharger).not.toHaveBeenCalled()
  })

  it('regroupe plusieurs signaux rapprochés en un seul rechargement', () => {
    const recharger = vi.fn()
    renderHook(() => useDonneesEnDirect(['ventes', 'paiements'], recharger))
    act(() => {
      echo.emettre('boutique.B1', signal('ventes'))
      vi.advanceTimersByTime(200)
      echo.emettre('boutique.B1', signal('paiements'))
      vi.advanceTimersByTime(200)
      echo.emettre('boutique.B1', signal('ventes'))
    })
    act(() => vi.advanceTimersByTime(DELAI_REGROUPEMENT))
    expect(recharger).toHaveBeenCalledTimes(1)
    // Un signal après la fenêtre déclenche un nouveau rechargement.
    act(() => echo.emettre('boutique.B1', signal('ventes')))
    act(() => vi.advanceTimersByTime(DELAI_REGROUPEMENT))
    expect(recharger).toHaveBeenCalledTimes(2)
  })

  it("attend que l'onglet redevienne visible", () => {
    const recharger = vi.fn()
    renderHook(() => useDonneesEnDirect(['ventes'], recharger))
    visibilite = 'hidden'
    act(() => echo.emettre('boutique.B1', signal('ventes')))
    act(() => vi.advanceTimersByTime(10_000))
    expect(recharger).not.toHaveBeenCalled()
    // D'autres signaux pendant la période cachée ne s'accumulent pas.
    act(() => echo.emettre('boutique.B1', signal('ventes')))
    act(() => vi.advanceTimersByTime(10_000))
    expect(recharger).not.toHaveBeenCalled()

    visibilite = 'visible'
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(recharger).toHaveBeenCalledTimes(1)
  })

  it('ne recharge jamais pendant une saisie (champ non vide) et reprend après', () => {
    const recharger = vi.fn()
    const champ = document.createElement('input')
    document.body.appendChild(champ)
    champ.value = 'bazin'
    champ.focus()
    expect(document.activeElement).toBe(champ)

    renderHook(() => useDonneesEnDirect(['articles'], recharger))
    act(() => echo.emettre('boutique.B1', signal('articles')))
    act(() => vi.advanceTimersByTime(DELAI_REGROUPEMENT + DELAI_SAISIE * 2))
    expect(recharger).not.toHaveBeenCalled()

    champ.blur()
    act(() => vi.advanceTimersByTime(DELAI_SAISIE))
    expect(recharger).toHaveBeenCalledTimes(1)
  })

  it('respecte le verrou explicite useSaisieEnCours', () => {
    const recharger = vi.fn()
    const verrou = renderHook(() => useSaisieEnCours(true))
    renderHook(() => useDonneesEnDirect(['ventes'], recharger))
    act(() => echo.emettre('boutique.B1', signal('ventes')))
    act(() => vi.advanceTimersByTime(DELAI_REGROUPEMENT + DELAI_SAISIE))
    expect(recharger).not.toHaveBeenCalled()
    verrou.unmount()
    act(() => vi.advanceTimersByTime(DELAI_SAISIE))
    expect(recharger).toHaveBeenCalledTimes(1)
  })

  it('utilise toujours la dernière fonction de rechargement', () => {
    const premiere = vi.fn()
    const seconde = vi.fn()
    const { rerender } = renderHook(({ fn }) => useDonneesEnDirect(['ventes'], fn), { initialProps: { fn: premiere } })
    rerender({ fn: seconde })
    act(() => echo.emettre('boutique.B1', signal('ventes')))
    act(() => vi.advanceTimersByTime(DELAI_REGROUPEMENT))
    expect(premiere).not.toHaveBeenCalled()
    expect(seconde).toHaveBeenCalledTimes(1)
  })

  it('reçoit aussi les signaux des canaux user et plateforme', () => {
    const recharger = vi.fn()
    renderHook(() => useDonneesEnDirect(['preferences', 'audios'], recharger))
    act(() => echo.emettre('user.MOI', signal('preferences', 'AUTRE-APPAREIL')))
    act(() => echo.emettre('plateforme', signal('audios', null)))
    act(() => vi.advanceTimersByTime(DELAI_REGROUPEMENT))
    expect(recharger).toHaveBeenCalledTimes(1)
  })

  it('se désabonne proprement au démontage et au départ des canaux', () => {
    const avant = nombreEcouteurs()
    const { unmount } = renderHook(() => useDonneesEnDirect(['ventes'], vi.fn()))
    expect(nombreEcouteurs()).toBe(avant + 1)
    unmount()
    expect(nombreEcouteurs()).toBe(avant)

    desabonner()
    expect(echo.quittes).toEqual(['boutique.B1', 'user.MOI', 'plateforme'])
    desabonner = () => {}
  })
})
