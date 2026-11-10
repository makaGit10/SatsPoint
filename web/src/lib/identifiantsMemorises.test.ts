import { beforeEach, describe, expect, it } from 'vitest'
import { filtrerSuggestions, identifiantsMemorises, memoriserIdentifiant, oublierIdentifiant } from './identifiantsMemorises'

describe('« Se souvenir de moi » : identifiants mémorisés', () => {
  beforeEach(() => localStorage.clear())

  it('garde les 3 derniers, le plus récent en tête, sans doublon', () => {
    for (const v of ['a@x.sn', '+221771234567', 'b@x.sn', 'A@X.sn', 'c@x.sn']) memoriserIdentifiant(v)
    expect(identifiantsMemorises()).toEqual(['c@x.sn', 'A@X.sn', 'b@x.sn'])
    oublierIdentifiant('b@x.sn')
    expect(identifiantsMemorises()).toEqual(['c@x.sn', 'A@X.sn'])
  })

  it('ne stocke que des identifiants (jamais de mot de passe) et résiste à un stockage corrompu', () => {
    memoriserIdentifiant('awa@exemple.sn')
    expect(Object.keys(localStorage)).toEqual(['satspoint.identifiants'])
    expect(localStorage.getItem('satspoint.identifiants')).toBe('["awa@exemple.sn"]')
    localStorage.setItem('satspoint.identifiants', '{pas du json')
    expect(identifiantsMemorises()).toEqual([])
  })

  it('complète un e-mail ou un numéro dès les premiers caractères', () => {
    const liste = ['susu@test.sn', '+221771234567', 'awa@exemple.sn']
    expect(filtrerSuggestions(liste, '', '221')).toEqual(liste)
    expect(filtrerSuggestions(liste, 'su', '221')).toEqual(['susu@test.sn'])
    expect(filtrerSuggestions(liste, 'SU', '221')).toEqual(['susu@test.sn'])
    expect(filtrerSuggestions(liste, '77 12', '221')).toEqual(['+221771234567'])
    expect(filtrerSuggestions(liste, '78', '221')).toEqual([])
    // Valeur déjà complète : plus rien à proposer.
    expect(filtrerSuggestions(liste, 'susu@test.sn', '221')).toEqual([])
    expect(filtrerSuggestions(liste, '77 123 45 67', '221')).toEqual([])
  })
})
