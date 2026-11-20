import { useQuery } from '@tanstack/react-query'
import { Mic, ShoppingBasket, Store, UserCog } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { connexionDemo, lireProfilsDemo, type ProfilDemo } from '@/api/demo'
import { Bouton } from '@/composants/Bouton'
import { notifier } from '@/composants/toastStore'
import { cheminAccueil } from '@/coquille/navigation'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'
import { useMessageErreur } from './useMessageErreur'

const ICONES: Record<ProfilDemo, ReactNode> = { proprietaire: <Store />, gerant: <UserCog />, caissier: <ShoppingBasket />, studio: <Mic /> }
const VOIX: Record<ProfilDemo, string> = { proprietaire: 'roles.proprietaire', gerant: 'roles.gerant', caissier: 'roles.caissier', studio: 'nav.studio' }
/** Le studio ouvre directement l'enregistrement des voix (console en lecture seule, enregistrement dans la langue d'essai). */
const ARRIVEE: Partial<Record<ProfilDemo, string>> = { studio: '/admin/studio' }

/**
 * Accès rapide du jury à la boutique de démonstration : un bouton par profil (propriétaire, gérant, caissier), sans
 * mot de passe. N'apparaît que si le serveur l'autorise (DEMO_CONNEXION_RAPIDE). `bascule` : depuis « Mon compte »,
 * pour changer de profil (le profil actuel est masqué). Rechargement complet : aucune donnée d'un profil ne reste
 * en mémoire pour le suivant.
 */
export default function AccesDemo({ bascule = false, suite, className }: { bascule?: boolean; suite?: string | null; className?: string }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const [enCours, setEnCours] = useState<ProfilDemo | null>(null)
  const { data: comptes = [] } = useQuery({ queryKey: ['demo', 'profils'], queryFn: lireProfilsDemo, staleTime: 60_000 })
  const visibles = bascule ? comptes.filter((c) => !c.actuel) : comptes
  if (visibles.length === 0 || (bascule && !comptes.some((c) => c.actuel))) return null

  const entrer = (profil: ProfilDemo) => {
    setEnCours(profil)
    connexionDemo(profil)
      .then(({ utilisateur }) => window.location.assign(ARRIVEE[profil] ?? suite ?? cheminAccueil(utilisateur)))
      .catch((e: unknown) => {
        setEnCours(null)
        notifier({ type: 'erreur', titre: messageErreur(e) })
      })
  }

  return (
    <section className={cn('rounded-xl border-2 border-accent/50 bg-accent-doux p-3.5', className)} data-acces-demo={bascule ? 'bascule' : 'connexion'}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-texte">
        {bascule ? t('demo.changer') : t('demo.titre')}
        <HautParleur cle={bascule ? 'demo.changer' : 'demo.titre'} />
      </h2>
      {!bascule && <p className="mt-0.5 text-xs text-texte-2">{t('demo.texte')}</p>}
      <div className="mt-2.5 flex flex-col gap-2">
        {visibles.map((c) => (
          <Bouton
            key={c.profil}
            type="button"
            variante={bascule ? 'secondaire' : 'primaire'}
            icone={ICONES[c.profil]}
            voix={VOIX[c.profil]}
            chargement={enCours === c.profil}
            disabled={enCours !== null}
            onClick={() => entrer(c.profil)}
            pleineLargeur
            data-profil-demo={c.profil}
          >
            {c.profil === 'studio' ? t('nav.studio') : `${c.nom} · ${t(`roles.${c.profil}`)}`}
          </Bouton>
        ))}
      </div>
    </section>
  )
}
