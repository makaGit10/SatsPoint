import * as Tabs from '@radix-ui/react-tabs'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'

export const Onglets = Tabs.Root

export function OngletsListe({ className, ...reste }: ComponentProps<typeof Tabs.List>) {
  return (
    <Tabs.List
      className={cn('verre inline-flex h-12 w-full items-stretch gap-1 rounded-full p-1 md:h-11 md:w-auto', className)}
      {...reste}
    />
  )
}

export interface PropsOnglet extends ComponentProps<typeof Tabs.Trigger> {
  icone?: ReactNode
  /** Clé vocale. */
  voix?: string
  children?: ReactNode
}

export function Onglet({ icone, voix, className, children, ...reste }: PropsOnglet) {
  return (
    <Tabs.Trigger
      className={cn(
        'relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap text-texte-2 select-none md:flex-none',
        'transition-[background-color,color,box-shadow] duration-150 hover:text-texte',
        'data-[state=active]:bg-inverse data-[state=active]:text-inverse-texte data-[state=active]:shadow-sm',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...reste}
    >
      {icone && (
        <span className="inline-flex [&>svg]:size-4" aria-hidden="true">
          {icone}
        </span>
      )}
      {children}
      {voix && <HautParleur cle={voix} dansBouton />}
    </Tabs.Trigger>
  )
}

export function OngletContenu({ className, ...reste }: ComponentProps<typeof Tabs.Content>) {
  return <Tabs.Content className={cn('mt-5 outline-none', className)} {...reste} />
}
