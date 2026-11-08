import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

export interface PropsChampCode {
  libelle: string
  valeur: string
  onChange: (valeur: string) => void
  /** Appelé quand les 6 chiffres sont saisis (validation automatique). */
  onComplet?: (valeur: string) => void
  /** Code de secours (lettres et chiffres, `xxxx-xxxx`) au lieu de 6 chiffres. */
  secours?: boolean
  erreur?: string | null
  desactive?: boolean
  autoFocus?: boolean
}

/** Saisie d'un code à 6 chiffres (ou d'un code de secours), grande et lisible, remplissage automatique du système. */
export const ChampCode = forwardRef<HTMLInputElement, PropsChampCode>(function ChampCode({ libelle, valeur, onChange, onComplet, secours, erreur, desactive, autoFocus }, ref) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-texte-2">
        {libelle}
        <input
          ref={ref}
          value={valeur}
          disabled={desactive}
          autoFocus={autoFocus}
          onChange={(e) => {
            const v = secours ? e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 9) : e.target.value.replace(/\D/g, '').slice(0, 6)
            onChange(v)
            if (!secours && v.length === 6) onComplet?.(v)
          }}
          inputMode={secours ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={secours ? 9 : 6}
          placeholder={secours ? 'xxxx-xxxx' : '000000'}
          aria-invalid={erreur ? true : undefined}
          className={cn(
            'mt-1 block h-14 w-full rounded-md border bg-surface text-center font-mono text-2xl font-semibold tracking-[0.35em] text-texte shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-texte-3/50',
            'focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60',
            erreur ? 'border-danger' : 'border-bordure hover:border-bordure-forte',
          )}
        />
      </label>
      {erreur && (
        <p role="alert" className="text-sm text-danger-texte">
          {erreur}
        </p>
      )}
    </div>
  )
})
