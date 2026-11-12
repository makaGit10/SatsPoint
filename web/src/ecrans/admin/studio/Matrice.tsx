import { ChevronRight, Star } from 'lucide-react'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import type { CleAudio, LangueAudio, LangueMatrice } from '@/api/types'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'
import { IconeStatut } from './IconeStatut'
import { statutDe } from './selection'

interface PropsMatrice {
  cles: CleAudio[]
  langues: LangueMatrice[]
  langue: LangueAudio
  selection: string | null
  onChoisir: (cle: string, langue: LangueAudio) => void
}

/** Groupes successifs par écran (l'ordre d'apparition est conservé). */
function parEcran(cles: CleAudio[]): Array<{ ecran: string; cles: CleAudio[] }> {
  const groupes: Array<{ ecran: string; cles: CleAudio[] }> = []
  for (const c of cles) {
    const dernier = groupes[groupes.length - 1]
    if (dernier && dernier.ecran === c.ecran) dernier.cles.push(c)
    else groupes.push({ ecran: c.ecran, cles: [c] })
  }
  return groupes
}

function useLibelleEcran() {
  const { t } = useTranslation()
  return (ecran: string) => t(`studio.ecrans.${ecran}`, { defaultValue: ecran })
}

/** Bureau : matrice compacte clés × langues, colonne de la langue de travail mise en avant. */
export function MatriceBureau({ cles, langues, langue, selection, onChoisir }: PropsMatrice) {
  const { t } = useTranslation()
  const libelleEcran = useLibelleEcran()
  return (
    <div className="overflow-hidden verre rounded-xl" data-matrice>
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">{t('studio.matrice')}</caption>
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-bordure">
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-texte-3">
              {t('studio.cle')}
            </th>
            {langues.map((l) => (
              <th key={l.code} scope="col" className={cn('w-14 py-2 text-center text-xs font-semibold', l.code === langue ? 'bg-accent-doux text-accent-texte' : 'text-texte-2')}>
                <abbr title={l.nom} className="no-underline">
                  {l.code.toUpperCase()}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parEcran(cles).map((g) => (
            <Fragment key={`${g.ecran}-${g.cles[0]?.cle}`}>
              <tr>
                <th colSpan={langues.length + 1} scope="colgroup" className="border-b border-bordure bg-fond-2 px-3 py-1 text-left text-2xs font-semibold tracking-wide text-texte-3 uppercase">
                  {libelleEcran(g.ecran)} <span className="font-normal normal-case">· {g.cles.length}</span>
                </th>
              </tr>
              {g.cles.map((c) => (
                <tr key={c.cle} className={cn('border-b border-bordure last:border-b-0', selection === c.cle && 'bg-surface-2')} data-cle={c.cle}>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => onChoisir(c.cle, langue)} className="block min-w-0 flex-1 text-left">
                        <span className="flex items-center gap-1">
                          <span className="truncate font-medium text-texte">{c.texte_fr}</span>
                          {c.essentielle && <Star size={11} className="shrink-0 fill-current text-accent-trait" aria-label={t('studio.essentielle')} />}
                        </span>
                        <span className="block truncate font-mono text-2xs text-texte-3" data-technique>
                          {c.cle}
                        </span>
                      </button>
                      {/* Écouter la phrase déjà enregistrée dans la langue de travail (repli : le français). */}
                      <HautParleur cle={c.cle} langue={langue} />
                    </div>
                  </td>
                  {langues.map((l) => {
                    const statut = statutDe(c, l.code)
                    const choisie = selection === c.cle && l.code === langue
                    return (
                      <td key={l.code} className={cn('py-1 text-center', l.code === langue && 'bg-accent-doux/40')}>
                        <button
                          type="button"
                          onClick={() => onChoisir(c.cle, l.code)}
                          aria-label={t('studio.caseAria', { langue: l.nom, texte: c.texte_fr, statut: t(`studio.statuts.${statut}`) })}
                          aria-pressed={choisie}
                          data-statut={statut}
                          className={cn('inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-surface-3', choisie && 'ring-2 ring-accent')}
                        >
                          <IconeStatut statut={statut} />
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Mobile : une langue à la fois, une ligne par clé. */
export function MatriceMobile({ cles, langues, langue, selection, onChoisir }: PropsMatrice) {
  const { t } = useTranslation()
  const libelleEcran = useLibelleEcran()
  const nomLangue = langues.find((l) => l.code === langue)?.nom ?? langue
  return (
    <div className="overflow-hidden verre rounded-xl" data-matrice>
      {parEcran(cles).map((g) => (
        <section key={`${g.ecran}-${g.cles[0]?.cle}`} aria-label={libelleEcran(g.ecran)}>
          <h3 className="border-b border-bordure bg-fond-2 px-3 py-1 text-2xs font-semibold tracking-wide text-texte-3 uppercase">
            {libelleEcran(g.ecran)} <span className="font-normal normal-case">· {g.cles.length}</span>
          </h3>
          <ul className="divide-y divide-bordure border-b border-bordure">
            {g.cles.map((c) => {
              const statut = statutDe(c, langue)
              return (
                <li key={c.cle} className="flex items-center pr-1">
                  <button
                    type="button"
                    onClick={() => onChoisir(c.cle, langue)}
                    aria-label={t('studio.caseAria', { langue: nomLangue, texte: c.texte_fr, statut: t(`studio.statuts.${statut}`) })}
                    data-statut={statut}
                    className={cn('flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left', selection === c.cle && 'bg-surface-2')}
                  >
                    <IconeStatut statut={statut} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-sm font-medium text-texte">{c.texte_fr}</span>
                        {c.essentielle && <Star size={11} className="shrink-0 fill-current text-accent-trait" aria-hidden="true" />}
                      </span>
                      <span className="block truncate text-xs text-texte-3">{c.texte_en}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-texte-3" aria-hidden="true" />
                  </button>
                  <HautParleur cle={c.cle} langue={langue} />
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
