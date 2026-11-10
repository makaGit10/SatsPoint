import { Bitcoin, Database, HardDrive, Layers, RefreshCw, Radio, Server, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSanteAdmin } from '@/api/admin'
import type { SanteAdmin as TypeSante } from '@/api/types'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Carte } from '@/composants/Carte'
import { SqueletteListe } from '@/composants/Squelette'
import { cn } from '@/lib/cn'
import { formaterNombre } from '@/lib/format'
import { tempsRelatif } from '@/lib/temps'

type Niveau = 'ok' | 'alerte' | 'panne'

const COULEURS: Record<Niveau, string> = { ok: 'bg-succes', alerte: 'bg-attente', panne: 'bg-danger' }
const TEXTES: Record<Niveau, string> = { ok: 'text-succes-texte', alerte: 'text-attente-texte', panne: 'text-danger-texte' }

function totalEnAttente(valeur: TypeSante['files']['en_attente']): number | null {
  if (valeur === null || valeur === undefined) return null
  if (typeof valeur === 'number') return valeur
  return Object.values(valeur).reduce<number>((s, v) => s + (v ?? 0), 0)
}

function octets(n: number | null, locale: string): string {
  if (n === null) return '—'
  const mo = n / (1024 * 1024)
  return `${new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 1 }).format(mo)} Mo`
}

function Ligne({ icone, libelle, niveau, detail }: { icone: ReactNode; libelle: string; niveau: Niveau; detail: ReactNode }) {
  const { t } = useTranslation()
  return (
    <li className="flex items-center gap-3 px-3 py-2.5" data-niveau={niveau}>
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-texte-2 [&>svg]:size-4" aria-hidden="true">
        {icone}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-texte">{libelle}</p>
        <p className="truncate text-xs text-texte-3">{detail}</p>
      </div>
      <span className={cn('flex shrink-0 items-center gap-1.5 text-xs font-medium', TEXTES[niveau])}>
        <span className={cn('size-2.5 rounded-full', COULEURS[niveau], niveau !== 'ok' && 'anim-pulsation')} aria-hidden="true" />
        {t(`admin.sante.niveaux.${niveau}`)}
      </span>
    </li>
  )
}

/** Santé des services : voyants par service, actualisés toutes les 30 s. */
export function SanteAdmin({ actif }: { actif: boolean }) {
  const { t, i18n } = useTranslation()
  const requete = useSanteAdmin(actif)
  const s = requete.data
  if (!actif) return null
  if (requete.isPending || !s)
    return (
      <div data-chargement="sante" aria-busy="true">
        <SqueletteListe lignes={7} />
      </div>
    )

  const attente = totalEnAttente(s.files.en_attente)
  const echouees = s.files.echouees ?? 0
  const age = s.cours.age_s
  const niveauCours: Niveau = !s.cours.disponible ? 'panne' : age !== null && age > 180 ? 'alerte' : 'ok'
  const niveauFiles: Niveau = echouees > 0 || (attente ?? 0) > 50 ? 'alerte' : 'ok'
  const lignes: Array<{ icone: ReactNode; libelle: string; niveau: Niveau; detail: ReactNode }> = [
    { icone: <Database />, libelle: t('admin.sante.base'), niveau: s.base ? 'ok' : 'panne', detail: s.base ? t('admin.sante.baseOk') : t('admin.sante.injoignable') },
    { icone: <Server />, libelle: t('admin.sante.redis'), niveau: s.redis ? 'ok' : 'panne', detail: s.redis ? t('admin.sante.redisOk') : t('admin.sante.injoignable') },
    { icone: <Radio />, libelle: t('admin.sante.reverb'), niveau: s.reverb ? 'ok' : 'panne', detail: s.reverb ? t('admin.sante.reverbOk') : t('admin.sante.reverbKo') },
    { icone: <Zap />, libelle: t('admin.sante.passerelle'), niveau: s.passerelle ? 'ok' : 'panne', detail: s.passerelle ? t('admin.sante.passerelleOk') : t('admin.sante.passerelleKo') },
    {
      icone: <Bitcoin />,
      libelle: t('admin.sante.cours'),
      niveau: niveauCours,
      detail: s.cours.disponible ? t('admin.sante.coursDetail', { age: age ?? '—', sources: s.cours.sources ?? '—' }) : t('admin.sante.coursKo'),
    },
    { icone: <Layers />, libelle: t('admin.sante.files'), niveau: niveauFiles, detail: t('admin.sante.filesDetail', { attente: attente ?? '—', echouees }) },
    {
      icone: <HardDrive />,
      libelle: t('admin.sante.audio'),
      niveau: 'ok',
      detail: t('admin.sante.audioDetail', { fichiers: s.audio.fichiers === null ? '—' : formaterNombre(s.audio.fichiers), taille: octets(s.audio.octets, i18n.language) }),
    },
  ]
  const pires = lignes.filter((l) => l.niveau !== 'ok')
  const global: Niveau = lignes.some((l) => l.niveau === 'panne') ? (s.base ? 'alerte' : 'panne') : pires.length ? 'alerte' : 'ok'
  const maj = s.horodatage ? tempsRelatif(s.horodatage) : null

  return (
    <div className="flex flex-col gap-2" data-vue="sante">
      <Carte rembourrage="sm" className={cn('flex items-center gap-3', global === 'ok' ? 'border-succes/40' : global === 'alerte' ? 'border-attente/50' : 'border-danger/50')}>
        <span className={cn('size-3 shrink-0 rounded-full', COULEURS[global], global !== 'ok' && 'anim-pulsation')} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold', TEXTES[global])}>{t(`admin.sante.global.${global}`)}</p>
          <p className="text-xs text-texte-3">
            {maj ? t('admin.sante.majLe', { quand: t(maj.cle, { count: maj.count }) }) : null}
            {s.version ? ` · ${t('admin.sante.version', { version: s.version })}` : ''}
          </p>
        </div>
        <BoutonIcone
          libelle={t('commun.actualiser')}
          icone={<RefreshCw className={cn(requete.isFetching && 'animate-spin')} />}
          voix="commun.actualiser"
          variante="secondaire"
          taille="sm"
          onClick={() => void requete.refetch()}
        />
      </Carte>
      <ul className="divide-y divide-bordure verre rounded-xl" aria-label={t('admin.onglets.sante')}>
        {lignes.map((l) => (
          <Ligne key={l.libelle} {...l} />
        ))}
      </ul>
    </div>
  )
}
