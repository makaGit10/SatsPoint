import { BASE_API, enCorpsErreur, ErreurApi, lireCorps, signalerNonAuthentifie } from './client'

/**
 * Téléchargement d'un fichier (export) : `fetch` pour garder les cookies de session, puis lien temporaire.
 * Le nom vient de `Content-Disposition` s'il est fourni, sinon de `nomParDefaut`.
 */
export async function telecharger(chemin: string, nomParDefaut: string): Promise<void> {
  const url = chemin.startsWith('/api/') ? chemin : `${BASE_API}${chemin}`
  let reponse: Response
  try {
    reponse = await fetch(url, { credentials: 'include', headers: { Accept: '*/*' } })
  } catch {
    throw new ErreurApi(0, null, { reseau: true })
  }
  if (!reponse.ok) {
    const erreur = new ErreurApi(reponse.status, enCorpsErreur(await lireCorps(reponse)))
    if (erreur.estNonAuthentifie) signalerNonAuthentifie()
    throw erreur
  }
  const disposition = reponse.headers.get('content-disposition') ?? ''
  const nom = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1]
  const blob = await reponse.blob()
  const lien = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = lien
  a.download = nom ? decodeURIComponent(nom) : nomParDefaut
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(lien), 1000)
}
