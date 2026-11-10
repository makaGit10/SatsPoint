import { describe, expect, it } from 'vitest'
import { classesCouleur, COULEURS_MOYEN, formaterNumeroMarchand, instructionsMoyen } from './couleursMoyens'

describe('moyens de paiement du pays : affichage', () => {
  it('numéro marchand lisible en grand sur l’écran de paiement', () => {
    expect(formaterNumeroMarchand('+2250708091011')).toBe('+225 07 08 09 10 11')
    expect(formaterNumeroMarchand('+225 07 08 09 10 11')).toBe('+225 07 08 09 10 11')
    expect(formaterNumeroMarchand('+22670123456')).toBe('+226 70 12 34 56')
    // Code marchand court : inchangé.
    expect(formaterNumeroMarchand('123456')).toBe('123456')
  })

  it('liste fermée de couleurs, repli gris pour une valeur inconnue', () => {
    expect(COULEURS_MOYEN).toHaveLength(8)
    expect(classesCouleur('orange').pastille).toBe('bg-orange-500')
    expect(classesCouleur('fuchsia')).toBe(classesCouleur('gris'))
    expect(classesCouleur(null)).toBe(classesCouleur('gris'))
  })

  it('instructions dans la langue de l’interface, avec repli', () => {
    const m = { instructions_fr: 'Payez au numéro affiché.', instructions_en: null }
    expect(instructionsMoyen(m, 'fr')).toBe('Payez au numéro affiché.')
    expect(instructionsMoyen(m, 'en')).toBe('Payez au numéro affiché.')
    expect(instructionsMoyen({ instructions_fr: null, instructions_en: null }, 'fr')).toBeNull()
  })
})
