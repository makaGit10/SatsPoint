import { ChevronDown, History, Mail, Phone, X } from 'lucide-react'
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Champ } from '@/composants/Champ'
import { cn } from '@/lib/cn'
import { filtrerSuggestions } from '@/lib/identifiantsMemorises'
import { analyserSaisie, INDICATIFS, positionApresChiffres, texteAffiche, type SaisieIdentifiant } from './identifiant'

/** Libellé lisible d'un identifiant mémorisé : `+221 77 123 45 67` ou l'e-mail tel quel. */
function libelleSuggestion(valeur: string): string {
  const s = analyserSaisie(valeur, '221')
  return s.mode === 'telephone' ? `+${s.indicatif} ${texteAffiche(s)}` : valeur
}

/**
 * « Téléphone ou e-mail » en un seul champ : un chiffre tapé fait apparaître l'indicatif (+221 par défaut, modifiable)
 * et le numéro se met en forme tout seul (`77 123 45 67`) ; une lettre ou un « @ » passe en e-mail.
 * Avec `suggestions` (« Se souvenir de moi ») : les identifiants déjà utilisés sur cet appareil sont proposés dès
 * qu'on commence à écrire (liste accessible au clavier : ↑ ↓ Entrée Échap).
 */
export function ChampIdentifiant({
  libelle,
  saisie,
  onChange,
  erreur,
  aide,
  autoFocus,
  suggestions,
  onOublier,
}: {
  libelle: string
  saisie: SaisieIdentifiant
  onChange: (saisie: SaisieIdentifiant) => void
  erreur?: ReactNode
  aide?: ReactNode
  autoFocus?: boolean
  suggestions?: string[]
  onOublier?: (valeur: string) => void
}) {
  const { t, i18n } = useTranslation()
  const idListe = useId()
  const [ouverte, setOuverte] = useState(false)
  const [active, setActive] = useState(-1)
  const champ = useRef<HTMLInputElement>(null)
  /** Nombre de chiffres avant le curseur, à restaurer après reformatage. */
  const curseur = useRef<number | null>(null)
  const valeur = texteAffiche(saisie)

  useLayoutEffect(() => {
    const el = champ.current
    if (curseur.current === null || !el || document.activeElement !== el) return
    const pos = positionApresChiffres(valeur, curseur.current)
    curseur.current = null
    el.setSelectionRange(pos, pos)
  }, [valeur])

  const noms = useMemo(() => {
    try {
      return new Intl.DisplayNames([i18n.language], { type: 'region' })
    } catch {
      return null
    }
  }, [i18n.language])

  const proposees = useMemo(() => filtrerSuggestions(suggestions ?? [], valeur, saisie.indicatif), [suggestions, valeur, saisie.indicatif])
  const visible = ouverte && proposees.length > 0

  const choisir = (v: string) => {
    curseur.current = null
    onChange(analyserSaisie(v, saisie.indicatif))
    setOuverte(false)
    setActive(-1)
    // Identifiant rempli : on passe directement au mot de passe.
    requestAnimationFrame(() => {
      const mdp = champ.current?.form?.querySelector<HTMLInputElement>('input[type="password"], input[name="password"]')
      mdp?.focus()
    })
  }

  const telephone = saisie.mode === 'telephone'
  const indicatif = (
    <span className="relative flex h-full w-[4.25rem] items-center justify-center gap-0.5 border-r border-bordure text-sm font-medium text-texte">
      <span className="tabulaire">+{saisie.indicatif}</span>
      <ChevronDown size={12} className="text-texte-3" aria-hidden="true" />
      <select
        aria-label={t('auth.identifiant.indicatif')}
        value={saisie.indicatif}
        onChange={(e) => {
          onChange({ ...saisie, indicatif: e.target.value })
          champ.current?.focus()
        }}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {INDICATIFS.map((i) => (
          <option key={i.code} value={i.code}>
            {`${noms?.of(i.region) ?? i.region} (+${i.code})`}
          </option>
        ))}
      </select>
    </span>
  )

  return (
    <div className="relative">
    <Champ
      ref={champ}
      role={suggestions ? 'combobox' : undefined}
      aria-autocomplete={suggestions ? 'list' : undefined}
      aria-expanded={suggestions ? visible : undefined}
      aria-controls={suggestions ? idListe : undefined}
      aria-activedescendant={visible && active >= 0 ? `${idListe}-${active}` : undefined}
      onFocus={() => setOuverte(true)}
      onBlur={() => setOuverte(false)}
      onKeyDown={(e) => {
        if (!visible) {
          if (e.key === 'ArrowDown' && proposees.length) setOuverte(true)
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActive((i) => (i + 1) % proposees.length)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActive((i) => (i <= 0 ? proposees.length - 1 : i - 1))
        } else if (e.key === 'Enter' && active >= 0) {
          e.preventDefault()
          choisir(proposees[active]!)
        } else if (e.key === 'Tab' && proposees.length === 1 && valeur) {
          // Une seule correspondance : Tab complète (comme l'autocomplétion du navigateur).
          e.preventDefault()
          choisir(proposees[0]!)
        } else if (e.key === 'Escape') {
          setOuverte(false)
        }
      }}
      libelle={libelle}
      name="identifiant"
      autoComplete="username"
      inputMode="email"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      autoFocus={autoFocus}
      icone={saisie.mode === 'texte' ? <Mail /> : <Phone />}
      prefixe={telephone ? indicatif : undefined}
      placeholder={t('auth.identifiant.exemple')}
      value={valeur}
      onChange={(e) => {
        const el = e.target
        const suivante = analyserSaisie(el.value, saisie.indicatif)
        // Le curseur n'est recalculé que pour un numéro (reformaté avec des espaces) : en e-mail, le texte
        // n'est pas transformé et le navigateur garde lui-même la bonne position (sinon « su » devenait « us »).
        if (suivante.mode === 'telephone') {
          const avant = el.value.slice(0, el.selectionStart ?? el.value.length)
          curseur.current = (avant.match(/\d/g) ?? []).length
        } else {
          curseur.current = null
        }
        onChange(suivante)
        setOuverte(true)
        setActive(-1)
      }}
      erreur={erreur}
      aide={aide}
      data-mode={saisie.mode}
    />
    {visible && (
      <ul
        id={idListe}
        role="listbox"
        aria-label={t('auth.identifiant.suggestions')}
        data-suggestions
        className="verre-fort absolute inset-x-0 top-[4.6rem] z-30 flex flex-col gap-0.5 overflow-hidden rounded-2xl p-1.5 shadow-lg"
      >
        {proposees.map((v, i) => (
          <li
            key={v}
            id={`${idListe}-${i}`}
            role="option"
            aria-selected={i === active}
            // mousedown : choisir avant que le champ ne perde le focus (la liste se fermerait).
            onMouseDown={(e) => {
              e.preventDefault()
              choisir(v)
            }}
            className={cn(
              'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 text-base transition-colors duration-150',
              i === active ? 'bg-accent-doux text-texte' : 'text-texte hover:bg-surface-2',
            )}
          >
            <History size={16} className="shrink-0 text-texte-3" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate tabulaire">{libelleSuggestion(v)}</span>
            {onOublier && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={t('auth.identifiant.oublier', { identifiant: libelleSuggestion(v) })}
                title={t('auth.identifiant.oublier', { identifiant: libelleSuggestion(v) })}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onOublier(v)
                }}
                className="zone-tactile inline-flex size-8 shrink-0 items-center justify-center rounded-full text-texte-3 hover:bg-surface-3 hover:text-texte"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    )}
    </div>
  )
}
