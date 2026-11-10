import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { ChampIdentifiant } from './ChampIdentifiant'
import { analyserSaisie, type SaisieIdentifiant } from './identifiant'

function Formulaire() {
  const [saisie, setSaisie] = useState<SaisieIdentifiant>(analyserSaisie('', '221'))
  return <ChampIdentifiant libelle="Téléphone ou e-mail" saisie={saisie} onChange={setSaisie} />
}

/** Frappe touche par touche à la position réelle du curseur (comme un clavier). */
function taper(champ: HTMLInputElement, texte: string) {
  for (const touche of texte) {
    const pos = champ.selectionStart ?? champ.value.length
    const valeur = champ.value.slice(0, pos) + touche + champ.value.slice(pos)
    fireEvent.change(champ, { target: { value: valeur, selectionStart: pos + 1, selectionEnd: pos + 1 } })
  }
}

describe('champ « Téléphone ou e-mail » pendant la frappe', () => {
  it('garde le curseur à la fin pour un e-mail (« su » ne devient pas « us »)', () => {
    render(<Formulaire />)
    const champ = screen.getByLabelText('Téléphone ou e-mail') as HTMLInputElement
    champ.focus()
    taper(champ, 'susu@test.sn')
    expect(champ.value).toBe('susu@test.sn')
  })

  it('met toujours un numéro en forme', () => {
    render(<Formulaire />)
    const champ = screen.getByLabelText('Téléphone ou e-mail') as HTMLInputElement
    champ.focus()
    taper(champ, '771234567')
    expect(champ.value).toBe('77 123 45 67')
  })
})
