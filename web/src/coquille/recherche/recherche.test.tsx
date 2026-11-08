import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '@/api/recherche'
import type { GroupeRecherche, Utilisateur } from '@/api/types'
import { useAuth } from '@/auth/store'
import { chargerPaquet } from '@/i18n'
import { PanneauRecherche } from './PanneauRecherche'
import { chercherPages, deplacer, fusionnerGroupes, pagesAutorisees } from './resultats'
import { DELAI_RECHERCHE } from './useRecherche'

vi.mock('@/api/recherche', async (importer) => {
  const original = await importer<typeof import('@/api/recherche')>()
  return { ...original, rechercher: vi.fn(), chargerRecentes: vi.fn(), memoriserRecherche: vi.fn(), effacerRecentes: vi.fn() }
})

const rechercher = vi.mocked(api.rechercher)
const chargerRecentes = vi.mocked(api.chargerRecentes)
const memoriserRecherche = vi.mocked(api.memoriserRecherche)
const effacerRecentes = vi.mocked(api.effacerRecentes)

const PROPRIO: Utilisateur = {
  ulid: 'U1',
  nom: 'Awa',
  email: 'a@b.c',
  telephone: null,
  role_plateforme: null,
  preferences: { locale: 'fr', langue_audio: null, theme: 'clair', aide_vocale: false },
  boutique: { ulid: 'B1', nom: 'Démo', ville: 'Dakar', devise: 'XOF', role: 'proprietaire', configuration: { wallet: true, paytech: true, paiement_test: true } },
}

const GROUPES: GroupeRecherche[] = [
  { rubrique: 'articles', resultats: [{ titre: 'Bazin riche', sous_titre: '15 000 FCFA · Tissus', url: '/articles?article=A1', score: 90 }] },
  { rubrique: 'ventes', resultats: [{ titre: 'V-000142', sous_titre: '2 m de bazin', url: '/ventes?vente=V142', score: 55 }] },
]

function Emplacement() {
  const l = useLocation()
  return <p data-testid="emplacement">{`${l.pathname}${l.search}`}</p>
}

function rendre(onFermer = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/caisse']}>
        <Routes>
          <Route path="*" element={<><PanneauRecherche onFermer={onFermer} /><Emplacement /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onFermer, champ: screen.getByRole('combobox') }
}

