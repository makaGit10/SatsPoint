/**
 * Mode mock (développement uniquement, `VITE_MOCK_API=true` / `npm run dev:mock`).
 * Intercepte `fetch` pour simuler l'API selon le contrat `/api/v1`. Jamais inclus en production :
 * l'import est dynamique et gardé par `import.meta.env.DEV`.
 */
import type { Config, LangueAudio, ManifesteAudio, Preferences, Utilisateur } from './types'

const CLE_SESSION = 'satspoint.mock.session'
const MOT_DE_PASSE = 'demo12345678'

const PREFERENCES_DEFAUT: Preferences = { locale: 'fr', langue_audio: null, theme: 'auto', aide_vocale: false }

const BOUTIQUE_DEMO = {
  ulid: '01JBOUTIQUEDEMO000000000001',
  nom: 'Boutique Démo',
  ville: 'Dakar',
  devise: 'XOF' as const,
  configuration: { wallet: true, paytech: true, paiement_test: true },
}

const COMPTES: Record<string, Utilisateur> = {
  'proprio@demo.test': {
    ulid: '01JUSERPROPRIO000000000000001',
    nom: 'Awa Ndiaye',
    email: 'proprio@demo.test',
    telephone: '+221771234567',
    role_plateforme: null,
    preferences: { ...PREFERENCES_DEFAUT },
    boutique: { ...BOUTIQUE_DEMO, role: 'proprietaire' },
  },
  'gerant@demo.test': {
    ulid: '01JUSERGERANT0000000000000001',
    nom: 'Fatou Sow',
    email: 'gerant@demo.test',
    telephone: null,
    role_plateforme: null,
    preferences: { ...PREFERENCES_DEFAUT },
    boutique: { ...BOUTIQUE_DEMO, role: 'gerant' },
  },
  'caissier@demo.test': {
    ulid: '01JUSERCAISSIER000000000000001',
    nom: 'Moussa Fall',
    email: 'caissier@demo.test',
    telephone: '+221781234567',
    role_plateforme: null,
    preferences: { ...PREFERENCES_DEFAUT },
    boutique: { ...BOUTIQUE_DEMO, role: 'caissier' },
  },
  'super@demo.test': {
    ulid: '01JUSERSUPER00000000000000001',
    nom: 'Marème Makalou',
    email: 'super@demo.test',
    telephone: null,
    role_plateforme: 'super_admin',
    preferences: { ...PREFERENCES_DEFAUT },
    boutique: null,
  },
  'nouveau@demo.test': {
    ulid: '01JUSERNOUVEAU000000000000001',
    nom: 'Ibrahima Diop',
    email: 'nouveau@demo.test',
    telephone: null,
    role_plateforme: null,
    preferences: { ...PREFERENCES_DEFAUT },
    boutique: null,
  },
}

const CONFIG: Config = {
  app: { nom: 'SatsPoint', env: 'local', demo: true, version: '0.1.0-mock' },
  reverb: { cle: 'mock', hote: 'localhost', port: 8125, schema: 'http' },
  locales: ['fr', 'en'],
  langues_audio: [
    { code: 'wo', nom: 'Wolof', nom_local: 'Wolof' },
    { code: 'srr', nom: 'Sérère', nom_local: 'Seereer' },
    { code: 'ff', nom: 'Pulaar', nom_local: 'Pulaar' },
    { code: 'dyo', nom: 'Diola', nom_local: 'Joola' },
    { code: 'fr', nom: 'Français', nom_local: 'Français' },
  ],
}

/** Clés qui « ont un audio » dans le mock (pour voir les haut-parleurs). */
const CLES_AUDIO = [
  'langue.wo',
  'langue.srr',
  'langue.ff',
  'langue.dyo',
  'langue.fr',
  'langue.en',
  'langue.titre',
  'accueil.creerBoutique',
  'accueil.meConnecter',
  'auth.connexion.valider',
  'auth.connexion.oubli',
  'auth.inscription.valider',
  'auth.oubli.valider',
  'auth.reinit.valider',
  'nav.caisse',
  'nav.ventes',
  'nav.tableau',
  'nav.portefeuille',
  'nav.plus',
  'nav.equipe',
  'nav.articles',
  'nav.reglages',
  'nav.demarrage',
  'caisse.encaisser',
  'caisse.nouvelleVente',
  'caisse.recu',
  'ventes.exporter',
  'portefeuille.recevoir',
  'portefeuille.envoyer',
  'portefeuille.connecter',
  'equipe.inviter',
  'articles.ajouter',
  'demarrage.commencer',
  'utilisateur.deconnexion',
  'introuvable.retour',
  'erreurs.retourCaisse',
]

