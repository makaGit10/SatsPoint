import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Article } from '@/api/types'
import { chargerPaquet } from '@/i18n'
import { queryClient } from '@/lib/queryClient'
import { useVoix } from '@/voix/store'
import { BandeArticles, GrilleArticles, Panier } from './Articles'

const avec = (noeud: ReactNode) => render(<QueryClientProvider client={queryClient}>{noeud}</QueryClientProvider>)

const article = (champs: Partial<Article>): Article => ({
  ulid: `01ART${Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(21, '0')}`,
  nom: null,
  prix_xof: 100,
  categorie: null,
  couleur: '#CA8A04',
  sku: null,
  actif: true,
  position: 0,
  pictogramme: null,
  photo_url: null,
  voix_url: null,
  ...champs,
})

beforeAll(async () => {
  await chargerPaquet('articles')
  useVoix.setState({ activee: false })
})

describe('Caisse : grille d\'articles utilisable sans lire', () => {
  it('montre le prix en gros chiffres et nomme un article sans nom écrit par son pictogramme', () => {
    const pain = article({ pictogramme: 'pain', prix_xof: 1500 })
    avec(<GrilleArticles articles={[pain]} onAjouter={() => {}} />)
    const tuile = screen.getByRole('button', { name: /^Pain, 1\s500\sFCFA$/ })
    expect(within(tuile).getByText(/1\s500/)).toHaveClass('font-extrabold')
    expect(tuile.querySelector('svg')).not.toBeNull() // pictogramme dessiné
  })

  it('affiche la photo quand l\'article en a une', () => {
    const bissap = article({ nom: 'Bissap', photo_url: '/api/v1/articles/x/photo?v=abc' })
    const { container } = avec(<GrilleArticles articles={[bissap]} onAjouter={() => {}} />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/v1/articles/x/photo?v=abc')
  })

  it('un toucher ajoute l\'article ; le haut-parleur joue le nom enregistré SANS ajouter au panier', () => {
    const onAjouter = vi.fn()
    const lire = vi.spyOn(HTMLMediaElement.prototype, 'play')
    const riz = article({ pictogramme: 'riz', voix_url: '/api/v1/articles/r/voix?v=1' })
    avec(<GrilleArticles articles={[riz]} onAjouter={onAjouter} />)

    fireEvent.click(screen.getByRole('button', { name: /Écouter le nom : Riz/ }))
    expect(onAjouter).not.toHaveBeenCalled()
    expect(lire).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^Riz, 100/ }))
    expect(onAjouter).toHaveBeenCalledWith(riz)
  })

  it('pas de nom enregistré, aide vocale coupée : aucun haut-parleur muet', () => {
    avec(<GrilleArticles articles={[article({ nom: 'Sucre', pictogramme: 'sucre' })]} onAjouter={() => {}} />)
    expect(screen.queryByRole('button', { name: /Écouter le nom/ })).not.toBeInTheDocument()
  })

  it('affiche la quantité déjà prise sur la tuile, et la vignette dans le panier', () => {
    const the = article({ pictogramme: 'the', prix_xof: 200 })
    const panier = [{ article: the, quantite: 3 }]
    avec(
      <>
        <GrilleArticles articles={[the]} panier={panier} onAjouter={() => {}} />
        <Panier panier={panier} onChanger={() => {}} onVider={() => {}} />
      </>,
    )
    expect(screen.getByRole('button', { name: /Thé, ataya, 200\sFCFA — Quantité 3/ })).toBeInTheDocument()
    const ligne = within(screen.getByRole('list', { name: 'Panier' })).getByText('Thé, ataya').closest('li')!
    expect(ligne.querySelector('svg')).not.toBeNull()
  })
})

describe('Caisse mobile : bande d\'articles en images', () => {
  it('une tuile par article (image + prix), un toucher ajoute au panier, la quantité prise est annoncée', () => {
    const the = article({ pictogramme: 'the', prix_xof: 200 })
    const riz = article({ pictogramme: 'riz', prix_xof: 750 })
    const onAjouter = vi.fn()
    avec(<BandeArticles articles={[the, riz]} panier={[{ article: riz, quantite: 2 }]} onAjouter={onAjouter} />)
    const bande = screen.getByRole('list')
    expect(bande).toHaveAttribute('data-bande-articles')
    expect(within(bande).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /^Thé, ataya, 200\sFCFA$/ }))
    expect(onAjouter).toHaveBeenCalledWith(the)
    expect(screen.getByRole('button', { name: /750\sFCFA — .* 2$/ })).toBeInTheDocument()
  })
})
