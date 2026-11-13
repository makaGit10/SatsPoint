import { Minus, Package, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Article } from '@/api/types'
import { totalPanier, type LignePanier } from './panier'
import { libelleArticle } from '@/ecrans/articles/libelle'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { EtatVide } from '@/composants/EtatVide'
import { EcouterArticle } from '@/ecrans/articles/EcouterArticle'
import { VignetteArticle } from '@/ecrans/articles/VignetteArticle'
import { cn } from '@/lib/cn'
import { formaterFCFA, formaterNombre } from '@/lib/format'
import { vibrer } from '@/lib/vibrer'

/**
 * Grille d'articles rapides (P1) : la photo ou le pictogramme en grand, le prix en gros chiffres, le nom écrit
 * (s'il existe) en petit, et un haut-parleur qui DIT le nom — un commerçant qui ne lit pas reconnaît ses articles.
 * Un toucher = un article dans le panier ; la quantité déjà prise s'affiche sur la tuile.
 */
export function GrilleArticles({ articles, onAjouter, panier = [], className }: { articles: Article[]; onAjouter: (a: Article) => void; panier?: LignePanier[]; className?: string }) {
  const { t } = useTranslation()
  if (articles.length === 0) return <EtatVide ton="neutre" icone={<Package />} titre={t('articles.vide.titre')} texte={t('articles.vide.texte')} className="py-6" />
  const quantites = new Map(panier.map((l) => [l.article.ulid, l.quantite]))
  return (
    <ul className={cn('grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4', className)} aria-label={t('caisse.articles')}>
      {articles.map((a) => {
        const libelle = libelleArticle(a, t)
        const quantite = quantites.get(a.ulid) ?? 0
        const nom = a.nom?.trim()
        return (
          <li key={a.ulid} className="relative" data-article={a.ulid}>
            <button
              type="button"
              onClick={() => {
                vibrer(10)
                onAjouter(a)
              }}
              aria-label={`${libelle}, ${formaterFCFA(a.prix_xof)}${quantite ? ` — ${t('caisse.quantite')} ${quantite}` : ''}`}
              className={cn(
                'flex w-full flex-col overflow-hidden rounded-xl border bg-surface text-left shadow-xs transition-transform duration-100 active:scale-[0.97]',
                quantite ? 'border-accent ring-2 ring-accent/40' : 'border-bordure',
              )}
            >
              <VignetteArticle article={a} taille="plein" className="h-[68px] md:h-16" />
              <span className="flex min-h-11 flex-col justify-center px-2 py-1">
                {nom && <span className="line-clamp-1 text-[11px] leading-tight font-medium text-texte-2">{nom}</span>}
                <span className="text-[17px] leading-tight font-extrabold text-texte tabulaire">
                  {formaterNombre(a.prix_xof)}
                  <span className="ml-0.5 text-[10px] font-bold text-texte-3">F</span>
                </span>
              </span>
            </button>
            <EcouterArticle article={a} className="absolute top-1 right-1" />
            {quantite > 0 && (
              <span className="pointer-events-none absolute top-1 left-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-sur-accent tabulaire shadow-xs" aria-hidden="true">
                {quantite}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Panier simple : vignette, quantités, total, vider. */
/**
 * Mobile : bande d'articles au-dessus du pavé, défilable au doigt — l'image et le prix, un toucher = un article dans
 * le panier, le haut-parleur dit le nom. Vendre sans lire ni taper, sans ouvrir de fenêtre.
 */
export function BandeArticles({ articles, onAjouter, panier = [], className }: { articles: Article[]; onAjouter: (a: Article) => void; panier?: LignePanier[]; className?: string }) {
  const { t } = useTranslation()
  const quantites = new Map(panier.map((l) => [l.article.ulid, l.quantite]))
  return (
    <ul
      className={cn('-mx-5 flex snap-x scroll-px-5 gap-2.5 overflow-x-auto px-5 pt-2 pb-1 [scrollbar-width:none]', className)}
      aria-label={t('caisse.articles')}
      data-bande-articles
    >
      {articles.map((a) => {
        const quantite = quantites.get(a.ulid) ?? 0
        return (
          <li key={a.ulid} className="relative w-[78px] shrink-0 snap-start" data-article={a.ulid}>
            <button
              type="button"
              onClick={() => {
                vibrer(10)
                onAjouter(a)
              }}
              aria-label={`${libelleArticle(a, t)}, ${formaterFCFA(a.prix_xof)}${quantite ? ` — ${t('caisse.quantite')} ${quantite}` : ''}`}
              className={cn(
                'flex w-full flex-col overflow-hidden rounded-xl border bg-surface shadow-xs transition-transform duration-100 active:scale-[0.96]',
                quantite ? 'border-accent ring-2 ring-accent/40' : 'border-bordure',
              )}
            >
              <VignetteArticle article={a} taille="plein" className="h-12 [&_svg]:size-8" />
              <span className="px-1 py-1 text-center text-sm leading-none font-extrabold text-texte tabulaire">
                {formaterNombre(a.prix_xof)}
                <span className="ml-0.5 text-[9px] font-bold text-texte-3">F</span>
              </span>
            </button>
            <EcouterArticle article={a} className="absolute -top-1 -right-1 size-7" />
            {quantite > 0 && (
              <span className="pointer-events-none absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-sur-accent tabulaire shadow-xs" aria-hidden="true">
                {quantite}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function Panier({ panier, onChanger, onVider, className }: { panier: LignePanier[]; onChanger: (ulid: string, delta: number) => void; onVider: () => void; className?: string }) {
  const { t } = useTranslation()
  if (panier.length === 0) return <p className={cn('text-center text-sm text-texte-3', className)}>{t('caisse.panierVide')}</p>
  return (
    <div className={cn('flex flex-col', className)}>
      <ul className="divide-y divide-bordure" aria-label={t('caisse.panier')}>
        {panier.map((l) => (
          <li key={l.article.ulid} className="flex items-center gap-2 py-1.5">
            <VignetteArticle article={l.article} taille="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-texte">{libelleArticle(l.article, t)}</span>
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
