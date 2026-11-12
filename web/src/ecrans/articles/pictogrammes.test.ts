import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/articles.en.json'
import fr from '@/i18n/articles.fr.json'
import { COULEURS_ARTICLES } from '@/lib/couleursArticles'
import { libelleArticle } from './libelle'
import { bornesVoix, encoderWav } from './decoupeSilences'
import { dimensionsReduites } from './photo'
import { CATEGORIES_PICTOS, pictogramme, PICTOGRAMMES } from './pictogrammes'

describe('pictogrammes d\'articles', () => {
  it('sont exactement la liste fermée du serveur (api/app/Support/Pictogrammes.php), dans le même ordre', () => {
    const php = readFileSync(resolve(__dirname, '../../../../api/app/Support/Pictogrammes.php'), 'utf8')
    const bloc = php.slice(php.indexOf('LIBELLES = ['), php.indexOf('];', php.indexOf('LIBELLES = [')))
    const serveur = [...bloc.matchAll(/^\s*'([a-z]+)' =>/gm)].map((m) => m[1])
    expect(serveur.length).toBeGreaterThanOrEqual(40)
    expect(PICTOGRAMMES.map((p) => p.id)).toEqual(serveur)
  })

  it('ont un id unique, une catégorie, une couleur de tuile et un nom FR / EN', () => {
    const ids = PICTOGRAMMES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PICTOGRAMMES) {
      expect(CATEGORIES_PICTOS).toContain(p.categorie)
      expect(COULEURS_ARTICLES).toContain(p.couleur)
      expect(fr.pictos[p.id as keyof typeof fr.pictos], p.id).toBeTruthy()
      expect(en.pictos[p.id as keyof typeof en.pictos], p.id).toBeTruthy()
    }
    for (const c of CATEGORIES_PICTOS) expect(PICTOGRAMMES.some((p) => p.categorie === c)).toBe(true)
  })

  it('couvrent le commerce local demandé (pain, riz, sucre, huile, thé, tissu, crédit, gaz…)', () => {
    for (const id of ['pain', 'riz', 'sucre', 'huile', 'the', 'cafe', 'lait', 'eau', 'jus', 'viande', 'poisson', 'legumes', 'fruits', 'plat', 'tissu', 'vetement', 'chaussure', 'savon', 'credit', 'telephone', 'electricite', 'gaz', 'medicament', 'cigarette', 'fournitures', 'bijou', 'coiffure', 'service', 'divers']) {
      expect(pictogramme(id), id).not.toBeNull()
    }
    expect(pictogramme('licorne')).toBeNull()
    expect(pictogramme(null)).toBeNull()
  })
})

describe('libellé d\'un article sans nom écrit', () => {
  const t = ((cle: string, o?: { defaultValue?: string }) => ({ 'caisse.article': 'Article', 'pictos.pain': 'Pain' })[cle] ?? o?.defaultValue ?? cle) as never

  it('nom écrit, sinon nom du pictogramme, sinon « Article »', () => {
    expect(libelleArticle({ nom: 'Café Touba', pictogramme: 'cafe' }, t)).toBe('Café Touba')
    expect(libelleArticle({ nom: null, pictogramme: 'pain' }, t)).toBe('Pain')
    expect(libelleArticle({ nom: '   ', pictogramme: null }, t)).toBe('Article')
    expect(libelleArticle({ nom: null, pictogramme: 'inconnu' }, t)).toBe('Article')
  })
})

describe('découpe des silences du nom dit (version locale, à fusionner)', () => {
  const taux = 16_000
  const signal = (silenceS: number, voixS: number, finS: number, bruit = 0.002) => {
    const n = Math.round((silenceS + voixS + finS) * taux)
    const s = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const tps = i / taux
      const voix = tps >= silenceS && tps < silenceS + voixS ? 0.4 * Math.sin(2 * Math.PI * 220 * tps) : 0
      s[i] = voix + bruit * Math.sin(i * 12.9898)
    }
    return s
  }

  it('garde la voix et 120 ms autour, coupe les silences du début et de la fin', () => {
    const bornes = bornesVoix(signal(1, 0.8, 1.2), taux)
    expect(bornes).not.toBeNull()
    const [debut, fin] = bornes!
    expect(debut / taux).toBeGreaterThan(0.8)
    expect(debut / taux).toBeLessThan(1)
    expect(fin / taux).toBeGreaterThan(1.8)
    expect(fin / taux).toBeLessThan(2.0)
  })

  it('ne trouve aucune voix dans un silence (l\'enregistrement est alors gardé tel quel)', () => {
    expect(bornesVoix(new Float32Array(taux), taux)).toBeNull()
  })

  it('produit un WAV PCM 16 bits mono valide', async () => {
    const wav = encoderWav(new Float32Array([0, 0.5, -0.5, 1]), taux)
    expect(wav.type).toBe('audio/wav')
    const octets = new Uint8Array(await wav.arrayBuffer())
    expect(String.fromCharCode(...octets.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...octets.slice(8, 12))).toBe('WAVE')
    expect(octets.length).toBe(44 + 4 * 2)
  })
})

describe('photo réduite avant l\'envoi', () => {
  it('ramène le plus grand côté à 1024 px sans jamais agrandir', () => {
    expect(dimensionsReduites(4000, 3000)).toEqual({ largeur: 1024, hauteur: 768 })
    expect(dimensionsReduites(3000, 4000)).toEqual({ largeur: 768, hauteur: 1024 })
    expect(dimensionsReduites(640, 480)).toEqual({ largeur: 640, hauteur: 480 })
  })
})
