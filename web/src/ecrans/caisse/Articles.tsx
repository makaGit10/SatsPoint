import { Minus, Package, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Article } from '@/api/types'
import { totalPanier, type LignePanier } from './panier'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { EtatVide } from '@/composants/EtatVide'
import { cn } from '@/lib/cn'
import { classesTuile } from '@/lib/couleursArticles'
import { formaterFCFA } from '@/lib/format'
import { vibrer } from '@/lib/vibrer'

/** Grille de tuiles colorées (P1) : un toucher = un article dans le panier. */
export function GrilleArticles({ articles, onAjouter, className }: { articles: Article[]; onAjouter: (a: Article) => void; className?: string }) {
  const { t } = useTranslation()
  if (articles.length === 0) return <EtatVide ton="neutre" icone={<Package />} titre={t('articles.vide.titre')} texte={t('articles.vide.texte')} className="py-6" />
  return (
    <ul className={cn('grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4', className)} aria-label={t('caisse.articles')}>
      {articles.map((a) => (
        <li key={a.ulid}>
          <button
            type="button"
            onClick={() => {
              vibrer(10)
              onAjouter(a)
            }}
            className={cn(
              'flex h-[72px] w-full flex-col justify-between rounded-lg p-2 text-left transition-transform duration-100 active:scale-[0.97]',
              classesTuile(a.couleur),
            )}
          >
            <span className="line-clamp-2 text-sm leading-tight font-medium">{a.nom}</span>
            <span className="text-xs font-semibold tabulaire">{formaterFCFA(a.prix_xof)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Panier simple : quantités, total, vider. */
export function Panier({ panier, onChanger, onVider, className }: { panier: LignePanier[]; onChanger: (ulid: string, delta: number) => void; onVider: () => void; className?: string }) {
  const { t } = useTranslation()
  if (panier.length === 0) return <p className={cn('text-center text-sm text-texte-3', className)}>{t('caisse.panierVide')}</p>
  return (
    <div className={cn('flex flex-col', className)}>
      <ul className="divide-y divide-bordure" aria-label={t('caisse.panier')}>
        {panier.map((l) => (
          <li key={l.article.ulid} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-sm text-texte">{l.article.nom}</span>
            <div className="flex items-center gap-0.5">
              <BoutonIcone taille="sm" libelle={t('caisse.retirer')} icone={<Minus />} voix="caisse.retirer" onClick={() => onChanger(l.article.ulid, -1)} sansInfobulle />
              <span className="w-6 text-center text-sm font-medium text-texte tabulaire" aria-label={t('caisse.quantite')}>
                {l.quantite}
              </span>
              <BoutonIcone taille="sm" libelle={t('commun.ajouter')} icone={<Plus />} voix="commun.ajouter" onClick={() => onChanger(l.article.ulid, 1)} sansInfobulle />
            </div>
            <span className="w-24 text-right text-sm font-medium text-texte tabulaire">{formaterFCFA(l.article.prix_xof * l.quantite)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center justify-between border-t border-bordure pt-2">
        <BoutonIcone taille="sm" libelle={t('caisse.viderPanier')} icone={<Trash2 />} variante="danger" voix="caisse.viderPanier" onClick={onVider} />
        <p className="text-sm text-texte-2">
          {t('caisse.total')} <span className="ml-1 font-semibold text-texte tabulaire">{formaterFCFA(totalPanier(panier))}</span>
        </p>
      </div>
    </div>
  )
}
