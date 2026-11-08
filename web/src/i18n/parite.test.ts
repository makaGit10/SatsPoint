import { describe, expect, it } from 'vitest'
import en from './en.json'
import fr from './fr.json'

/** Paquets chargés à la demande : `<nom>.fr.json` / `<nom>.en.json`, découverts automatiquement. */
const paquets = import.meta.glob<Record<string, unknown>>('./*.*.json', { eager: true, import: 'default' })
const paquetsDe = (locale: 'fr' | 'en') => Object.entries(paquets).filter(([chemin]) => chemin.endsWith(`.${locale}.json`))

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

// Paquet principal + paquets chargés à la demande (même espace de clés).
const FR = new Map([...aplatir(fr as Arbre), ...paquetsDe('fr').flatMap(([, p]) => [...aplatir(p as Arbre)])])
const EN = new Map([...aplatir(en as Arbre), ...paquetsDe('en').flatMap(([, p]) => [...aplatir(p as Arbre)])])

describe('paquets chargés à la demande', () => {
  it('existent dans les deux langues', () => {
    const noms = (l: 'fr' | 'en') => paquetsDe(l).map(([c]) => c.replace(`.${l}.json`, '')).sort()
    expect(noms('fr').length).toBeGreaterThan(0)
    expect(noms('en')).toEqual(noms('fr'))
  })

  it('ne redéfinissent aucune clé (ni du paquet principal, ni entre eux)', () => {
    const vues = new Map<string, string>([...aplatir(fr as Arbre).keys()].map((c) => [c, 'fr.json']))
    const doublons: string[] = []
    for (const [chemin, paquet] of paquetsDe('fr')) {
      for (const cle of aplatir(paquet as Arbre).keys()) {
        if (vues.has(cle)) doublons.push(`${cle} (${vues.get(cle)} et ${chemin})`)
        vues.set(cle, chemin)
      }
    }
    expect(doublons).toEqual([])
  })
})

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
