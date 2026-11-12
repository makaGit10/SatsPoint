import { useState } from 'react'
import { cn } from '@/lib/cn'
import { classesTuile } from '@/lib/couleursArticles'
import { IconePictogramme } from './pictogrammes'

export interface VisuelArticle {
  pictogramme?: string | null
  photo_url?: string | null
  couleur?: string | null
}

const TAILLES = {
  /** Ligne de vente, panier, reçu. */
  sm: 'size-8 rounded-lg [&_svg]:size-[18px]',
  /** Liste des articles. */
  md: 'size-11 rounded-xl [&_svg]:size-6',
  /** Aperçu du formulaire. */
  lg: 'size-28 rounded-2xl [&_svg]:size-14',
  /** Tuile de la caisse : toute la largeur, hauteur fixée par l'appelant (`className`). */
  plein: 'w-full rounded-none [&_svg]:size-11',
} as const

/**
 * Visuel d'un article : sa photo, sinon son pictogramme sur la couleur de sa tuile, sinon un carton.
 * Décoratif (`alt=""`) : le nom, le prix ou le haut-parleur portent le sens à côté.
 * Une photo inaccessible (hors ligne, supprimée) retombe sur le pictogramme.
 */
export function VignetteArticle({ article, taille = 'md', className }: { article: VisuelArticle; taille?: keyof typeof TAILLES; className?: string }) {
  const [photoEnErreur, setPhotoEnErreur] = useState<string | null>(null)
  const photo = article.photo_url && photoEnErreur !== article.photo_url ? article.photo_url : null
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden', TAILLES[taille], classesTuile(article.couleur ?? 'gris'), className)} aria-hidden="true">
      {photo ? (
        <img src={photo} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setPhotoEnErreur(photo)} className="h-full w-full object-cover" />
      ) : (
        <IconePictogramme id={article.pictogramme} />
      )}
    </span>
  )
}
