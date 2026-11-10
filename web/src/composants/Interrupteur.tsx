import * as Switch from '@radix-ui/react-switch'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { HautParleur } from '@/voix/HautParleur'

export interface PropsInterrupteur {
  coche: boolean
  onChange: (coche: boolean) => void
  libelle: ReactNode
  description?: ReactNode
  /** Clé vocale. */
  voix?: string
  desactive?: boolean
  className?: string
}

/** Interrupteur accessible avec libellé cliquable. */
export function Interrupteur({ coche, onChange, libelle, description, voix, desactive, className }: PropsInterrupteur) {
  const id = useId()
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <span className="min-w-0">
          <span className="block text-base font-medium text-texte">{libelle}</span>
          {description && <span className="block text-xs text-texte-3">{description}</span>}
        </span>
        {voix && <HautParleur cle={voix} />}
      </label>
      <Switch.Root
        id={id}
        checked={coche}
        onCheckedChange={onChange}
        disabled={desactive}
        className={cn(
          'zone-tactile relative h-7 w-12 shrink-0 rounded-full border border-transparent bg-bordure-forte transition-colors duration-150',
          'data-[state=checked]:bg-accent-trait data-[state=checked]:shadow-[0_6px_16px_-6px_rgba(224,162,31,0.8)] disabled:opacity-50',
        )}
      >
        <Switch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-[20px]" />
      </Switch.Root>
    </div>
  )
}
