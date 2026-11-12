/**
 * Photo d'article prise au téléphone : réduite AVANT l'envoi (1024 px, JPEG 0,85 — 100 à 250 Ko au lieu de 3 à 8 Mo,
 * envoi rapide en 3G), orientation appliquée par le navigateur. Le serveur vérifie le type réel et ré-encode
 * de toute façon (WebP 512 px, métadonnées retirées) : ce traitement n'est qu'un confort, jamais une protection.
 */
export const TAILLE_MAX_PHOTO = 4 * 1024 * 1024
export const COTE_ENVOI = 1024

export type RefusPhoto = 'lourde' | 'illisible'

export class ErreurPhoto extends Error {
  readonly motif: RefusPhoto
  constructor(motif: RefusPhoto) {
    super(motif)
    this.motif = motif
  }
}

/** Dimensions réduites (ratio conservé, jamais agrandies). */
export function dimensionsReduites(largeur: number, hauteur: number, cote = COTE_ENVOI): { largeur: number; hauteur: number } {
  const ratio = Math.min(1, cote / Math.max(largeur, hauteur, 1))
  return { largeur: Math.max(1, Math.round(largeur * ratio)), hauteur: Math.max(1, Math.round(hauteur * ratio)) }
}

export async function preparerPhoto(fichier: File | Blob): Promise<Blob> {
  if (!fichier.type.startsWith('image/') && fichier.type !== '') throw new ErreurPhoto('illisible')
  try {
    const image = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
    const { largeur, hauteur } = dimensionsReduites(image.width, image.height)
    const toile = document.createElement('canvas')
    toile.width = largeur
    toile.height = hauteur
    const contexte = toile.getContext('2d')
    if (!contexte) throw new Error('contexte')
    contexte.drawImage(image, 0, 0, largeur, hauteur)
    image.close()
    const reduite = await new Promise<Blob | null>((r) => toile.toBlob(r, 'image/jpeg', 0.85))
    if (reduite && reduite.size > 0) return reduite
  } catch {
    // Format que le navigateur ne sait pas décoder (HEIC hors Safari…) : on laisse le serveur trancher.
  }
  if (fichier.size > TAILLE_MAX_PHOTO) throw new ErreurPhoto('lourde')
  return fichier
}