/** Petit bip WAV (8 kHz, 8 bits, 0,25 s) encodé en data URL — un son audible pour tester le lecteur. */
function bipDataUrl(frequence: number): string {
  const taux = 8000
  const duree = 0.25
  const n = Math.floor(taux * duree)
  const donnees = new Uint8Array(44 + n)
  const vue = new DataView(donnees.buffer)
  const ecrire = (pos: number, s: string) => {
    for (let i = 0; i < s.length; i++) donnees[pos + i] = s.charCodeAt(i)
  }
  ecrire(0, 'RIFF')
  vue.setUint32(4, 36 + n, true)
  ecrire(8, 'WAVE')
  ecrire(12, 'fmt ')
  vue.setUint32(16, 16, true)
  vue.setUint16(20, 1, true)
  vue.setUint16(22, 1, true)
  vue.setUint32(24, taux, true)
  vue.setUint32(28, taux, true)
  vue.setUint16(32, 1, true)
  vue.setUint16(34, 8, true)
  ecrire(36, 'data')
  vue.setUint32(40, n, true)
  for (let i = 0; i < n; i++) {
    const enveloppe = Math.min(1, (n - i) / (n * 0.3), i / (n * 0.1))
    donnees[44 + i] = 128 + Math.round(60 * enveloppe * Math.sin((2 * Math.PI * frequence * i) / taux))
  }
  let binaire = ''
  for (const octet of donnees) binaire += String.fromCharCode(octet)
  return `data:audio/wav;base64,${btoa(binaire)}`
}

const FREQUENCES: Record<LangueAudio, number> = { wo: 440, srr: 494, ff: 523, dyo: 587, fr: 659 }

function manifeste(langue: LangueAudio): ManifesteAudio {
  const url = bipDataUrl(FREQUENCES[langue])
  const audios: Record<string, string> = {}
  // Le français couvre tout (repli) ; les langues locales couvrent un sous-ensemble pour montrer le repli.
  const cles = langue === 'fr' ? CLES_AUDIO : CLES_AUDIO.filter((c) => !c.startsWith('auth.') && c !== 'langue.en')
  for (const cle of cles) audios[cle] = url
  // Le nom de chaque langue est dit dans sa propre langue.
  if (langue !== 'fr') audios[`langue.${langue}`] = url
  return { langue, version: 1, audios }
}

const RECUS: Record<string, unknown> = {
  demo: {
    numero: 'V-000142',
    montant_xof: 15000,
    sats: 23450,
    methode: 'lightning',
    statut: 'payee',
    paye_le: '2026-11-08T14:32:10Z',
    boutique: { nom: 'Boutique Démo', ville: 'Dakar' },
    message: 'Merci de votre visite !',
  },
}

// ---------------------------------------------------------------------------

function lireSession(): Utilisateur | null {
  try {
    const id = sessionStorage.getItem(CLE_SESSION)
    const brut = id ? sessionStorage.getItem(`${CLE_SESSION}.${id}`) : null
    const utilisateur = brut ? (JSON.parse(brut) as Utilisateur) : id && COMPTES[id] ? COMPTES[id] : null
    if (!utilisateur) return null
    // `satspoint.mock.preferences` : préférences du compte imposées (captures d'écran, essais).
    const surcharge = sessionStorage.getItem(`${CLE_SESSION}.preferences`)
    return surcharge ? { ...utilisateur, preferences: { ...utilisateur.preferences, ...(JSON.parse(surcharge) as Partial<Preferences>) } } : utilisateur
  } catch {
    return null
  }
}

function ecrireSession(u: Utilisateur | null) {
  try {
    if (!u) {
      sessionStorage.removeItem(CLE_SESSION)
      return
    }
    const id = u.email ?? u.telephone ?? u.ulid
    sessionStorage.setItem(CLE_SESSION, id)
    sessionStorage.setItem(`${CLE_SESSION}.${id}`, JSON.stringify(u))
  } catch {
    /* ignore */
  }
}

