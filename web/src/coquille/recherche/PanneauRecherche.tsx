import * as Dialog from '@radix-ui/react-dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CornerDownLeft, FileText, History, Loader2, Package, Receipt, Search, Trash2, Users, WifiOff, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { chargerRecentes, CLE_RECENTES, effacerRecentes, memoriserRecherche } from '@/api/recherche'
import type { RubriqueRecherche } from '@/api/types'
import { useAuth } from '@/auth/store'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Touche } from '@/composants/Touche'
import { cn } from '@/lib/cn'
import { surligner } from '@/lib/texte'
import { HautParleur } from '@/voix/HautParleur'
import { chercherPages, deplacer, fusionnerGroupes, pagesAutorisees } from './resultats'
import { LONGUEUR_MIN, useRecherche } from './useRecherche'

const MAX_RECENTES = 4

const ICONES: Record<RubriqueRecherche, ReactNode> = {
  ventes: <Receipt />,
  articles: <Package />,
  equipe: <Users />,
  pages: <FileText />,
}

function Surligne({ texte, terme }: { texte: string; terme: string }) {
  return (
    <>
      {surligner(texte, terme).map((s, i) =>
        s.surligne ? (
          <mark key={i} className="rounded-[2px] bg-accent-doux font-semibold text-accent-texte">
            {s.texte}
          </mark>
        ) : (
          <span key={i}>{s.texte}</span>
        ),
      )}
    </>
  )
}

interface Option {
  id: string
  type: 'recente' | 'resultat'
  terme?: string
  url?: string
}

/**
 * Fenêtre de recherche globale (cahier § 6.14) : 4 dernières recherches avant la frappe, résultats en direct groupés
 * par rubrique (les plus pertinents en tête, terme surligné), navigation ↑ ↓ Entrée Échap, pages trouvables hors ligne.
 * Plein écran sur mobile, centrée sur bureau.
 */
