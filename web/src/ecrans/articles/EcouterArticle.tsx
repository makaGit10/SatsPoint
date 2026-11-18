import { Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Article } from '@/api/types'
import { cn } from '@/lib/cn'
import { arreter, lire, lireTexte, syntheseDisponible } from '@/voix/lecteur'
import { useVoix } from '@/voix/store'
import { obtenirUrlAudio, useUrlAudio } from '@/voix/useManifesteAudio'
import { libelleArticle } from './libelle'

type ArticleEcoutable = Pick<Article, 'ulid' | 'nom' | 'pictogramme' | 'voix_url'>

/**
 * Source sonore du nom d'un article, par ordre de préférence :
 * 1. le nom DIT par le commerçant (toujours proposé : c'est l'article lui-même pour qui ne lit pas) ;
 * 2. le nom écrit, lu par la voix du téléphone (aide vocale activée) ;
 * 3. le nom du pictogramme enregistré au studio dans la langue de la personne (aide vocale activée).
 * Rien → aucun haut-parleur (jamais de haut-parleur muet).
 */
export function useEcouteArticle(article: ArticleEcoutable): { jouer: () => void; enLecture: boolean } | null {
  const { t, i18n } = useTranslation()
  const activee = useVoix((s) => s.activee)
  const cle = `article:${article.ulid}`
  const enLecture = useVoix((s) => s.cleEnLecture === cle)
  const urlPicto = useUrlAudio(article.pictogramme ? `pictos.${article.pictogramme}` : '')
  const nom = article.nom?.trim()

  if (article.voix_url) return { jouer: () => lire(article.voix_url!, cle), enLecture }
  if (!activee) return null
  // Voix du téléphone, par le lecteur unique de l'aide vocale (un nouveau son coupe le précédent ; second appui = arrêt).
  if (nom && syntheseDisponible()) return { jouer: () => void lireTexte(libelleArticle(article, t), i18n.language.startsWith('en') ? 'en-US' : 'fr-FR', cle), enLecture }
  if (urlPicto) return { jouer: () => lire(urlPicto, cle), enLecture }
  return null
}

/**
 * Caisse : toucher un article DIT son nom (aide vocale active) — d'abord la voix enregistrée par le commerçant,
 * sinon le nom écrit par la voix du téléphone, sinon le nom de l'image enregistré au studio. Le son repart du
 * début à chaque toucher (deux thés = deux fois « thé »). Hors React : appelé depuis le clic de la tuile.
 */
export function direArticle(article: ArticleEcoutable, libelle: string, locale: string) {
  const { activee, langueAudio } = useVoix.getState()
  if (!activee) return
  const cle = `article:${article.ulid}`
  arreter()
  if (article.voix_url) return lire(article.voix_url, cle)
  if (article.nom?.trim() && syntheseDisponible()) return void lireTexte(libelle, locale.startsWith('en') ? 'en-US' : 'fr-FR', cle)
  if (article.pictogramme && langueAudio) {
    void obtenirUrlAudio(`pictos.${article.pictogramme}`, langueAudio).then((url) => {
      if (url) lire(url, cle)
    })
  }
}

/**
 * Haut-parleur d'un article (tuile de caisse, liste) : bouton à part entière, posé À CÔTÉ du bouton de l'article
 * (jamais imbriqué) — un toucher dit le nom sans ajouter l'article au panier.
 */
export function EcouterArticle({ article, className, grand = false }: { article: ArticleEcoutable; className?: string; grand?: boolean }) {
  const { t } = useTranslation()
  const ecoute = useEcouteArticle(article)
  if (!ecoute) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        ecoute.jouer()
      }}
      aria-label={t('articles.ecouterNom', { nom: libelleArticle(article, t) })}
      aria-pressed={ecoute.enLecture}
      data-ecouter-article={article.ulid}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-bordure bg-surface text-texte-2 shadow-xs transition-colors hover:text-accent-texte focus-visible:outline-2 focus-visible:outline-accent',
        grand ? 'size-9' : 'size-8',
        ecoute.enLecture && 'text-accent-texte',
        className,
      )}
    >
      {ecoute.enLecture ? <Ondes /> : <Volume2 size={grand ? 18 : 16} strokeWidth={2} aria-hidden="true" />}
    </button>
  )
}

function Ondes() {
  return (
    <span className="flex h-4 items-center gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="anim-ondes block h-4 w-[3px] rounded-full bg-current" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  )
}
