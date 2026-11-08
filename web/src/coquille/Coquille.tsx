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
    <div className="flex min-h-dvh bg-fond" data-coquille>
      <BarreLaterale />
      <div className="flex min-w-0 flex-1 flex-col">
        <BandeauDemo />
        <EnTete />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-3 pb-[calc(var(--hauteur-barre-bas)+env(safe-area-inset-bottom,0px)+12px)] md:px-6 md:pt-4 md:pb-6">
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
