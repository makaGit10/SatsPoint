import { describe, expect, it } from 'vitest'
import type { LanguePublique, PaysPublic } from '@/api/types'
import { languesDuFiltre } from '@/ecrans/admin/studio/selection'
import { deduirePays, estCodePays, LANGUES_REPLI, languesDuPays, languesProposees, MOTIF_CODE_LANGUE, nomLangue, nomPays, PAYS_REPLI } from './catalogue'

const PAYS: PaysPublic[] = [
  { code: 'SN', nom_fr: 'Sénégal', nom_en: 'Senegal', indicatif: '+221' },
  { code: 'CI', nom_fr: "Côte d'Ivoire", nom_en: "Côte d'Ivoire", indicatif: '+225' },
  { code: 'BF', nom_fr: 'Burkina Faso', nom_en: 'Burkina Faso', indicatif: '+226' },
]
const LANGUES: LanguePublique[] = [
  ...LANGUES_REPLI,
  { code: 'dyu', nom_local: 'Jula', nom_fr: 'Dioula', nom_en: 'Dyula', pays: ['CI', 'BF'], ordre: 6 },
  { code: 'mos', nom_local: 'Mòoré', nom_fr: 'Mooré', nom_en: 'Mossi', pays: ['BF'], ordre: 5 },
]

describe('catalogue pays / langues (CONTRAT_API § 14)', () => {
  it('Sénégal : comportement inchangé (wolof, seereer, pulaar, joola puis français)', () => {
    expect(languesDuPays(LANGUES, 'SN').map((l) => l.code)).toEqual(['wo', 'srr', 'ff', 'dyo'])
    expect(languesProposees(LANGUES, 'SN').map((l) => l.code)).toEqual(['wo', 'srr', 'ff', 'dyo', 'fr'])
  })

  it('filtre par pays, dans l’ordre du catalogue ; le français est proposé partout', () => {
    expect(languesDuPays(LANGUES, 'CI').map((l) => l.code)).toEqual(['dyu'])
    expect(languesProposees(LANGUES, 'BF').map((l) => l.code)).toEqual(['mos', 'dyu', 'fr'])
    // Pays sans langue locale au catalogue : seulement le français.
    expect(languesProposees(LANGUES, 'TG').map((l) => l.code)).toEqual(['fr'])
  })

  it('déduit le pays de la région du navigateur, sinon Sénégal', () => {
    expect(deduirePays('fr-CI', PAYS)).toBe('CI')
    expect(deduirePays('fr_BF', PAYS)).toBe('BF')
    expect(deduirePays('fr', PAYS)).toBe('SN')
    expect(deduirePays('fr-FR', PAYS)).toBe('SN')
    expect(deduirePays('fr-CI', PAYS_REPLI)).toBe('SN')
    expect(deduirePays(null, PAYS)).toBe('SN')
  })

  it('codes de langue : motif du serveur', () => {
    for (const ok of ['wo', 'srr', 'bm', 'dyu', 'mos', 'ff-ml', 'bamanank']) expect(MOTIF_CODE_LANGUE.test(ok)).toBe(true)
    for (const ko of ['', 'w', 'WO', 'w0', 'ff-', '-ff', 'ff-mali', '../fr', 'abcdefghi']) expect(MOTIF_CODE_LANGUE.test(ko)).toBe(false)
    expect(estCodePays('CI', PAYS)).toBe(true)
    expect(estCodePays('GN', PAYS)).toBe(false)
  })

  it('noms selon la langue de l’interface', () => {
    expect(nomPays(PAYS[0], 'en')).toBe('Senegal')
    expect(nomPays(PAYS[0], 'fr')).toBe('Sénégal')
    expect(nomLangue(LANGUES[1], 'en')).toBe('Serer')
    expect(nomPays(undefined, 'fr')).toBe('')
  })

  it('studio : colonnes filtrées par pays (+ langues de tous les pays)', () => {
    const colonnes = LANGUES.map((l) => ({ code: l.code, nom: l.nom_fr, pays: l.pays }))
    expect(languesDuFiltre(colonnes, '').map((l) => l.code)).toEqual(colonnes.map((l) => l.code))
    expect(languesDuFiltre(colonnes, 'BF').map((l) => l.code)).toEqual(['fr', 'dyu', 'mos'])
    expect(languesDuFiltre(colonnes, 'SN').map((l) => l.code)).toEqual(['wo', 'srr', 'ff', 'dyo', 'fr'])
    // Ancienne matrice sans `pays` : la colonne reste visible.
    const ancienne: Array<{ code: string; nom: string; pays?: string[] }> = [{ code: 'wo', nom: 'Wolof' }]
    expect(languesDuFiltre(ancienne, 'CI')).toHaveLength(1)
  })
})
