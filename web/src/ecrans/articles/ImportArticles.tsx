import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileSpreadsheet, Sparkles, Upload, XCircle } from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CLE_ARTICLES } from '@/api/articles'
import { telecharger } from '@/api/telechargement'
import { analyserImport, cleImport, executerImport, lireImport } from '@/api/imports'
import type { ChampImport, Correspondance, ImportAnalyse, ModeImport } from '@/api/types'
import { Bouton } from '@/composants/Bouton'
import { Dialogue } from '@/composants/Dialogue'
import { Pastille } from '@/composants/Pastille'
import { Selection } from '@/composants/Selection'
import { notifier } from '@/composants/toastStore'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { cn } from '@/lib/cn'
import { formaterFCFA, formaterNombre } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { lireStockage, ecrireStockage } from '@/lib/stockage'
import { normaliser } from '@/lib/texte'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { HautParleur } from '@/voix/HautParleur'
import { attribuer, CHAMPS_IMPORT, correspondanceInitiale, transformerLigne, validerCorrespondance } from './correspondance'

type Etape = 'depot' | 'colonnes' | 'mode' | 'import'
const ETAPES: Etape[] = ['depot', 'colonnes', 'mode', 'import']
const MODES: Array<{ mode: ModeImport; voix: string }> = [
  { mode: 'creer', voix: 'import.modes.creer.titre' },
  { mode: 'creer_et_mettre_a_jour', voix: 'import.modes.creer_et_mettre_a_jour.titre' },
  { mode: 'ignorer_erreurs', voix: 'import.modes.ignorer_erreurs.titre' },
]
const CLE_MEMOIRE = 'satspoint.import.correspondance'
const TAILLE_MAX = 2 * 1024 * 1024

/** Correspondance mémorisée (colonne normalisée → champ) pour le prochain import. */
function lireMemoire(): Record<string, ChampImport | null> {
  try {
    return JSON.parse(lireStockage(CLE_MEMOIRE) ?? '{}') as Record<string, ChampImport | null>
  } catch {
    return {}
  }
}

function memoriser(correspondance: Correspondance) {
  const memoire = { ...lireMemoire() }
  for (const [colonne, champ] of Object.entries(correspondance)) memoire[normaliser(colonne)] = champ
  ecrireStockage(CLE_MEMOIRE, JSON.stringify(memoire))
}

