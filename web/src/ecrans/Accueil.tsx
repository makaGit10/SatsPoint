import { Languages, Smartphone, Volume2, Zap } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BoutonLien } from '@/composants/Bouton'
import { Marque } from '@/coquille/Marque'
import { MiseEnPageInvite } from '@/coquille/MiseEnPageInvite'
import { useGuideVocal } from '@/voix/guide'
import { HautParleur } from '@/voix/HautParleur'

const POINTS = [
  { cle: 'accueil.pointLightning', icone: Zap, classe: 'bg-accent-doux text-accent-texte' },
  { cle: 'accueil.pointMobileMoney', icone: Smartphone, classe: 'bg-mm-doux text-mm-texte' },
  { cle: 'accueil.pointVoix', icone: Volume2, classe: 'bg-succes-doux text-succes-texte' },
] as const

export default function Accueil() {
  const { t } = useTranslation()
  useGuideVocal('guide.accueil')
  return (
    <MiseEnPageInvite ecran="accueil" sansMarque large>
      <div className="flex flex-col md:items-center md:text-center">
        <Marque taille="md" className="mb-8" />
        <p className="text-sm font-semibold tracking-wide text-accent-texte uppercase">{t('accueil.titre')}</p>
        <h1 className="mt-3 text-[2.5rem] leading-[1.04] titre-serre text-texte md:text-6xl">
          <Trans i18nKey="accueil.slogan" components={{ or: <span className="texte-or" /> }} />
        </h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-texte-2">{t('accueil.accroche')}</p>
      </div>

      <ul className="verre my-8 flex flex-col gap-1 rounded-xl p-2 md:mx-auto md:w-full md:max-w-md">
        {POINTS.map(({ cle, icone: Icone, classe }) => (
          <li key={cle} className="flex items-center gap-4 rounded-lg px-3 py-3">
            <span className={`inline-flex size-11 shrink-0 items-center justify-center rounded-2xl ${classe}`} aria-hidden="true">
              <Icone size={20} />
            </span>
            <span className="text-base font-semibold text-texte">{t(cle)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-3 md:mx-auto md:mt-0 md:w-full md:max-w-md">
        <BoutonLien to="/inscription" taille="xl" pleineLargeur voix="accueil.creerBoutique">
          {t('accueil.creerBoutique')}
        </BoutonLien>
        <BoutonLien to="/connexion" variante="secondaire" taille="xl" pleineLargeur voix="accueil.meConnecter">
          {t('accueil.meConnecter')}
        </BoutonLien>
      </div>

      <div className="mt-6 flex items-center justify-center gap-0.5 self-center">
        <Link to="/langue" className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-texte-3 hover:text-texte">
          <Languages size={15} aria-hidden="true" />
          {t('langue.changer')}
        </Link>
        <HautParleur cle="langue.changer" />
      </div>
    </MiseEnPageInvite>
  )
}
