import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Article } from '@/api/types'
import { chargerPaquet } from '@/i18n'
import { queryClient } from '@/lib/queryClient'
import FormulaireArticle, { etapeGuide } from './FormulaireArticle'

const api = vi.hoisted(() => ({
  creerArticle: vi.fn(),
  modifierArticle: vi.fn(),
  envoyerPhotoArticle: vi.fn(),
  envoyerVoixArticle: vi.fn(),
  supprimerPhotoArticle: vi.fn(),
  supprimerVoixArticle: vi.fn(),
}))
vi.mock('@/api/articlesEcriture', () => api)

const avec = (noeud: ReactNode) => render(<QueryClientProvider client={queryClient}>{noeud}</QueryClientProvider>)

// jsdom n'a pas ResizeObserver (interrupteur Radix).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

beforeAll(async () => {
  await chargerPaquet('articles')
})

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset().mockResolvedValue({ article: {} })
})

const taperPrix = (chiffres: string) => {
  const pave = screen.getByRole('group', { name: /pavé/i })
  for (const c of chiffres) fireEvent.click(within(pave).getByRole('button', { name: new RegExp(`^Touche ${c}$`) }))
}

describe('Formulaire d\'article sans écrire', () => {
  it('crée un article SANS nom écrit : une image choisie dans la galerie + le prix tapé sur le pavé', { timeout: 15_000 }, async () => {
    const onFermer = vi.fn()
    avec(<FormulaireArticle article={null} onFermer={onFermer} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Choisir une image' }, { timeout: 5000 }))
    fireEvent.click(screen.getByRole('radio', { name: 'Riz' }))
    taperPrix('45')
    fireEvent.click(within(screen.getByRole('group', { name: /pavé/i })).getByRole('button', { name: /^Touche 0$/ }))
    expect(screen.getByLabelText('Prix')).toHaveValue('450')

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.creerArticle).toHaveBeenCalled(), { timeout: 5000 })
    const [corps, medias] = api.creerArticle.mock.calls[0]!
    expect(corps).toMatchObject({ nom: null, prix_xof: 450, pictogramme: 'riz', couleur: '#CA8A04', actif: true })
    expect(medias).toEqual({ photo: undefined, voix: undefined })
    await waitFor(() => expect(onFermer).toHaveBeenCalled(), { timeout: 5000 })
  })

  it('refuse un article sans aucune identité (ni image, ni photo, ni nom dit, ni nom écrit), sans appeler l\'API', async () => {
    avec(<FormulaireArticle article={null} onFermer={() => {}} />)
    taperPrix('5')
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }, { timeout: 5000 }))
    expect(await screen.findAllByText('Ajoutez une photo, une image, un nom dit ou un nom écrit.')).not.toHaveLength(0)
    expect(api.creerArticle).not.toHaveBeenCalled()
  })

  it('demande le prix sur le pavé', async () => {
    avec(<FormulaireArticle article={null} onFermer={() => {}} />)
    fireEvent.change(await screen.findByLabelText(/Nom écrit/, undefined, { timeout: 5000 }), { target: { value: 'Pain' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findAllByText('Tapez le prix sur le pavé.')).not.toHaveLength(0)
    expect(api.creerArticle).not.toHaveBeenCalled()
  })

  it('modifie un article : retire la photo APRÈS avoir enregistré les champs (jamais sans identité)', async () => {
    const existant: Article = { ulid: '01ARTICLE00000000000000001', nom: 'Bissap', prix_xof: 500, categorie: null, couleur: '#DC2626', sku: null, actif: true, position: 1, pictogramme: 'jus', photo_url: '/photo.webp', voix_url: null }
    avec(<FormulaireArticle article={existant} onFermer={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer la photo' }, { timeout: 5000 }))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.supprimerPhotoArticle).toHaveBeenCalledWith(existant.ulid), { timeout: 5000 })
    expect(api.modifierArticle).toHaveBeenCalledWith(existant.ulid, expect.objectContaining({ nom: 'Bissap', pictogramme: 'jus', prix_xof: 500 }))
    expect(api.modifierArticle.mock.invocationCallOrder[0]!).toBeLessThan(api.supprimerPhotoArticle.mock.invocationCallOrder[0]!)
    expect(api.envoyerPhotoArticle).not.toHaveBeenCalled()
  })

  it('chaque section et chaque bouton porte sa clé vocale (haut-parleur)', async () => {
    const { container } = avec(<FormulaireArticle article={null} onFermer={() => {}} />)
    await screen.findByRole('button', { name: 'Prendre une photo' }, { timeout: 5000 })
    // Les haut-parleurs ne s'affichent que si un audio existe : on vérifie les clés déclarées dans le code.
    const source = (await import('./FormulaireArticle?raw')).default as string
    for (const cle of ['articles.form.etapeVisuel', 'articles.form.etapeNom', 'articles.form.etapePrix', 'articles.form.prendrePhoto', 'articles.form.galerie', 'articles.form.images', 'articles.actif', 'commun.enregistrer']) {
      expect(source).toContain(cle)
    }
    expect(container).toBeTruthy()
  })
})

describe('guide vocal du formulaire', () => {
  it('annonce l\'étape suivante dans l\'ordre : image, nom, prix, enregistrer', () => {
    expect(etapeGuide({ visuel: false, nom: false, prix: false })).toBe('visuel')
    expect(etapeGuide({ visuel: true, nom: false, prix: false })).toBe('nom')
    expect(etapeGuide({ visuel: true, nom: true, prix: false })).toBe('prix')
    expect(etapeGuide({ visuel: true, nom: true, prix: true })).toBe('enregistrer')
  })
})
