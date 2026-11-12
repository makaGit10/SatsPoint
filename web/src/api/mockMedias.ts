/**
 * Mock — articles sans écrire (CONTRAT_API § 15) : photo et nom dit à voix haute.
 * Les fichiers restent dans le navigateur (URL `blob:`) ; mêmes règles que le serveur pour les cas utiles aux écrans :
 * type d'image, 4 Mo / 1 Mo, et un article garde toujours au moins une identité (`ARTICLE_SANS_IDENTITE`).
 */
import { encoderWav } from '@/ecrans/articles/decoupeSilences'
import type { Article } from './types'

const PICTOS = new Set(['pain', 'riz', 'sucre', 'huile', 'farine', 'lait', 'oeufs', 'viande', 'poulet', 'poisson', 'legumes', 'fruits', 'plat', 'sandwich', 'gateau', 'bonbons', 'glace', 'epicerie', 'eau', 'the', 'cafe', 'jus', 'boisson', 'tissu', 'vetement', 'chaussure', 'sac', 'bijou', 'coiffure', 'beaute', 'savon', 'menage', 'bebe', 'gaz', 'electricite', 'credit', 'telephone', 'medicament', 'cigarette', 'fournitures', 'reparation', 'service', 'divers'])

export const pictogrammeValide = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && PICTOS.has(v))

/** « Photo » de démonstration : un verre de bissap sur une table (illustration légère, sans réseau). */
export function photoDemoBissap(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e3c4"/><stop offset="1" stop-color="#e8c79a"/></linearGradient><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a5a2b"/><stop offset="1" stop-color="#6e3a17"/></linearGradient><linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a0f24"/><stop offset=".45" stop-color="#b3173a"/><stop offset="1" stop-color="#6b0c1f"/></linearGradient></defs><rect width="256" height="256" fill="url(#f)"/><rect y="176" width="256" height="80" fill="url(#t)"/><ellipse cx="128" cy="212" rx="58" ry="10" fill="#000" opacity=".22"/><path d="M84 70h88l-10 132a14 14 0 0 1-14 12h-40a14 14 0 0 1-14-12z" fill="#fff" opacity=".35"/><path d="M90 98h76l-8 102a10 10 0 0 1-10 9h-40a10 10 0 0 1-10-9z" fill="url(#b)"/><path d="M98 104h14l-6 96h-8z" fill="#fff" opacity=".18"/><circle cx="150" cy="86" r="16" fill="#3f8f3a"/><path d="M150 70v32M134 86h32" stroke="#2c6b28" stroke-width="3"/><path d="M118 40l20 66" stroke="#f2f2f2" stroke-width="6" stroke-linecap="round"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** « Nom dit » de démonstration : deux notes courtes (le mock ne sait pas parler). */
export function voixDemo(): string | null {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  const taux = 16_000
  const signal = new Float32Array(Math.round(taux * 0.7))
  for (let i = 0; i < signal.length; i++) {
    const tps = i / taux
    const frequence = tps < 0.33 ? 523 : 659
    const enveloppe = Math.min(1, (tps % 0.33) * 40) * Math.max(0, 1 - ((tps % 0.33) / 0.33) ** 2)
    signal[i] = 0.35 * enveloppe * Math.sin(2 * Math.PI * frequence * tps)
  }
  return URL.createObjectURL(encoderWav(signal, taux))
}

export interface CorpsArticleMock {
  champs: Record<string, unknown>
  photo: File | null
  voix: File | null
}

/** Corps JSON ou multipart (création avec photo / nom dit). */
export async function lireCorpsArticle(init: RequestInit | undefined): Promise<CorpsArticleMock> {
  const corps = init?.body
  if (corps instanceof FormData) {
    const champs: Record<string, unknown> = {}
    for (const [cle, valeur] of corps.entries()) {
      if (typeof valeur !== 'string') continue
      if (cle === 'prix_xof' || cle === 'position') champs[cle] = Number(valeur)
      else if (cle === 'actif') champs[cle] = valeur === '1' || valeur === 'true'
      else champs[cle] = valeur === '' ? null : valeur
    }
    const fichier = (nom: string) => {
      const v = corps.get(nom)
      return v instanceof File ? v : null
    }
    return { champs, photo: fichier('photo'), voix: fichier('voix') }
  }
  if (typeof corps === 'string') {
    try {
      return { champs: JSON.parse(corps) as Record<string, unknown>, photo: null, voix: null }
    } catch {
      /* corps illisible */
    }
  }
  return { champs: {}, photo: null, voix: null }
}

/** Contrôles « serveur » d'un fichier : null si accepté, sinon le corps d'erreur 422. */
export function refusFichier(type: 'photo' | 'voix', fichier: File | null): Record<string, unknown> | null {
  if (!fichier) return { message: 'Ajoutez un fichier.', errors: { fichier: ['Ajoutez un fichier.'] } }
  if (type === 'photo') {
    if (fichier.size > 4 * 1024 * 1024) return { message: 'La photo dépasse 4 Mo.', errors: { fichier: ['La photo dépasse 4 Mo.'] } }
    if (!/^image\/(jpeg|png|webp)$/.test(fichier.type)) return { message: "Le fichier n'est pas une photo reconnue (JPEG, PNG ou WebP).", code: 'PHOTO_TYPE_INVALIDE' }
    return null
  }
  if (fichier.size > 1024 * 1024) return { message: "L'enregistrement dépasse 1 Mo.", errors: { fichier: ["L'enregistrement dépasse 1 Mo."] } }
  if (!/^audio\//.test(fichier.type)) return { message: "Le fichier n'est pas un audio reconnu.", code: 'AUDIO_TYPE_INVALIDE' }
  return null
}

export const aUneIdentite = (a: Pick<Article, 'nom' | 'pictogramme' | 'photo_url' | 'voix_url'>) => Boolean(a.nom?.trim() || a.pictogramme || a.photo_url || a.voix_url)

export function urlFichier(fichier: File): string {
  return URL.createObjectURL(fichier)
}
