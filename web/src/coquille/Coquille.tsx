import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { TempsReel } from '@/temps-reel/TempsReel'
import { BandeauDemo } from './BandeauDemo'
import { BarreBas } from './BarreBas'
import { BarreLaterale } from './BarreLaterale'
import { EnTete } from './EnTete'
import { SqueletteEcran } from './SqueletteEcran'

/** Coquille connectée : barre latérale (bureau), en-tête, contenu, barre du bas (mobile). */
export function Coquille() {
  return (
    <div className="flex min-h-dvh" data-coquille>
      <BarreLaterale />
      <div className="flex min-w-0 flex-1 flex-col">
        <BandeauDemo />
        <EnTete />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pt-5 pb-[calc(var(--hauteur-barre-bas)+env(safe-area-inset-bottom,0px)+24px+var(--reserve-guide))] md:px-8 md:pt-8 md:pb-[calc(40px+var(--reserve-guide))]">
          <Suspense fallback={<SqueletteEcran />}>
            <Outlet />
          </Suspense>
        </main>
        <BarreBas />
      </div>
      <TempsReel />
    </div>
  )
}
