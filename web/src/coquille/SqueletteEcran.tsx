import { Squelette, SqueletteIndicateurs, SqueletteListe } from '@/composants/Squelette'

/** Repli d'attente d'un écran (chargement d'une route à la demande). */
export function SqueletteEcran() {
  return (
    <div className="anim-apparition flex flex-col gap-3" data-chargement="ecran" aria-busy="true">
      <Squelette className="h-6 w-40" />
      <SqueletteIndicateurs />
      <SqueletteListe />
    </div>
  )
}

/** Écran d'attente plein cadre (session inconnue au tout premier rendu). */
export function SqueletteApplication() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true" data-chargement="application">
      <div className="flex flex-col items-center gap-3">
        <Squelette className="size-12 rounded-xl" />
        <Squelette className="h-3 w-24" />
      </div>
    </div>
  )
}
