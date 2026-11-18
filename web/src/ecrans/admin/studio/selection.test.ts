import { describe, expect, it } from 'vitest'
import type { CleAudio } from '@/api/types'
import registre from '@/voix/cles-vocales.json'
import { CLES_VIDEO, filtrerCles, prochaineManquante } from './selection'

const cle = (c: string, ordre: number, enregistree = false): CleAudio => ({
  cle: c, ecran: c.split('.')[0]!, contexte: '', texte_fr: c, texte_en: c, essentielle: true, ordre,
  etats: enregistree ? { wo: { statut: 'publie', id: 1 } as never } : {},
})

describe('filtre « Pour la vidéo » du studio', () => {
  it('ne garde que les phrases de la vidéo, dans l’ordre des plans (pas celui de l’application)', () => {
    const cles = [cle('caisse.encaisser', 1), cle('reglages.titre', 2), cle('langue.titre', 3), cle('pictos.pain', 4)]
    const liste = filtrerCles(cles, { langue: 'wo', ecran: null, manquants: false, q: '', video: true })
    expect(liste.map((c) => c.cle)).toEqual(['langue.titre', 'caisse.encaisser', 'pictos.pain'])
  })

  it('le mode rafale reste dans la liste de la vidéo', () => {
    const cles = filtrerCles([cle('langue.titre', 1, true), cle('reglages.titre', 2), cle('caisse.encaisser', 3)], { langue: 'wo', ecran: null, manquants: false, q: '', video: true })
    expect(prochaineManquante(cles, 'wo', 'langue.titre')).toBe('caisse.encaisser')
  })

  it('chaque phrase de la vidéo existe dans le registre des clés vocales', () => {
    const connues = new Set((registre as { cle: string }[]).map((e) => e.cle))
    expect(CLES_VIDEO.filter((c) => !connues.has(c))).toEqual([])
  })
})
