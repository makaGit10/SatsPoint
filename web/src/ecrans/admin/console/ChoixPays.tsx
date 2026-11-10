import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePaysAdmin } from '@/api/admin'
import type { CodePays } from '@/api/types'
import { nomPays } from '@/lib/catalogue'
import { cn } from '@/lib/cn'

/** Cases à cocher compactes (pastilles) des pays du catalogue — y compris les pays désactivés. */
export function ChoixPays({ valeur, onChange, libelle, aide, erreur }: { valeur: CodePays[]; onChange: (v: CodePays[]) => void; libelle: string; aide?: string; erreur?: string }) {
  const { i18n } = useTranslation()
  const { data: pays = [] } = usePaysAdmin()
  const basculer = (code: CodePays) => onChange(valeur.includes(code) ? valeur.filter((c) => c !== code) : [...valeur, code])
  return (
    <fieldset className="flex flex-col gap-1.5" data-choix-pays>
      <legend className="mb-1.5 text-sm font-semibold text-texte-2">{libelle}</legend>
      <div className="flex flex-wrap gap-1.5">
        {pays.map((p) => {
          const coche = valeur.includes(p.code)
          return (
            <label
              key={p.code}
              className={cn(
                'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40',
                coche ? 'border-accent bg-accent-doux text-texte' : 'border-bordure bg-surface text-texte-2 hover:text-texte',
              )}
            >
              <input type="checkbox" className="sr-only" checked={coche} onChange={() => basculer(p.code)} />
              {coche && <Check size={14} aria-hidden="true" className="text-accent-texte" />}
              {nomPays(p, i18n.language)}
            </label>
          )
        })}
      </div>
      {erreur ? <p role="alert" className="text-sm text-danger-texte">{erreur}</p> : aide && <p className="text-xs text-texte-3">{aide}</p>}
    </fieldset>
  )
}
