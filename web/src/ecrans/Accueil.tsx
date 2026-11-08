import { Languages, Smartphone, Volume2, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BoutonLien } from '@/composants/Bouton'
import { Marque } from '@/coquille/Marque'
import { MiseEnPageInvite } from '@/coquille/MiseEnPageInvite'

const POINTS = [
  { cle: 'accueil.pointLightning', icone: Zap, classe: 'bg-accent-doux text-accent-texte' },
  { cle: 'accueil.pointMobileMoney', icone: Smartphone, classe: 'bg-mm-doux text-mm-texte' },
  { cle: 'accueil.pointVoix', icone: Volume2, classe: 'bg-succes-doux text-succes-texte' },
] as const

export default function Accueil() {
  const { t } = useTranslation()
  return (
    <MiseEnPageInvite ecran="accueil" sansMarque>
      <div className="flex flex-col items-center text-center">
        <Marque taille="lg" sansTexte className="mb-4" />
        <h1 className="text-2xl font-semibold tracking-tight text-texte md:text-3xl">{t('accueil.titre')}</h1>
        <p className="mt-2 max-w-xs text-base text-texte-2">{t('accueil.accroche')}</p>
      </div>

      <ul className="my-6 flex flex-col gap-2">
        {POINTS.map(({ cle, icone: Icone, classe }) => (
          <li key={cle} className="flex items-center gap-3 rounded-lg border border-bordure bg-surface px-3 py-2">
            <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md ${classe}`} aria-hidden="true">
              <Icone size={16} />
            </span>
            <span className="text-sm text-texte">{t(cle)}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <BoutonLien to="/inscription" taille="lg" pleineLargeur voix="accueil.creerBoutique">
          {t('accueil.creerBoutique')}
        </BoutonLien>
        <BoutonLien to="/connexion" variante="secondaire" taille="lg" pleineLargeur voix="accueil.meConnecter">
          {t('accueil.meConnecter')}
        </BoutonLien>
      </div>

      <Link to="/langue" className="mt-6 inline-flex items-center justify-center gap-1.5 self-center text-sm text-texte-3 hover:text-texte">
        <Languages size={14} aria-hidden="true" />
        {t('langue.changer')}
      </Link>
    </MiseEnPageInvite>
  )
}