function json(statut: number, corps: unknown = null): Response {
  if (statut === 204 || corps === null) return new Response(null, { status: statut })
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function lireJson(init?: RequestInit): Promise<Record<string, unknown>> {
  if (!init?.body || typeof init.body !== 'string') return {}
  try {
    return JSON.parse(init.body) as Record<string, unknown>
  } catch {
    return {}
  }
}

function trouverCompte(identifiant: string): Utilisateur | null {
  const id = identifiant.trim().toLowerCase()
  if (COMPTES[id]) return COMPTES[id]
  return Object.values(COMPTES).find((c) => c.telephone === identifiant.replace(/\s+/g, '')) ?? null
}

async function repondre(url: URL, init: RequestInit | undefined): Promise<Response | null> {
  const methode = (init?.method ?? 'GET').toUpperCase()
  const chemin = url.pathname

  if (chemin === '/sanctum/csrf-cookie') {
    document.cookie = 'XSRF-TOKEN=jeton-mock; path=/; SameSite=Lax'
    return json(204)
  }

  if (chemin.startsWith('/audio/manifeste/')) {
    const langue = chemin.split('/').pop() as LangueAudio
    if (!(langue in FREQUENCES)) return json(404, { message: 'Langue inconnue' })
    return json(200, manifeste(langue))
  }

  if (chemin.startsWith('/r/')) {
    const jeton = decodeURIComponent(chemin.slice(3))
    const recu = RECUS[jeton]
    return recu ? json(200, recu) : json(404, { message: 'Reçu introuvable' })
  }

  if (!chemin.startsWith('/api/v1/')) return null
  const route = chemin.slice('/api/v1'.length)

  // Vérification CSRF simulée sur les requêtes mutantes.
  if (methode !== 'GET') {
    const enTetes = new Headers(init?.headers)
    if (enTetes.get('X-XSRF-TOKEN') !== 'jeton-mock') return json(419, { message: 'CSRF token mismatch.' })
  }

  if (route === '/config') return json(200, CONFIG)

  if (route === '/auth/connexion' && methode === 'POST') {
    const corps = await lireJson(init)
    const identifiant = String(corps.identifiant ?? '')
    if (identifiant === 'bloque@demo.test') return json(429, { message: 'Trop de tentatives.' })
    const compte = trouverCompte(identifiant)
    if (!compte || corps.password !== MOT_DE_PASSE) {
      return json(422, { message: 'Identifiants incorrects.', errors: { identifiant: ['Identifiants incorrects.'] } })
    }
    ecrireSession(compte)
    return json(200, { utilisateur: compte })
  }

  if (route === '/auth/inscription' && methode === 'POST') {
    const corps = await lireJson(init)
    const errors: Record<string, string[]> = {}
    if (!corps.nom) errors.nom = ['Le nom est obligatoire.']
    if (!corps.identifiant) errors.identifiant = ["L'identifiant est obligatoire."]
    if (typeof corps.password !== 'string' || corps.password.length < 12) errors.password = ['12 caractères minimum.']
    if (corps.password !== corps.password_confirmation) errors.password_confirmation = ['Les mots de passe ne correspondent pas.']
    if (trouverCompte(String(corps.identifiant ?? ''))) errors.identifiant = ['Cet identifiant est déjà utilisé.']
    if (Object.keys(errors).length) return json(422, { message: 'Les données sont invalides.', errors })
    const identifiant = String(corps.identifiant)
    const utilisateur: Utilisateur = {
      ulid: `01JNEW${Date.now().toString(36).toUpperCase().padStart(20, '0')}`,
      nom: String(corps.nom),
      email: identifiant.includes('@') ? identifiant : null,
      telephone: identifiant.includes('@') ? null : identifiant,
      role_plateforme: null,
      preferences: { ...PREFERENCES_DEFAUT, locale: corps.locale === 'en' ? 'en' : 'fr' },
      boutique: null,
    }
    ecrireSession(utilisateur)
    return json(201, { utilisateur })
  }

  if (route === '/auth/deconnexion' && methode === 'POST') {
    ecrireSession(null)
    return json(204)
  }

  if (route === '/auth/mot-de-passe/oubli' && methode === 'POST') return json(202)

  if (route === '/auth/mot-de-passe/reinitialisation' && methode === 'POST') {
    const corps = await lireJson(init)
    if (corps.jeton === 'invalide') return json(422, { message: 'Ce lien est invalide.', errors: { jeton: ['Ce lien est invalide.'] } })
    if (typeof corps.password !== 'string' || corps.password.length < 12) {
      return json(422, { message: 'Mot de passe trop court.', errors: { password: ['12 caractères minimum.'] } })
    }
    return json(200, { message: 'OK' })
  }

  const session = lireSession()

  if (route === '/moi' && methode === 'GET') {
    return session ? json(200, { utilisateur: session }) : json(401, { message: 'Non authentifié.' })
  }

  if (route === '/moi/preferences' && methode === 'PATCH') {
    if (!session) return json(401, { message: 'Non authentifié.' })
    const corps = await lireJson(init)
    const utilisateur: Utilisateur = { ...session, preferences: { ...session.preferences, ...(corps as Partial<Preferences>) } }
    ecrireSession(utilisateur)
    return json(200, { utilisateur })
  }

  if (!session) return json(401, { message: 'Non authentifié.' })
  return json(404, { message: 'Route inconnue (mock).' })
}

export function installerMock() {
  const original = window.fetch.bind(window)
  window.fetch = async (entree, init) => {
    const url = new URL(typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url, window.location.origin)
    if (url.origin !== window.location.origin) return original(entree, init)
    const reponse = await repondre(url, init)
    if (!reponse) return original(entree, init)
    await attendre(120 + Math.random() * 180)
    return reponse
  }
  console.warn('[SatsPoint] Mode mock : API simulée. Comptes : proprio@demo.test, gerant@demo.test, caissier@demo.test, super@demo.test, nouveau@demo.test — mot de passe demo12345678.')
}
