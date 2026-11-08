import { ChevronDown, Mail, Phone } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Champ } from '@/composants/Champ'
import { analyserSaisie, INDICATIFS, positionApresChiffres, texteAffiche, type SaisieIdentifiant } from './identifiant'

/**
 * « Téléphone ou e-mail » en un seul champ : un chiffre tapé fait apparaître l'indicatif (+221 par défaut, modifiable)
 * et le numéro se met en forme tout seul (`77 123 45 67`) ; une lettre ou un « @ » passe en e-mail.
 */
export function ChampIdentifiant({
  libelle,
  saisie,
  onChange,
  erreur,
  aide,
  autoFocus,
}: {
  libelle: string
  saisie: SaisieIdentifiant
  onChange: (saisie: SaisieIdentifiant) => void
  erreur?: ReactNode
  aide?: ReactNode
  autoFocus?: boolean
}) {
  const { t, i18n } = useTranslation()
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
    <Champ
      ref={champ}
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
        const avant = el.value.slice(0, el.selectionStart ?? el.value.length)
        curseur.current = (avant.match(/\d/g) ?? []).length
        onChange(analyserSaisie(el.value, saisie.indicatif))
      }}
      erreur={erreur}
      aide={aide}
      data-mode={saisie.mode}
    />
  )
}