export function PanneauRecherche({ onFermer }: { onFermer: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const utilisateur = useAuth((s) => s.utilisateur)
  const idListe = useId()
  const [terme, setTerme] = useState('')
  // Option active mémorisée avec la liste à laquelle elle se rapporte : une nouvelle liste repart sur la première.
  const [choix, setChoix] = useState<{ liste: string; index: number }>({ liste: '', index: 0 })
  const entree = useRef<HTMLInputElement>(null)
  const liste = useRef<HTMLDivElement>(null)

  const recentes = useQuery({ queryKey: CLE_RECENTES, queryFn: chargerRecentes, staleTime: 0, select: (r) => (r.recentes ?? []).slice(0, MAX_RECENTES), retry: false })
  const recherche = useRecherche(terme)
  const q = terme.trim()
  const pages = useMemo(() => pagesAutorisees(utilisateur), [utilisateur])
  const groupes = useMemo(() => {
    if (q.length < LONGUEUR_MIN) return []
    const locales = chercherPages(pages, q, t)
    return fusionnerGroupes(recherche.groupes, locales)
  }, [q, pages, recherche, t])

  const avantFrappe = q.length < LONGUEUR_MIN
  const options: Option[] = useMemo(() => {
    if (avantFrappe) return (recentes.data ?? []).map((r, i) => ({ id: `${idListe}-r${i}`, type: 'recente' as const, terme: r }))
    return groupes.flatMap((g, gi) => g.resultats.map((r, ri) => ({ id: `${idListe}-g${gi}-${ri}`, type: 'resultat' as const, url: r.url })))
  }, [avantFrappe, recentes.data, groupes, idListe])
  /** Premier indice de chaque rubrique dans la liste à plat. */
  const debuts = useMemo(() => {
    const resultat: number[] = []
    let total = 0
    for (const g of groupes) {
      resultat.push(total)
      total += g.resultats.length
    }
    return resultat
  }, [groupes])

  const signature = `${q}|${options.map((o) => o.url ?? o.terme).join('|')}`
  const actif = options.length === 0 ? -1 : choix.liste === signature ? Math.min(choix.index, options.length - 1) : 0
  const setActif = (suivant: number | ((i: number) => number)) => setChoix({ liste: signature, index: typeof suivant === 'function' ? suivant(actif) : suivant })

  const idOptionActive = actif >= 0 ? options[actif]?.id : undefined
  useEffect(() => {
    if (!idOptionActive) return
    liste.current?.querySelector(`[id="${idOptionActive}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [idOptionActive])

  const ouvrir = (url: string) => {
    if (q.length >= LONGUEUR_MIN) {
      // Mémorisée côté serveur (4 dernières, par utilisateur) ; mise à jour immédiate à l'écran.
      void memoriserRecherche(q).catch(() => undefined)
      client.setQueryData<{ recentes: string[] }>(CLE_RECENTES, (ancien) => ({
        recentes: [q, ...(ancien?.recentes ?? []).filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENTES),
      }))
    }
    onFermer()
    navigate(url)
  }

  const choisir = (option: Option | undefined) => {
    if (!option) return
    if (option.type === 'recente' && option.terme) {
      setTerme(option.terme)
      entree.current?.focus()
    } else if (option.url) ouvrir(option.url)
  }

  const effacer = () => {
    client.setQueryData(CLE_RECENTES, { recentes: [] })
    void effacerRecentes().catch(() => undefined)
    entree.current?.focus()
  }

  const surTouche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActif((i) => deplacer(i, options.length, e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choisir(options[actif])
    }
  }

  const idActif = idOptionActive

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onFermer()}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-apparition fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] max-md:hidden" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col bg-surface outline-none',
            'inset-0 pt-sure',
            'md:inset-auto md:top-[12vh] md:left-1/2 md:max-h-[70vh] md:w-full md:max-w-xl md:-translate-x-1/2 md:rounded-xl md:border md:border-bordure md:pt-0 md:shadow-lg md:anim-apparition',
          )}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            entree.current?.focus()
          }}
          data-recherche
        >
          <Dialog.Title className="sr-only">{t('recherche.titre')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('recherche.aide')}</Dialog.Description>
          <div className="flex items-center gap-1 border-b border-bordure px-2 py-2 md:px-3">
            <BoutonIcone libelle={t('commun.fermer')} icone={<ArrowLeft />} voix="commun.fermer" onClick={onFermer} className="md:hidden" sansInfobulle />
            <div className="flex flex-1 items-center gap-2 rounded-md px-1.5 md:px-0">
              {recherche.chargement ? <Loader2 size={17} className="shrink-0 animate-spin text-texte-3" aria-hidden="true" /> : <Search size={17} className="shrink-0 text-texte-3" aria-hidden="true" />}
              <input
                ref={entree}
                type="search"
                role="combobox"
                aria-expanded={options.length > 0}
                aria-controls={idListe}
                aria-activedescendant={idActif}
                aria-autocomplete="list"
                aria-label={t('recherche.titre')}
                value={terme}
                onChange={(e) => setTerme(e.target.value)}
                onKeyDown={surTouche}
                placeholder={t('recherche.placeholder')}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                className="h-10 w-full min-w-0 bg-transparent text-base text-texte outline-none placeholder:text-texte-3 [&::-webkit-search-cancel-button]:hidden"
              />
              {terme && <BoutonIcone libelle={t('recherche.vider')} icone={<X />} voix="recherche.vider" taille="sm" onClick={() => { setTerme(''); entree.current?.focus() }} sansInfobulle />}
            </div>
          </div>

          <div ref={liste} id={idListe} role="listbox" aria-label={t('recherche.resultats')} className="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:max-h-[calc(70vh-104px)]">
            {avantFrappe ? (
              <section aria-label={t('recherche.recentes')}>
                <div className="flex items-center justify-between px-2 pb-1">
                  <h3 className="text-2xs font-semibold tracking-wide text-texte-3 uppercase">{t('recherche.recentes')}</h3>
                  {(recentes.data?.length ?? 0) > 0 && <BoutonIcone libelle={t('recherche.effacerRecentes')} icone={<Trash2 />} voix="recherche.effacerRecentes" taille="sm" onClick={effacer} />}
                </div>
                {(recentes.data?.length ?? 0) === 0 ? (
                  <p className="px-2 py-4 text-center text-sm text-texte-3">{t('recherche.aide')}</p>
                ) : (
                  recentes.data!.map((r, i) => {
                    return (
                      <div
                        key={r}
                        id={options[i]?.id}
                        role="option"
                        aria-selected={actif === i}
                        tabIndex={-1}
                        onMouseMove={() => setActif(i)}
                        onClick={() => choisir(options[i])}
                        className={cn('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm text-texte', actif === i && 'bg-surface-2')}
                        data-recente
                      >
                        <History size={15} className="shrink-0 text-texte-3" aria-hidden="true" />
                        <span className="truncate">{r}</span>
                      </div>
                    )
                  })
                )}
              </section>
            ) : groupes.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-4 py-8 text-center text-sm text-texte-3" role="status">
                {recherche.chargement ? <p>{t('commun.chargement')}</p> : <p>{t('recherche.aucune', { terme: q })}</p>}
              </div>
            ) : (
              groupes.map((g, gi) => (
                <section key={g.rubrique} aria-label={t(`recherche.rubriques.${g.rubrique}`)} className="mb-1.5 last:mb-0" data-rubrique={g.rubrique}>
                  <h3 className="flex items-center gap-1.5 px-2 pt-1 pb-1 text-2xs font-semibold tracking-wide text-texte-3 uppercase [&>svg]:size-3">
                    {ICONES[g.rubrique]}
                    {t(`recherche.rubriques.${g.rubrique}`)}
                  </h3>
                  {g.resultats.map((r, ri) => {
                    const i = (debuts[gi] ?? 0) + ri
                    return (
                      <div
                        key={`${r.url}|${r.titre}`}
                        id={options[i]?.id}
                        role="option"
                        aria-selected={actif === i}
                        tabIndex={-1}
                        onMouseMove={() => setActif(i)}
                        onClick={() => choisir(options[i])}
                        className={cn('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5', actif === i && 'bg-surface-2')}
                        data-resultat
                      >
                        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-texte-2 [&>svg]:size-3.5" aria-hidden="true">
                          {ICONES[g.rubrique]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-texte">
                            <Surligne texte={r.titre} terme={q} />
                          </span>
                          {r.sous_titre && (
                            <span className="block truncate text-xs text-texte-3">
                              <Surligne texte={r.sous_titre} terme={q} />
                            </span>
                          )}
                        </span>
                        {actif === i && <CornerDownLeft size={14} className="shrink-0 text-texte-3 max-md:hidden" aria-hidden="true" />}
                      </div>
                    )
                  })}
                </section>
              ))
            )}
            {recherche.horsLigne && !avantFrappe && (
              <p className="mx-2 mt-2 flex items-center gap-1.5 rounded-md bg-attente-doux px-2 py-1.5 text-xs text-attente-texte" role="status">
                <WifiOff size={13} aria-hidden="true" />
                {t('recherche.horsLigne')}
              </p>
            )}
          </div>

          <div className="hidden items-center gap-3 border-t border-bordure px-3 py-2 text-2xs text-texte-3 md:flex">
            <span className="inline-flex items-center gap-1">
              <Touche>↑</Touche>
              <Touche>↓</Touche>
              {t('recherche.touches.naviguer')}
            </span>
            <span className="inline-flex items-center gap-1">
              <Touche>↵</Touche>
              {t('recherche.touches.ouvrir')}
            </span>
            <span className="inline-flex items-center gap-1">
              <Touche>{t('recherche.touches.echap')}</Touche>
              {t('recherche.touches.fermer')}
            </span>
            <HautParleur cle="recherche.titre" className="ml-auto" />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
