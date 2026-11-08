import { describe, expect, it } from 'vitest'
import { analyserSaisie, formaterChiffres, positionApresChiffres, texteAffiche, valeurIdentifiant, verifierIdentifiant } from './identifiant'
import { forceMotDePasse } from './motDePasse'

describe('champ « Téléphone ou e-mail »', () => {
  it('un numéro sénégalais se met en forme et part en E.164', () => {
    const s = analyserSaisie('771234567', '221')
    expect(s.mode).toBe('telephone')
    expect(texteAffiche(s)).toBe('77 123 45 67')
    expect(valeurIdentifiant(s)).toBe('+221771234567')
    expect(verifierIdentifiant(s)).toBeNull()
  })

  it('reformate pendant la frappe et à partir d’un texte déjà espacé', () => {
    expect(texteAffiche(analyserSaisie('7712', '221'))).toBe('77 12')
    expect(texteAffiche(analyserSaisie('77 123 4567', '221'))).toBe('77 123 45 67')
  })

  it('reconnaît un indicatif tapé (+221, 00225, +33) et retire le 0 national en France', () => {
    const sn = analyserSaisie('+221 70 123 45 67', '221')
    expect(sn).toMatchObject({ mode: 'telephone', indicatif: '221', chiffres: '701234567' })
    expect(analyserSaisie('00225 07 08 09 10 11', '221')).toMatchObject({ mode: 'telephone', indicatif: '225', chiffres: '0708091011' })
    const fr = analyserSaisie('+33 06 12 34 56 78', '221')
    expect(fr).toMatchObject({ indicatif: '33' })
    expect(valeurIdentifiant(fr)).toBe('+33612345678')
  })

  it('« 221771234567 » sans + avec l’indicatif +221 déjà choisi ne double pas l’indicatif', () => {
    expect(valeurIdentifiant(analyserSaisie('221771234567', '221'))).toBe('+221771234567')
  })

  it('une lettre ou un « @ » passe en e-mail, laissé tel quel', () => {
    const s = analyserSaisie('Awa@Exemple.sn ', '221')
    expect(s.mode).toBe('texte')
    expect(valeurIdentifiant(s)).toBe('Awa@Exemple.sn')
    expect(verifierIdentifiant(s)).toBeNull()
    expect(verifierIdentifiant(analyserSaisie('awa@', '221'))).toBe('emailInvalide')
  })

  it('signale un numéro sénégalais incomplet, un champ vide ou un texte qui n’est ni l’un ni l’autre', () => {
    expect(verifierIdentifiant(analyserSaisie('77 12', '221'))).toBe('telephoneSenegal')
    expect(verifierIdentifiant(analyserSaisie('   ', '221'))).toBe('vide')
    expect(verifierIdentifiant(analyserSaisie('awa ndiaye', '221'))).toBe('invalide')
  })

  it('groupe par deux hors Sénégal et replace le curseur après le bon chiffre', () => {
    expect(formaterChiffres('0708091011', '225')).toBe('07 08 09 10 11')
    expect(positionApresChiffres('77 123 45 67', 3)).toBe(4)
    expect(positionApresChiffres('77 123 45 67', 0)).toBe(0)
  })
})

describe('jauge du mot de passe', () => {
  it('trop court sous 12 caractères, puis correct, puis solide', () => {
    expect(forceMotDePasse('')).toBe(0)
    expect(forceMotDePasse('abc')).toBe(1)
    expect(forceMotDePasse('abcdefghijkl')).toBe(2)
    expect(forceMotDePasse('Abcdefghij12')).toBe(3)
    expect(forceMotDePasse('une phrase assez longue')).toBe(3)
  })
})
