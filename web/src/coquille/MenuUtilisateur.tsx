import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/store'
import { cn } from '@/lib/cn'
import { initiales } from '@/lib/format'
import { HautParleur } from '@/voix/HautParleur'

const FenetreCompte = lazy(() => import('./FenetreCompte'))

export function Avatar({ nom, className }: { nom: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-doux text-xs font-semibold text-accent-texte', className)}
      aria-hidden="true"
    >
      {initiales(nom) || '•'}
    </span>
  )
}

/** Avatar → fenêtre « Mon compte » (chargée au premier toucher : rien de plus dans le JavaScript de la caisse). */
export function MenuUtilisateur() {
  const { t } = useTranslation()
  const utilisateur = useAuth((s) => s.utilisateur)
  const [ouvert, setOuvert] = useState(false)
  const [charge, setCharge] = useState(false)

  if (!utilisateur) return null

  return (
    <>
      <button
        type="button"
        aria-label={t('entete.menuUtilisateur')}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => {
          setCharge(true)
          setOuvert(true)
        }}
        className="zone-tactile inline-flex size-9 items-center justify-center rounded-full outline-none hover:ring-2 hover:ring-bordure-forte"
      >
        <Avatar nom={utilisateur.nom} />
        <HautParleur cle="entete.menuUtilisateur" dansBouton coin="-top-1.5 -right-0.5" />
      </button>
      {charge && (
        <Suspense fallback={null}>
          <FenetreCompte ouvert={ouvert} onOuvertChange={setOuvert} />
        </Suspense>
      )}
    </>
  )
}