async function taper(champ: HTMLElement, valeur: string) {
  fireEvent.change(champ, { target: { value: valeur } })
  await act(async () => {
    vi.advanceTimersByTime(DELAI_RECHERCHE + 10)
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeAll(async () => {
  await chargerPaquet('extras')
})

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  useAuth.getState().definir(PROPRIO)
  chargerRecentes.mockResolvedValue({ recentes: ['bazin', 'V-000142', 'wave', 'thé', 'cinquième'] })
  rechercher.mockResolvedValue({ groupes: GROUPES })
  memoriserRecherche.mockResolvedValue(null)
  effacerRecentes.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('recherche globale — avant la frappe', () => {
  it('affiche les 4 dernières recherches, navigables au clavier, et effaçables', async () => {
    const { champ } = rendre()
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['bazin', 'V-000142', 'wave', 'thé'])
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(champ, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    expect(champ).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]!.id)
    fireEvent.keyDown(champ, { key: 'ArrowUp' })
    fireEvent.keyDown(champ, { key: 'ArrowUp' })
    expect(screen.getAllByRole('option')[3]).toHaveAttribute('aria-selected', 'true')
    // Entrée sur une récente : elle remplit le champ.
    fireEvent.keyDown(champ, { key: 'Enter' })
    expect(champ).toHaveValue('thé')
  })

  it('efface les dernières recherches', async () => {
    rendre()
    await screen.findAllByRole('option')
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les dernières recherches' }))
    expect(effacerRecentes).toHaveBeenCalledTimes(1)
    // Les notifications de TanStack Query sont groupées sur une minuterie.
    await act(async () => {
      vi.advanceTimersByTime(20)
    })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})

describe('recherche globale — pendant la frappe', () => {
  it('attend 150 ms, annule la requête précédente, groupe par rubrique et surligne le terme', async () => {
    const { champ } = rendre()
    fireEvent.change(champ, { target: { value: 'ba' } })
    fireEvent.change(champ, { target: { value: 'baz' } })
    expect(rechercher).not.toHaveBeenCalled()
    await taper(champ, 'baz')
    expect(rechercher).toHaveBeenCalledTimes(1)
    expect(rechercher.mock.calls[0]![0]).toBe('baz')
    const articles = await screen.findByRole('region', { name: 'Articles' })
    expect(within(articles).getByText('Baz', { selector: 'mark' })).toBeInTheDocument()
    // Rubriques triées par pertinence : Articles (90) avant Ventes (55).
    const rubriques = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(rubriques.indexOf('Articles')).toBeLessThan(rubriques.indexOf('Ventes'))
  })

  it('↓ puis Entrée ouvre le résultat et mémorise la recherche', async () => {
    const { champ, onFermer } = rendre()
    await taper(champ, 'baz')
    await screen.findByRole('region', { name: 'Ventes' })
    fireEvent.keyDown(champ, { key: 'ArrowDown' })
    fireEvent.keyDown(champ, { key: 'Enter' })
    expect(memoriserRecherche).toHaveBeenCalledWith('baz')
    expect(onFermer).toHaveBeenCalled()
    expect(screen.getByTestId('emplacement')).toHaveTextContent('/ventes?vente=V142')
  })

  it('Échap ferme la fenêtre', async () => {
    const { champ, onFermer } = rendre()
    fireEvent.keyDown(champ, { key: 'Escape' })
    expect(onFermer).toHaveBeenCalled()
  })

  it('sans réseau, les pages et réglages restent trouvables', async () => {
    rechercher.mockRejectedValue(Object.assign(new Error('réseau'), { reseau: true }))
    const { champ } = rendre()
    await taper(champ, 'paytech')
    expect(await screen.findByRole('region', { name: 'Pages et réglages' })).toBeInTheDocument()
    expect(screen.getByText(/Hors connexion/)).toBeInTheDocument()
  })
})

describe('fusion et index local', () => {
  const t = (c: string) => ({ 'nav.portefeuille': 'Portefeuille', 'recherche.mots.portefeuille': 'wallet lightning sats', 'nav.equipe': 'Équipe' })[c] ?? c

  it('les pages respectent les droits du rôle (un caissier ne trouve pas l’équipe ni le portefeuille)', () => {
    const caissier = { ...PROPRIO, boutique: { ...PROPRIO.boutique!, role: 'caissier' as const } }
    const urls = pagesAutorisees(caissier).map((p) => p.url)
    expect(urls).toContain('/caisse')
    expect(urls).not.toContain('/equipe')
    expect(urls).not.toContain('/portefeuille')
  })

  it('tolère accents et fautes, dédoublonne et garde 5 résultats par rubrique', () => {
    expect(chercherPages(pagesAutorisees(PROPRIO), 'walet', t)[0]?.url).toBe('/portefeuille')
    const beaucoup: GroupeRecherche = { rubrique: 'ventes', resultats: Array.from({ length: 8 }, (_, i) => ({ titre: `V-${i}`, sous_titre: null, url: `/v/${i}`, score: i })) }
    const g = fusionnerGroupes([beaucoup, { rubrique: 'pages', resultats: [{ titre: 'Portefeuille', sous_titre: null, url: '/portefeuille', score: 99 }] }], [{ titre: 'Portefeuille', sous_titre: null, url: '/portefeuille', score: 60 }])
    expect(g[0]?.rubrique).toBe('pages')
    expect(g[0]?.resultats).toHaveLength(1)
    expect(g[1]?.resultats.map((r) => r.score)).toEqual([7, 6, 5, 4, 3])
  })

  it('↑ ↓ circulent en boucle', () => {
    expect(deplacer(-1, 3, 1)).toBe(0)
    expect(deplacer(2, 3, 1)).toBe(0)
    expect(deplacer(0, 3, -1)).toBe(2)
    expect(deplacer(0, 0, 1)).toBe(-1)
  })
})
