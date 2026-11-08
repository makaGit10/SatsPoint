import { describe, expect, it } from 'vitest'
import en from './en.json'
import fr from './fr.json'

type Arbre = { [cle: string]: string | Arbre }

function aplatir(objet: Arbre, prefixe = ''): Map<string, string> {
  const resultat = new Map<string, string>()
  for (const [cle, valeur] of Object.entries(objet)) {
    const chemin = prefixe ? `${prefixe}.${cle}` : cle
    if (typeof valeur === 'string') resultat.set(chemin, valeur)
    else for (const [c, v] of aplatir(valeur, chemin)) resultat.set(c, v)
  }
  return resultat
}

const FR = aplatir(fr as Arbre)
const EN = aplatir(en as Arbre)

describe('parité des traductions FR / EN', () => {
  it('toute clé FR existe en EN', () => {
    const manquantes = [...FR.keys()].filter((c) => !EN.has(c))
    expect(manquantes, `Clés absentes de en.json : ${manquantes.join(', ')}`).toEqual([])
  })

  it('toute clé EN existe en FR', () => {
    const manquantes = [...EN.keys()].filter((c) => !FR.has(c))
    expect(manquantes, `Clés absentes de fr.json : ${manquantes.join(', ')}`).toEqual([])
  })

  it('aucune valeur vide', () => {
    const vides = [...FR, ...EN].filter(([, v]) => v.trim() === '').map(([c]) => c)
    expect(vides).toEqual([])
  })

  it('les clés suivent la convention ecran.element (minuscules, camelCase, points)', () => {
    const invalides = [...FR.keys()].filter((c) => !/^[a-z][a-zA-Z0-9_]*(\.[a-z][a-zA-Z0-9_]*)+$/.test(c))
    expect(invalides).toEqual([])
  })

  it('les paramètres d’interpolation sont identiques dans les deux langues', () => {
    const params = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort()
    const differences = [...FR.keys()].filter((c) => {
      const e = EN.get(c)
      return e !== undefined && params(FR.get(c)!).join(',') !== params(e).join(',')
    })
    expect(differences).toEqual([])
  })
})
