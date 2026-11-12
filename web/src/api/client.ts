import type { CorpsErreur } from './types'

/**
 * Client HTTP typé pour l'API (`/api/v1`) : cookies de session Sanctum, CSRF,
 * erreurs normalisées, 401 → redirection vers la connexion (sauf routes publiques).
 * Aucun jeton n'est stocké côté client : tout passe par les cookies HttpOnly.
 */

export const BASE_API = '/api/v1'

export type Methode = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface OptionsRequete {
  methode?: Methode
  corps?: unknown
  signal?: AbortSignal
  /** Route publique : un 401 n'entraîne pas de redirection. */
  publique?: boolean
  enTetes?: Record<string, string>
  /** Mode du cache HTTP du navigateur (ex. `no-cache` : toujours revalider, l'ETag rend la réponse légère). */
  cache?: RequestCache
}

export class ErreurApi extends Error {
  readonly statut: number
  readonly code: string | undefined
  readonly errors: Record<string, string[]> | undefined
  /** Vrai si l'appel n'a même pas atteint le serveur (réseau coupé). */
  readonly reseau: boolean

  constructor(statut: number, corps: Partial<CorpsErreur> | null, options: { reseau?: boolean } = {}) {
    super(corps?.message ?? '')
    this.name = 'ErreurApi'
    this.statut = statut
    this.code = corps?.code
    this.errors = corps?.errors
    this.reseau = options.reseau ?? false
  }

  /** Premier message de validation pour un champ (422). */
  champ(nom: string): string | undefined {
    return this.errors?.[nom]?.[0]
  }

  get estValidation() {
    return this.statut === 422
  }
  get estNonAuthentifie() {
    return this.statut === 401
  }
  get estInterdit() {
    return this.statut === 403
  }
  get estTropDeTentatives() {
    return this.statut === 429
  }
  get estServeur() {
    return this.statut >= 500
  }
}

let gestionnaireNonAuthentifie: (() => void) | null = null

/** Appelé par les téléchargements (`telechargement.ts`) sur un 401. */
export function signalerNonAuthentifie() {
  gestionnaireNonAuthentifie?.()
}
let gestionnaireDeuxFa: ((etape: 'activer' | 'verifier') => void) | null = null

/** Branché par le store d'authentification : appelé sur un 401 d'une route privée. */
export function definirGestionnaireNonAuthentifie(fn: (() => void) | null) {
  gestionnaireNonAuthentifie = fn
}

/** Branché par le store d'authentification : appelé sur un `403 DEUX_FA_REQUISE` (double authentification à valider). */
export function definirGestionnaireDeuxFa(fn: ((etape: 'activer' | 'verifier') => void) | null) {
  gestionnaireDeuxFa = fn
}

export function lireCookie(nom: string): string | null {
  const morceaux = document.cookie ? document.cookie.split('; ') : []
  for (const morceau of morceaux) {
    const indice = morceau.indexOf('=')
    const cle = indice >= 0 ? morceau.slice(0, indice) : morceau
    if (cle === nom) return decodeURIComponent(morceau.slice(indice + 1))
  }
  return null
}

let promesseCsrf: Promise<void> | null = null

/** Garantit la présence du cookie XSRF-TOKEN (une seule requête en vol à la fois). */
export async function assurerCsrf(force = false): Promise<void> {
  if (!force && lireCookie('XSRF-TOKEN')) return
  promesseCsrf ??= fetch('/sanctum/csrf-cookie', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
    .then(() => undefined)
    .finally(() => {
      promesseCsrf = null
    })
  await promesseCsrf
}

export async function lireCorps(reponse: Response): Promise<unknown> {
  if (reponse.status === 204) return null
  const type = reponse.headers.get('content-type') ?? ''
  if (!type.includes('json')) return null
  try {
    return await reponse.json()
  } catch {
    return null
  }
}

export function enCorpsErreur(valeur: unknown): Partial<CorpsErreur> | null {
  if (!valeur || typeof valeur !== 'object') return null
  const v = valeur as Record<string, unknown>
  return {
    message: typeof v.message === 'string' ? v.message : undefined,
    code: typeof v.code === 'string' ? v.code : undefined,
    errors: v.errors && typeof v.errors === 'object' ? (v.errors as Record<string, string[]>) : undefined,
  }
}

/**
 * Appel typé. `chemin` est relatif à `/api/v1` (ex. `/moi`) ou absolu s'il commence par `/sanctum`, `/broadcasting`, `/audio` ou `/r`.
 */
export async function api<T>(chemin: string, options: OptionsRequete = {}): Promise<T> {
  const methode = options.methode ?? 'GET'
  const mutante = methode !== 'GET'
  const url = chemin.startsWith('/api/') || /^\/(sanctum|broadcasting|audio|r)\//.test(chemin) ? chemin : `${BASE_API}${chemin}`

  const executer = async (): Promise<Response> => {
    const enTetes: Record<string, string> = { Accept: 'application/json', ...options.enTetes }
    const multipart = typeof FormData !== 'undefined' && options.corps instanceof FormData
    // Multipart : le navigateur pose lui-même `Content-Type` avec la frontière.
    if (options.corps !== undefined && !multipart) enTetes['Content-Type'] = 'application/json'
    if (mutante) {
      await assurerCsrf()
      const jeton = lireCookie('XSRF-TOKEN')
      if (jeton) enTetes['X-XSRF-TOKEN'] = jeton
    }
    const init: RequestInit = { method: methode, credentials: 'include', headers: enTetes }
    if (options.signal) init.signal = options.signal
    if (options.cache) init.cache = options.cache
    if (options.corps !== undefined) init.body = multipart ? (options.corps as FormData) : JSON.stringify(options.corps)
    return fetch(url, init)
  }

  let reponse: Response
  try {
    reponse = await executer()
    // Jeton CSRF périmé : on le renouvelle une fois puis on rejoue.
    if (reponse.status === 419 && mutante) {
      await assurerCsrf(true)
      reponse = await executer()
    }
  } catch (erreur) {
    if (erreur instanceof DOMException && erreur.name === 'AbortError') throw erreur
    throw new ErreurApi(0, null, { reseau: true })
  }

  const corps = await lireCorps(reponse)

  if (!reponse.ok) {
    const erreur = new ErreurApi(reponse.status, enCorpsErreur(corps))
    if (erreur.estNonAuthentifie && !options.publique) gestionnaireNonAuthentifie?.()
    if (erreur.estInterdit && erreur.code === 'DEUX_FA_REQUISE') gestionnaireDeuxFa?.((corps as { etape?: string } | null)?.etape === 'activer' ? 'activer' : 'verifier')
    throw erreur
  }

  return corps as T
}

export const http = {
  get: <T>(chemin: string, options?: Omit<OptionsRequete, 'methode' | 'corps'>) => api<T>(chemin, { ...options, methode: 'GET' }),
  post: <T>(chemin: string, corps?: unknown, options?: Omit<OptionsRequete, 'methode' | 'corps'>) =>
    api<T>(chemin, { ...options, methode: 'POST', corps }),
  patch: <T>(chemin: string, corps?: unknown, options?: Omit<OptionsRequete, 'methode' | 'corps'>) =>
    api<T>(chemin, { ...options, methode: 'PATCH', corps }),
  put: <T>(chemin: string, corps?: unknown, options?: Omit<OptionsRequete, 'methode' | 'corps'>) =>
    api<T>(chemin, { ...options, methode: 'PUT', corps }),
  delete: <T>(chemin: string, options?: Omit<OptionsRequete, 'methode'>) =>
    api<T>(chemin, { ...options, methode: 'DELETE' }),
}

