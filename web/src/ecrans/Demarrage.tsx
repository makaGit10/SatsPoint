import { Check, CreditCard, Play, Store, Wallet, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/store'
import { Bouton } from '@/composants/Bouton'
import { EnTetePage } from '@/composants/EnTetePage'
import { notifier } from '@/composants/toastStore'
import { cn } from '@/lib/cn'
import { queryClient } from '@/lib/queryClient'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'

const ETAPES = [
  { cle: 'boutique', icone: Store, fait: (c: Configuration | null, boutique: boolean) => boutique && Boolean(c) },
  { cle: 'portefeuille', icone: Wallet, fait: (c: Configuration | null) => Boolean(c?.wallet) },
  { cle: 'mobileMoney', icone: CreditCard, fait: (c: Configuration | null) => Boolean(c?.paytech), facultatif: true },
  { cle: 'test', icone: Zap, fait: (c: Configuration | null) => Boolean(c?.paiement_test) },
] as const

type Configuration = { wallet: boolean; paytech: boolean; paiement_test: boolean }

/** Démarrage guidé : quatre étapes, état lu depuis la configuration de la boutique. */
export default function Demarrage() {
  const { t } = useTranslation()
  const utilisateur = useAuth((s) => s.utilisateur)
  const configuration = utilisateur?.boutique?.configuration ?? null
  const aBoutique = Boolean(utilisateur?.boutique)

  useDonneesEnDirect(['parametres', 'wallet'], () => void queryClient.invalidateQueries({ queryKey: ['moi'] }))

  const indexCourant = ETAPES.findIndex((e) => !e.fait(configuration, aBoutique))

  return (
    <div className="anim-apparition flex flex-col" data-ecran="demarrage">
      <EnTetePage titre={t('demarrage.titre')} sousTitre={t('demarrage.sousTitre')} voix="demarrage.titre" />
      <ol className="flex flex-col gap-2">
        {ETAPES.map((etape, i) => {
          const fait = etape.fait(configuration, aBoutique)
          const courant = i === indexCourant
          const Icone = etape.icone
          return (
            <li
              key={etape.cle}
              className={cn(
                'flex items-center gap-3 rounded-lg border bg-surface px-3 py-2.5',
                courant ? 'border-accent shadow-xs' : 'border-bordure',
                !fait && !courant && 'opacity-70',
              )}
              aria-current={courant ? 'step' : undefined}
            >
              <span
                className={cn(
                  'inline-flex size-9 shrink-0 items-center justify-center rounded-full',
                  fait ? 'bg-succes-doux text-succes-texte' : courant ? 'bg-accent-doux text-accent-texte' : 'bg-surface-2 text-texte-3',
                )}
                aria-hidden="true"
              >
                {fait ? <Check size={18} /> : <Icone size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-base font-medium text-texte">
                  <span className="text-texte-3 tabulaire">{i + 1}.</span>
                  {t(`demarrage.etapes.${etape.cle}`)}
                  {'facultatif' in etape && etape.facultatif && <span className="text-xs font-normal text-texte-3">({t('commun.optionnel')})</span>}
                </p>
                <p className="text-sm text-texte-3">{t(`demarrage.etapes.${etape.cle}Texte`)}</p>
              </div>
            </li>
          )
        })}
      </ol>
      {indexCourant !== -1 && (
        <div className="mt-4">
          <Bouton
            taille="lg"
            icone={<Play />}
            voix="demarrage.commencer"
            pleineLargeur
            className="md:w-auto"
            onClick={() => notifier({ type: 'info', titre: t('demarrage.commencer'), description: t('commun.bientot') })}
          >
            {t('demarrage.commencer')}
          </Bouton>
        </div>
      )}
    </div>
  )
}