function telechargerModele(t: (c: string) => string) {
  const contenu = `﻿${[t('import.modele.entetes'), t('import.modele.exemple1'), t('import.modele.exemple2')].join('\r\n')}\r\n`
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'modele-articles.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Assistant d'import d'articles (cahier § 6.15) : déposer → correspondance des colonnes + aperçu → mode → progression et rapport. */
export default function ImportArticles({ onFermer }: { onFermer: () => void }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const [etape, setEtape] = useState<Etape>('depot')
  const [analyse, setAnalyse] = useState<ImportAnalyse | null>(null)
  const [nomFichier, setNomFichier] = useState('')
  const [correspondance, setCorrespondance] = useState<Correspondance>({})
  const [mode, setMode] = useState<ModeImport>('creer')
  const [erreur, setErreur] = useState<string | null>(null)
  const [ulidLance, setUlidLance] = useState<string | null>(null)

  const analyseFichier = useMutation({
    mutationFn: (fichier: File) => analyserImport(fichier),
    onSuccess: ({ import: imp }) => {
      const memoire = lireMemoire()
      const suggestions: Correspondance = { ...imp.suggestions }
      for (const c of imp.colonnes) if (normaliser(c) in memoire) suggestions[c] = memoire[normaliser(c)] ?? null
      setAnalyse(imp)
      setCorrespondance(correspondanceInitiale(imp.colonnes, suggestions))
      setEtape('colonnes')
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  const execution = useMutation({
    mutationFn: () => executerImport(analyse!.ulid, correspondance, mode),
    onSuccess: ({ import: imp }) => {
      memoriser(correspondance)
      queryClient.setQueryData(cleImport(imp.ulid), { import: imp })
      setUlidLance(imp.ulid)
      setEtape('import')
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  const choisirFichier = (fichier: File | undefined) => {
    if (!fichier) return
    setErreur(null)
    const extension = fichier.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['csv', 'txt', 'xlsx'].includes(extension)) return setErreur(t('import.refus.format'))
    if (fichier.size > TAILLE_MAX) return setErreur(t('import.refus.taille'))
    setNomFichier(fichier.name)
    analyseFichier.mutate(fichier)
  }

  const indice = ETAPES.indexOf(etape)
  const enCours = etape === 'import'

  return (
    <Dialogue
      ouvert
      onOuvertChange={(o) => !o && onFermer()}
      titre={t('import.titre')}
      description={<Etapes indice={indice} />}
      taille="lg"
      pied={
        etape === 'colonnes' ? (
          <>
            <Bouton variante="secondaire" icone={<ArrowLeft />} voix="commun.retour" onClick={() => setEtape('depot')}>
              {t('commun.retour')}
            </Bouton>
            <Bouton iconeDroite={<ArrowRight />} voix="commun.continuer" disabled={!validerCorrespondance(correspondance).valide} onClick={() => setEtape('mode')}>
              {t('commun.continuer')}
            </Bouton>
          </>
        ) : etape === 'mode' ? (
          <>
            <Bouton variante="secondaire" icone={<ArrowLeft />} voix="commun.retour" onClick={() => setEtape('colonnes')}>
              {t('commun.retour')}
            </Bouton>
            <Bouton icone={<Upload />} voix="import.lancer" chargement={execution.isPending} onClick={() => execution.mutate()}>
              {t('import.lancer', { count: analyse?.total_lignes ?? analyse?.total ?? analyse?.apercu.length ?? 0 })}
            </Bouton>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 pb-1" data-import={etape}>
        {etape === 'depot' && <Depot occupe={analyseFichier.isPending} onFichier={choisirFichier} onModele={() => telechargerModele(t)} />}
        {etape === 'colonnes' && analyse && <Colonnes analyse={analyse} nomFichier={nomFichier} correspondance={correspondance} onChange={setCorrespondance} />}
        {etape === 'mode' && <Mode mode={mode} onChange={setMode} />}
        {enCours && ulidLance && <Progression ulid={ulidLance} onTerminer={onFermer} />}
        <ErreurFormulaire message={erreur} />
      </div>
    </Dialogue>
  )
}

function Etapes({ indice }: { indice: number }) {
  const { t } = useTranslation()
  return (
    <span className="mt-1 flex items-center gap-1.5" aria-label={t('import.etapeAria', { n: indice + 1, total: ETAPES.length })}>
      {ETAPES.map((e, i) => (
        <span key={e} className="flex items-center gap-1.5">
          <span className={cn('inline-flex size-5 items-center justify-center rounded-full text-2xs font-semibold', i < indice ? 'bg-succes text-white' : i === indice ? 'bg-accent text-sur-accent' : 'bg-surface-3 text-texte-3')} aria-hidden="true">
            {i < indice ? <Check size={11} strokeWidth={3} /> : i + 1}
          </span>
          <span className={cn('text-xs', i === indice ? 'font-medium text-texte' : 'text-texte-3 max-sm:hidden')}>{t(`import.etapes.${e}`)}</span>
          {i < ETAPES.length - 1 && <span className="h-px w-3 bg-bordure-forte sm:w-5" aria-hidden="true" />}
        </span>
      ))}
    </span>
  )
}

function Depot({ occupe, onFichier, onModele }: { occupe: boolean; onFichier: (f: File | undefined) => void; onModele: () => void }) {
  const { t } = useTranslation()
  const [survol, setSurvol] = useState(false)
  const entree = useRef<HTMLInputElement>(null)
  const surDepot = (e: DragEvent) => {
    e.preventDefault()
    setSurvol(false)
    onFichier(e.dataTransfer.files[0])
  }
  return (
    <>
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setSurvol(true)
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={surDepot}
        className={cn(
          'relative flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-accent/40',
          survol ? 'border-accent bg-accent-doux' : 'border-bordure-forte hover:border-texte-3',
          occupe && 'pointer-events-none opacity-70',
        )}
        data-depot-import
      >
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent-doux text-accent-texte" aria-hidden="true">
          <FileSpreadsheet size={22} />
        </span>
        <span className="text-base font-semibold text-texte">{occupe ? t('import.analyse') : t('import.deposer')}</span>
        <span className="text-sm text-texte-2">{t('import.deposerAide')}</span>
        <span className="text-xs text-texte-3">{t('import.formats')}</span>
        <HautParleur cle="import.deposer" className="absolute top-2 right-2" />
        <input ref={entree} type="file" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => { onFichier(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      <div className="flex justify-center">
        <Bouton variante="fantome" taille="sm" icone={<Download />} voix="import.modele.telecharger" onClick={onModele}>
          {t('import.modele.telecharger')}
        </Bouton>
      </div>
    </>
  )
}

function Colonnes({ analyse, nomFichier, correspondance, onChange }: { analyse: ImportAnalyse; nomFichier: string; correspondance: Correspondance; onChange: (c: Correspondance) => void }) {
  const { t } = useTranslation()
  const validation = validerCorrespondance(correspondance)
  const champsUtilises = CHAMPS_IMPORT.filter((c) => Object.values(correspondance).includes(c))
  const lignes = useMemo(() => analyse.apercu.slice(0, 10).map((l) => transformerLigne(l, analyse.colonnes, correspondance)), [analyse, correspondance])
  const enErreur = lignes.filter((l) => l.erreurs.length > 0).length
  const options = [{ valeur: '', libelle: t('import.ignorer') }, ...CHAMPS_IMPORT.map((c) => ({ valeur: c, libelle: t(`import.champs.${c}`) }))]

  return (
    <>
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-texte-2">
        <FileSpreadsheet size={15} className="text-texte-3" aria-hidden="true" />
        <span className="font-medium text-texte">{nomFichier}</span>
        <span className="text-texte-3">· {t('import.resume', { colonnes: analyse.colonnes.length, lignes: formaterNombre(analyse.total_lignes ?? analyse.total ?? analyse.apercu.length) })}</span>
      </p>

      <section aria-labelledby="titre-correspondance">
        <h3 id="titre-correspondance" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-texte">
          {t('import.correspondance')}
          <HautParleur cle="import.correspondance" />
        </h3>
        <ul className="divide-y divide-bordure rounded-lg border border-bordure bg-surface" data-correspondance>
          {analyse.colonnes.map((colonne, i) => {
            const champ = correspondance[colonne] ?? null
            const suggere = champ !== null && analyse.suggestions[colonne] === champ
            const exemple = analyse.apercu.find((l) => (l[i] ?? '').trim())?.[i]
            return (
              <li key={`${colonne}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-texte">{colonne}</p>
                  {exemple && <p className="truncate text-xs text-texte-3">{t('import.exemple', { valeur: exemple })}</p>}
                </div>
                <ArrowRight size={14} className="text-texte-3" aria-hidden="true" />
                <div className="flex min-w-0 items-center gap-1.5">
                  <Selection
                    libelle={t('import.champPour', { colonne })}
                    libelleVisible={false}
                    taille="sm"
                    value={champ ?? ''}
                    onChange={(e) => onChange(attribuer(correspondance, colonne, (e.target.value || null) as ChampImport | null))}
                    options={options}
                    classeConteneur="min-w-0 flex-1"
                    className={cn(!champ && 'text-texte-3')}
                  />
                  {suggere && (
                    <span title={t('import.suggere')} className="inline-flex shrink-0 text-accent-texte" aria-label={t('import.suggere')}>
                      <Sparkles size={14} aria-hidden="true" />
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {!validation.valide && (
          <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-danger-texte">
            <AlertTriangle size={13} aria-hidden="true" />
            {t('import.obligatoires', { champs: validation.manquants.map((c) => t(`import.champs.${c}`)).join(', ') })}
          </p>
        )}
      </section>

      {champsUtilises.length > 0 && (
        <section aria-labelledby="titre-apercu">
          <h3 id="titre-apercu" className="mb-1.5 flex items-center justify-between gap-2 text-sm font-semibold text-texte">
            {t('import.apercu')}
            <span className="text-xs font-normal">
              {enErreur ? <span className="text-danger-texte">{t('import.apercuErreurs', { count: enErreur })}</span> : <span className="text-succes-texte">{t('import.apercuOk')}</span>}
            </span>
          </h3>
          <div className="overflow-x-auto rounded-lg border border-bordure" data-apercu>
            <table className="w-full text-sm">
              <thead className="bg-fond-2 text-left text-xs text-texte-3">
                <tr>
                  <th scope="col" className="w-8 px-2 py-1.5 font-medium">#</th>
                  {champsUtilises.map((c) => (
                    <th key={c} scope="col" className="px-2 py-1.5 font-medium whitespace-nowrap">
                      {t(`import.champs.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-bordure">
                {lignes.map((l, i) => (
                  <tr key={i} className={cn(l.erreurs.length > 0 && 'bg-danger-doux/40')}>
                    <td className="px-2 py-1.5 text-xs text-texte-3 tabulaire">{i + 2}</td>
                    {champsUtilises.map((c) => {
                      const v = l.valeurs[c]
                      return (
                        <td key={c} className="max-w-48 truncate px-2 py-1.5 text-texte">
                          {c === 'prix_xof' && typeof v === 'number' ? (
                            <span className="tabulaire">{formaterFCFA(v)}</span>
                          ) : c === 'actif' && typeof v === 'boolean' ? (
                            v ? <Check size={14} className="text-succes-texte" aria-label={t('commun.oui')} /> : <XCircle size={14} className="text-texte-3" aria-label={t('commun.non')} />
                          ) : v === undefined || v === '' ? (
                            <span className="text-texte-3">—</span>
                          ) : (
                            String(v)
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {enErreur > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-danger-texte">
              {lignes.map((l, i) =>
                l.erreurs.length ? (
                  <li key={i} className="flex items-start gap-1.5">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {t('import.ligne', { n: i + 2 })} : {l.erreurs.map((e) => t(`import.erreurs.${e}`)).join(' · ')}
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </section>
      )}
    </>
  )
}

function Mode({ mode, onChange }: { mode: ModeImport; onChange: (m: ModeImport) => void }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('import.etapes.mode')} className="flex flex-col gap-2" data-modes>
      {MODES.map(({ mode: m, voix }) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          className={cn('relative flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors', mode === m ? 'border-accent bg-accent-doux/50' : 'border-bordure bg-surface hover:border-bordure-forte')}
        >
          <span className={cn('mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border-2', mode === m ? 'border-accent' : 'border-bordure-forte')} aria-hidden="true">
            {mode === m && <span className="size-2 rounded-full bg-accent" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-texte">{t(`import.modes.${m}.titre`)}</span>
            <span className="block text-xs text-texte-2">{t(`import.modes.${m}.texte`)}</span>
          </span>
          <HautParleur cle={voix} dansBouton />
        </button>
      ))}
    </div>
  )
}

function Progression({ ulid, onTerminer }: { ulid: string; onTerminer: () => void }) {
  const { t } = useTranslation()
  const requete = useQuery({
    queryKey: cleImport(ulid),
    queryFn: () => lireImport(ulid),
    select: (r) => r.import,
    refetchInterval: (q) => (q.state.data?.import.statut === 'en_cours' || q.state.data?.import.statut === 'analyse' ? 1500 : false),
  })
  useDonneesEnDirect(['imports'], () => void queryClient.invalidateQueries({ queryKey: cleImport(ulid) }))
  const imp = requete.data
  if (!imp) return null
  const fini = imp.statut === 'termine' || imp.statut === 'echoue'
  const pct = imp.total ? Math.round((imp.traitees / imp.total) * 100) : 0
  const nbErreurs = imp.lignes_en_erreur ?? imp.erreurs.length

  const terminer = () => {
    void queryClient.invalidateQueries({ queryKey: CLE_ARTICLES })
    if (imp.statut === 'termine') notifier({ type: 'succes', titre: t('import.fini', { count: imp.creees + imp.mises_a_jour }), voix: 'import.termine' })
    onTerminer()
  }

  return (
    <div className="flex flex-col gap-3" data-progression={imp.statut}>
      <div className="flex items-center gap-3">
        {imp.statut === 'termine' ? (
          <CheckCircle2 size={28} className="shrink-0 text-succes-texte" aria-hidden="true" />
        ) : imp.statut === 'echoue' ? (
          <XCircle size={28} className="shrink-0 text-danger-texte" aria-hidden="true" />
        ) : (
          <span className="size-7 shrink-0 animate-spin rounded-full border-[3px] border-surface-3 border-t-accent" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <p className="text-base font-semibold text-texte">{t(`import.statuts.${imp.statut}`)}</p>
          <p className="text-sm text-texte-2 tabulaire">{t('import.avancement', { traitees: imp.traitees, total: imp.total })}</p>
        </div>
        <span className="text-lg font-semibold text-texte tabulaire">{pct} %</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
        <div className={cn('h-full rounded-full transition-[width] duration-300', imp.statut === 'echoue' ? 'bg-danger' : imp.statut === 'termine' ? 'bg-succes' : 'bg-accent')} style={{ width: `${pct}%` }} />
      </div>
      <dl className="grid grid-cols-3 divide-x divide-bordure rounded-lg border border-bordure bg-surface py-2 text-center">
        <div>
          <dt className="text-xs text-texte-3">{t('import.creees')}</dt>
          <dd className="text-lg font-semibold text-succes-texte tabulaire">{imp.creees}</dd>
        </div>
        <div>
          <dt className="text-xs text-texte-3">{t('import.misesAJour')}</dt>
          <dd className="text-lg font-semibold text-texte tabulaire">{imp.mises_a_jour}</dd>
        </div>
        <div>
          <dt className="text-xs text-texte-3">{t('import.enErreur')}</dt>
          <dd className={cn('text-lg font-semibold tabulaire', nbErreurs ? 'text-danger-texte' : 'text-texte-3')}>{nbErreurs}</dd>
        </div>
      </dl>
      {imp.erreurs.length > 0 && (
        <section aria-label={t('import.rapport')}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-texte">{t('import.rapport')}</h3>
            {imp.rapport_url && (
              <Bouton variante="fantome" taille="sm" icone={<Download />} voix="import.telechargerRapport" onClick={() => void telecharger(imp.rapport_url!, 'rapport-import.csv').catch(() => undefined)}>
                {t('import.telechargerRapport')}
              </Bouton>
            )}
          </div>
          <ul className="max-h-40 divide-y divide-bordure overflow-y-auto rounded-lg border border-bordure bg-surface text-sm">
            {imp.erreurs.map((e) => (
              <li key={`${e.ligne}-${e.message}`} className="flex gap-2 px-3 py-1.5">
                <Pastille ton="danger">{t('import.ligne', { n: e.ligne })}</Pastille>
                <span className="min-w-0 text-texte-2">{e.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {fini && (
        <Bouton pleineLargeur icone={<Check />} voix="import.terminer" onClick={terminer}>
          {t('import.terminer')}
        </Bouton>
      )}
    </div>
  )
}
