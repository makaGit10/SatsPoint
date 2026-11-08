import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bouton } from '@/composants/Bouton'
import { EnTetePage } from '@/composants/EnTetePage'
import { EtatVide } from '@/composants/EtatVide'
import { notifier } from '@/composants/toastStore'
import { SqueletteEcran } from '@/coquille/SqueletteEcran'
import { queryClient } from '@/lib/queryClient'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'

export interface PropsPageVide {
  /** Préfixe des clés i18n : `ventes` → `ventes.titre`, `ventes.vide.titre`, `ventes.vide.texte`. */
  prefixe: string
  ecran: string
  icone: ReactNode
  ton?: 'accent' | 'mm' | 'neutre' | 'succes'
  /** Clé i18n de l'action principale (ex. `equipe.inviter`) ; elle sert aussi de clé vocale. */
  action?: string
  iconeAction?: ReactNode
  /** Rubriques temps réel écoutées par l'écran. */
  rubriques: readonly string[]
  /** Clés TanStack Query à invalider silencieusement sur signal. */
  clesRequetes?: readonly (readonly unknown[])[]
  /** Premier chargement en cours → squelettes (jamais lors d'un rechargement silencieux). */
  chargement?: boolean
  actionsEnTete?: ReactNode
  children?: ReactNode
}

/**
 * Gabarit d'un écran encore sans données : titre, état vide soigné, squelettes au premier chargement,
 * et temps réel déjà branché (`useDonneesEnDirect`).
 */
export function PageVide({
  prefixe,
  ecran,
  icone,
  ton = 'accent',
  action,
  iconeAction,
  rubriques,
  clesRequetes = [[prefixe]],
  chargement = false,
  actionsEnTete,
  children,
}: PropsPageVide) {
  const { t } = useTranslation()

  useDonneesEnDirect(rubriques, () => {
    for (const cle of clesRequetes) void queryClient.invalidateQueries({ queryKey: [...cle] })
  })

  return (
    <div className="anim-apparition flex flex-col" data-ecran={ecran}>
      <EnTetePage titre={t(`${prefixe}.titre`)} voix={`${prefixe}.titre`} actions={actionsEnTete} />
      {chargement ? (
        <SqueletteEcran />
      ) : (
        <>
          {children}
          <EtatVide
            icone={icone}
            ton={ton}
            titre={t(`${prefixe}.vide.titre`)}
            texte={t(`${prefixe}.vide.texte`)}
            action={
              action && (
                <Bouton
                  voix={action}
                  icone={iconeAction}
                  onClick={() => notifier({ type: 'info', titre: t(action), description: t('commun.bientot') })}
                >
                  {t(action)}
                </Bouton>
              )
            }
          />
        </>
      )}
    </div>
  )
}
