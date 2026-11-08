import { CircleCheck, Clock, FileQuestion, Smartphone, XCircle, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useRecu, type Recu as TypeRecu } from '@/api/recu'
import { Carte } from '@/composants/Carte'
import { EtatVide } from '@/composants/EtatVide'
import { Pastille, type TonPastille } from '@/composants/Pastille'
import { Squelette } from '@/composants/Squelette'
import { Marque } from '@/coquille/Marque'
import { SelecteurLangue, SelecteurTheme } from '@/coquille/Selecteurs'
import { localeCourante } from '@/i18n'
import { formaterDateHeure, formaterFCFA, formaterSats } from '@/lib/format'

const STATUTS: Record<TypeRecu['statut'], { ton: TonPastille; icone: typeof CircleCheck }> = {
  payee: { ton: 'succes', icone: CircleCheck },
  en_attente: { ton: 'attente', icone: Clock },
  annulee: { ton: 'neutre', icone: XCircle },
  expiree: { ton: 'neutre', icone: XCircle },
}

/** Reçu public : lisible sans compte, partagé par lien non devinable. */
export default function Recu() {
  const { t, i18n } = useTranslation()
  void i18n.language
  const { jeton } = useParams()
  const { data, isPending, isError } = useRecu(jeton)

  return (
    <div className="flex min-h-dvh flex-col bg-fond-2" data-ecran="recu">
      <header className="flex h-[var(--hauteur-entete)] items-center justify-between px-4">
        <Marque taille="sm" />
        <div className="flex items-center gap-0.5">
          <SelecteurTheme />
          <SelecteurLangue />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-4 pt-2 pb-10">
        {isPending && (
          <Carte className="flex flex-col items-center gap-3" aria-busy="true">
            <Squelette className="h-3 w-20" />
            <Squelette className="h-9 w-40" />
            <Squelette className="h-3 w-24" />
            <Squelette className="mt-2 h-24 w-full" />
          </Carte>
        )}
        {isError && <EtatVide ton="neutre" icone={<FileQuestion />} titre={t('recu.introuvable')} texte={t('recu.introuvableTexte')} />}
        {data && <DetailRecu recu={data} />}
        <p className="mt-6 text-center text-xs text-texte-3">{t('recu.pied')}</p>
      </main>
    </div>
  )
}

function DetailRecu({ recu }: { recu: TypeRecu }) {
  const { t } = useTranslation()
  const locale = localeCourante()
  const statut = STATUTS[recu.statut]
  const IconeStatut = statut.icone
  const IconeMethode = recu.methode === 'lightning' ? Zap : Smartphone

  return (
    <Carte className="anim-apparition flex flex-col gap-4" rembourrage="md">
      <div className="flex flex-col items-center text-center">
        <p className="text-xs font-medium tracking-wide text-texte-3 uppercase">{recu.boutique.nom}</p>
        <p className="mt-2 text-3xl font-semibold text-texte tabulaire">{formaterFCFA(recu.montant_xof)}</p>
        {recu.sats !== null && <p className="mt-0.5 text-sm text-texte-2 tabulaire">{formaterSats(recu.sats, { approx: true })}</p>}
        <Pastille ton={statut.ton} icone={<IconeStatut />} className="mt-3">
          {t(`statuts.${recu.statut}`)}
        </Pastille>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-bordure pt-3 text-sm">
        <dt className="text-texte-3">{t('recu.titre')}</dt>
        <dd className="text-right font-medium text-texte tabulaire">{recu.numero}</dd>
        <dt className="text-texte-3">{t('recu.date')}</dt>
        <dd className="text-right text-texte tabulaire">{recu.paye_le ? formaterDateHeure(recu.paye_le, locale) : '—'}</dd>
        <dt className="text-texte-3">{t('recu.boutique')}</dt>
        <dd className="text-right text-texte">
          {recu.boutique.nom} · {recu.boutique.ville}
        </dd>
        <dt className="text-texte-3">{t('recu.moyen')}</dt>
        <dd className="flex items-center justify-end gap-1 text-texte">
          <IconeMethode size={14} className={recu.methode === 'lightning' ? 'text-accent' : 'text-mm'} aria-hidden="true" />
          {t(recu.methode === 'lightning' ? 'caisse.lightning' : 'caisse.mobileMoney')}
        </dd>
      </dl>
      {recu.message && <p className="border-t border-bordure pt-3 text-center text-sm text-texte-2">{recu.message}</p>}
    </Carte>
  )
}
