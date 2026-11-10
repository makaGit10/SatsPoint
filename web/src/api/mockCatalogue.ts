/**
 * Mode mock — catalogue pays / langues / moyens de paiement par pays (CONTRAT_API § 14). Jamais inclus en production.
 *
 * Mêmes graines que le back (api/app/Support/CatalogueInitial.php) + quelques langues de démonstration
 * (bambara au Mali, dioula en Côte d'Ivoire et au Burkina Faso, mooré au Burkina Faso, éwé au Togo — désactivé).
 * Levier `sessionStorage['satspoint.mock.pays']` = `CI` (ou tout code) : la boutique démo est dans ce pays,
 * avec Wave (lien) et Orange Money (numéro) déjà activés et une vente « moyen du pays » en attente.
 */
import { emettreSignal } from '@/temps-reel/signaux'
import type { CodePays, CouleurMoyen, EntreeJournal, LangueAdmin, LanguePublique, MoyenBoutique, MoyenCatalogue, MoyenPaiementPhoto, PaysAdmin, TypeMoyen, Utilisateur } from './types'

const MOTIF_CODE = /^[a-z]{2,8}(-[a-z]{2,3})?$/
const MOTIF_NOM_LANGUE = /^[\p{L}\p{N}][\p{L}\p{N} '’.-]{1,39}$/u
const MOTIF_NOM_MOYEN = /^[\p{L}\p{N}][\p{L}\p{N} '’.&+/-]{1,39}$/u
const COULEURS: CouleurMoyen[] = ['bleu', 'ciel', 'orange', 'jaune', 'vert', 'rouge', 'violet', 'gris']

const pays: PaysAdmin[] = [
  ['SN', 'Sénégal', 'Senegal', '+221'],
  ['BJ', 'Bénin', 'Benin', '+229'],
  ['BF', 'Burkina Faso', 'Burkina Faso', '+226'],
  ['CI', "Côte d'Ivoire", "Côte d'Ivoire", '+225'],
  ['GW', 'Guinée-Bissau', 'Guinea-Bissau', '+245'],
  ['ML', 'Mali', 'Mali', '+223'],
  ['NE', 'Niger', 'Niger', '+227'],
  ['TG', 'Togo', 'Togo', '+228'],
].map(([code, nom_fr, nom_en, indicatif], i) => ({
  code: code as CodePays,
  nom_fr: nom_fr!,
  nom_en: nom_en!,
  indicatif: indicatif!,
  devise: 'XOF' as const,
  actif: true,
  ordre: i + 1,
  boutiques: code === 'SN' ? 24 : code === 'CI' ? 3 : code === 'ML' ? 1 : 0,
}))

const langues: LangueAdmin[] = [
  { code: 'wo', nom_local: 'Wolof', nom_fr: 'Wolof', nom_en: 'Wolof', pays: ['SN'], ordre: 1, actif: true, audios_publies: 18 },
  { code: 'srr', nom_local: 'Seereer', nom_fr: 'Sérère', nom_en: 'Serer', pays: ['SN'], ordre: 2, actif: true, audios_publies: 9 },
  { code: 'ff', nom_local: 'Pulaar', nom_fr: 'Pulaar', nom_en: 'Pulaar', pays: ['SN'], ordre: 3, actif: true, audios_publies: 5 },
  { code: 'dyo', nom_local: 'Joola', nom_fr: 'Diola', nom_en: 'Jola', pays: ['SN'], ordre: 4, actif: true, audios_publies: 2 },
  { code: 'bm', nom_local: 'Bamanankan', nom_fr: 'Bambara', nom_en: 'Bambara', pays: ['ML'], ordre: 5, actif: true, audios_publies: 0 },
  { code: 'dyu', nom_local: 'Jula', nom_fr: 'Dioula', nom_en: 'Dyula', pays: ['CI', 'BF'], ordre: 6, actif: true, audios_publies: 0 },
  { code: 'mos', nom_local: 'Mòoré', nom_fr: 'Mooré', nom_en: 'Mossi', pays: ['BF'], ordre: 7, actif: true, audios_publies: 0 },
  { code: 'ee', nom_local: 'Eʋegbe', nom_fr: 'Éwé', nom_en: 'Ewe', pays: ['TG'], ordre: 8, actif: false, audios_publies: 0 },
  { code: 'fr', nom_local: 'Français', nom_fr: 'Français', nom_en: 'French', pays: [], ordre: 100, actif: true, audios_publies: 30 },
]

let sequence = 0
const ulidMoyen = () => `01MOYEN${String(++sequence).padStart(19, '0')}`

function couleurDe(nom: string): CouleurMoyen {
  return ({ Wave: 'ciel', 'Orange Money': 'orange', 'MTN MoMo': 'jaune', 'Mixx by Yas': 'jaune', 'Moov Money': 'bleu', 'Airtel Money': 'rouge', Flooz: 'vert' } as Record<string, CouleurMoyen>)[nom] ?? 'gris'
}

const GRAINES: Array<[CodePays, string[]]> = [
  ['CI', ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money']],
  ['ML', ['Orange Money', 'Moov Money', 'Wave']],
  ['BF', ['Orange Money', 'Moov Money']],
  ['NE', ['Airtel Money', 'Moov Money']],
  ['TG', ['Mixx by Yas', 'Flooz']],
  ['BJ', ['MTN MoMo', 'Moov Money']],
  ['GW', ['Orange Money', 'MTN MoMo']],
]
const moyens: MoyenCatalogue[] = GRAINES.flatMap(([code, noms]) =>
  noms.map((nom, i) => {
    const type: TypeMoyen = nom === 'Wave' ? 'lien' : 'numero'
    return {
      ulid: ulidMoyen(),
      pays: code,
      nom,
      type,
      couleur: couleurDe(nom),
      instructions_fr: type === 'lien' ? `Scannez le QR avec l'application ${nom}, puis montrez la confirmation.` : `Payez avec ${nom} au numéro affiché, puis montrez le message de confirmation.`,
      instructions_en: type === 'lien' ? `Scan the QR code with the ${nom} app, then show the confirmation.` : `Pay with ${nom} to the number shown, then show the confirmation message.`,
      actif: true,
      ordre: i + 1,
      boutiques_actives: code === 'CI' && i < 2 ? 2 : 0,
    }
  }),
)

/** Configuration des moyens du pays pour la boutique démo (une seule boutique dans le mock). */
const configBoutique = new Map<string, { active: boolean; valeur: string | null }>()

/** Pays de départ de la boutique démo (levier `satspoint.mock.pays`). */
export function paysInitialBoutique(): CodePays {
  const v = sessionStorage.getItem('satspoint.mock.pays')
  const code = pays.find((p) => p.code === v)?.code ?? 'SN'
  if (code !== 'SN') {
    for (const m of moyens.filter((x) => x.pays === code)) {
      if (m.nom === 'Wave') configBoutique.set(m.ulid, { active: true, valeur: 'https://pay.wave.com/m/M_ci_demo_boutique/c/ci/' })
      if (m.nom === 'Orange Money') configBoutique.set(m.ulid, { active: true, valeur: '+2250708091011' })
    }
  }
  return code
}

function signal(rubrique: string, canal: string, auteur: string | null) {
  setTimeout(() => emettreSignal({ rubrique, auteur, horodatage: new Date().toISOString(), canal }), 150)
}

function json(statut: number, corps: unknown = null): Response {
  if (statut === 204 || corps === null) return new Response(null, { status: statut })
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })
}

const invalide = (champ: string, message: string) => json(422, { message, errors: { [champ]: [message] } })

async function lireJson(init?: RequestInit): Promise<Record<string, unknown>> {
  if (!init?.body || typeof init.body !== 'string') return {}
  try {
    return JSON.parse(init.body) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Lecture (GET /config, studio, boutique)
// ---------------------------------------------------------------------------

const triees = () => [...langues].sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code))

export function catalogueConfig(): { pays: Array<Pick<PaysAdmin, 'code' | 'nom_fr' | 'nom_en' | 'indicatif'>>; langues: LanguePublique[]; langues_audio: Array<{ code: string; nom: string; nom_local: string }> } {
  const actives = triees().filter((l) => l.actif)
  return {
    pays: pays.filter((p) => p.actif).map(({ code, nom_fr, nom_en, indicatif }) => ({ code, nom_fr, nom_en, indicatif })),
    langues: actives.map(({ code, nom_local, nom_fr, nom_en, pays: p, ordre }) => ({ code, nom_local, nom_fr, nom_en, pays: [...p], ordre })),
    langues_audio: actives.map((l) => ({ code: l.code, nom: l.nom_fr, nom_local: l.nom_local })),
  }
}

/** Langues actives pour la matrice du studio (§ 14.5). */
export function languesStudio(): Array<{ code: string; nom: string; nom_local: string; pays: CodePays[] }> {
  return triees()
    .filter((l) => l.actif)
    .map((l) => ({ code: l.code, nom: l.nom_fr, nom_local: l.nom_local, pays: [...l.pays] }))
}

/** Toutes les langues existantes (manifeste : une langue désactivée garde ses audios). */
export function langueExiste(code: string): boolean {
  return langues.some((l) => l.code === code)
}

export function langueActive(code: string): boolean {
  return langues.some((l) => l.code === code && l.actif)
}

/** Langues ajoutées hors registre du front : leur clé vocale `langue.{code}` est créée côté serveur. */
export function clesVocalesLangues(): Array<{ cle: string; ecran: string; contexte: string; texte_fr: string; texte_en: string; essentielle: boolean }> {
  const duRegistre = ['wo', 'srr', 'ff', 'dyo', 'fr', 'en']
  return langues
    .filter((l) => !duRegistre.includes(l.code))
    .map((l) => ({ cle: `langue.${l.code}`, ecran: 'langue', contexte: `Tuile de langue : dit « ${l.nom_local} » en ${l.nom_fr}`, texte_fr: l.nom_fr, texte_en: l.nom_en, essentielle: true }))
}

export function publierAudioLangue(code: string, nombre: number) {
  const l = langues.find((x) => x.code === code)
  if (l) l.audios_publies += nombre
}

function pourBoutique(m: MoyenCatalogue): MoyenBoutique {
  const c = configBoutique.get(m.ulid)
  return { ulid: m.ulid, nom: m.nom, type: m.type, couleur: m.couleur, instructions_fr: m.instructions_fr, instructions_en: m.instructions_en, active: Boolean(c?.active), valeur: c?.valeur ?? null }
}

/** Moyens actifs au catalogue pour un pays, avec la configuration de la boutique. */
export function moyensDuPays(code: CodePays): MoyenBoutique[] {
  return moyens
    .filter((m) => m.pays === code && m.actif)
    .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom))
    .map(pourBoutique)
}

/** `boutique.moyens_pays` : activés, avec valeur, actifs au catalogue et du pays de la boutique. */
export function moyensActifsBoutique(code: CodePays): MoyenBoutique[] {
  return moyensDuPays(code).filter((m) => m.active && m.valeur)
}

/** Photographie du moyen pour une tentative `moyen_pays` (null = MOYEN_INACTIF). */
export function photoMoyen(ulid: unknown, code: CodePays): MoyenPaiementPhoto | null {
  const m = moyensActifsBoutique(code).find((x) => x.ulid === ulid)
  if (!m || !m.valeur) return null
  return { ulid: m.ulid, nom: m.nom, type: m.type, couleur: m.couleur, valeur: m.valeur, instructions_fr: m.instructions_fr, instructions_en: m.instructions_en }
}

/** Changement de pays de la boutique : les moyens de l'ancien pays sont désactivés. */
export function changerPaysBoutique(ancien: CodePays) {
  for (const m of moyens.filter((x) => x.pays === ancien)) {
    const c = configBoutique.get(m.ulid)
    if (c) c.active = false
  }
}

export function paysActif(code: unknown): code is CodePays {
  return pays.some((p) => p.code === code && p.actif)
}

// ---------------------------------------------------------------------------
// Réglages de la boutique : GET / PUT /boutique/moyens-pays (propriétaire / gérant)
// ---------------------------------------------------------------------------

function normaliserNumero(brut: string): string | null {
  const v = brut.replace(/[\s.-]/g, '')
  if (/^\+[1-9]\d{7,14}$/.test(v) || /^\d{3,12}$/.test(v)) return v
  return null
}

export async function repondreMoyensBoutique(route: string, methode: string, init: RequestInit | undefined, session: Utilisateur, paysBoutique: CodePays): Promise<Response | null> {
  if (!route.startsWith('/boutique/moyens-pays')) return null
  const role = session.boutique?.role
  if (role !== 'proprietaire' && role !== 'gerant') return json(403, { message: 'Action non autorisée.', code: 'INTERDIT' })

  if (route === '/boutique/moyens-pays' && methode === 'GET') return json(200, { pays: paysBoutique, moyens: moyensDuPays(paysBoutique) })

  const m = /^\/boutique\/moyens-pays\/([0-9A-Z]{26})$/.exec(route)
  if (m && methode === 'PUT') {
    // Inconnu, inactif au catalogue ou d'un autre pays : même 404 (anti-IDOR).
    const moyen = moyens.find((x) => x.ulid === m[1] && x.pays === paysBoutique && x.actif)
    if (!moyen) return json(404, { message: 'Ressource introuvable.', code: 'INTROUVABLE' })
    const corps = await lireJson(init)
    if (typeof corps.active !== 'boolean') return invalide('active', 'Le champ active est obligatoire.')
    const actuel = configBoutique.get(moyen.ulid) ?? { active: false, valeur: null }
    let valeur = actuel.valeur
    if ('valeur' in corps) {
      const brut = typeof corps.valeur === 'string' ? corps.valeur.trim() : ''
      if (!brut) valeur = null
      else if (moyen.type === 'lien') {
        if (!/^https:\/\/[^\s<>]{4,290}$/.test(brut)) return invalide('valeur', 'Le lien doit commencer par https:// (300 caractères au plus).')
        valeur = brut
      } else {
        const n = normaliserNumero(brut)
        if (!n) return invalide('valeur', 'Numéro international (+ et 8 à 15 chiffres) ou code marchand de 3 à 12 chiffres.')
        valeur = n
      }
    }
    if (corps.active && !valeur) return invalide('valeur', 'Indiquez votre numéro ou votre lien marchand avant d’activer ce moyen.')
    configBoutique.set(moyen.ulid, { active: corps.active, valeur })
    signal('parametres', `boutique.${session.boutique?.ulid ?? ''}`, session.ulid)
    return json(200, { moyen: pourBoutique(moyen) })
  }
  return json(404, { message: 'Route inconnue (mock).' })
}

// ---------------------------------------------------------------------------
// Console : /admin/pays, /admin/langues, /admin/moyens-paiement (super-admin + 2FA, vérifiés par l'appelant)
// ---------------------------------------------------------------------------

type Journaliser = (action: string, details: EntreeJournal['details']) => void

function nomValide(v: unknown, motif: RegExp): v is string {
  return typeof v === 'string' && motif.test(v.trim())
}

export async function repondreCatalogueAdmin(route: string, methode: string, url: URL, init: RequestInit | undefined, session: Utilisateur, journaliser: Journaliser): Promise<Response | null> {
  const ecrit = () => signal('catalogues', 'plateforme', session.ulid)

  // ----- Pays -----
  if (route === '/admin/pays' && methode === 'GET') return json(200, { pays })
  let m = /^\/admin\/pays\/([A-Z]{2})$/.exec(route)
  if (m && methode === 'PATCH') {
    const p = pays.find((x) => x.code === m![1])
    if (!p) return json(404, { message: 'Ressource introuvable.' })
    const corps = await lireJson(init)
    if ('actif' in corps && typeof corps.actif !== 'boolean') return invalide('actif', 'Valeur invalide.')
    if (corps.actif === false && p.code === 'SN') return json(409, { message: 'Le Sénégal reste ouvert.', code: 'PAYS_PROTEGE' })
    for (const champ of ['nom_fr', 'nom_en'] as const) {
      if (champ in corps) {
        if (!nomValide(corps[champ], MOTIF_NOM_LANGUE)) return invalide(champ, 'Nom invalide (2 à 40 caractères).')
        p[champ] = String(corps[champ]).trim()
      }
    }
    if (typeof corps.actif === 'boolean') p.actif = corps.actif
    journaliser('plateforme.pays_modifie', { pays: p.code, actif: p.actif })
    ecrit()
    return json(200, { pays: p })
  }

  // ----- Langues -----
  if (route === '/admin/langues' && methode === 'GET') return json(200, { langues: triees() })
  if (route === '/admin/langues' && methode === 'POST') {
    const corps = await lireJson(init)
    const code = typeof corps.code === 'string' ? corps.code.trim() : ''
    if (!MOTIF_CODE.test(code) || code.length > 12) return invalide('code', 'Code invalide : 2 à 8 lettres minuscules, éventuellement « - » et une variante.')
    if (langues.some((l) => l.code === code)) return invalide('code', 'Ce code est déjà utilisé.')
    for (const champ of ['nom_local', 'nom_fr', 'nom_en'] as const) if (!nomValide(corps[champ], MOTIF_NOM_LANGUE)) return invalide(champ, 'Nom invalide (2 à 40 caractères).')
    const listePays = Array.isArray(corps.pays) ? (corps.pays as unknown[]) : []
    if (listePays.some((c) => !pays.some((p) => p.code === c)) || new Set(listePays).size !== listePays.length) return invalide('pays', 'Pays inconnu.')
    const langue: LangueAdmin = {
      code,
      nom_local: String(corps.nom_local).trim(),
      nom_fr: String(corps.nom_fr).trim(),
      nom_en: String(corps.nom_en).trim(),
      pays: listePays as CodePays[],
      actif: corps.actif !== false,
      ordre: typeof corps.ordre === 'number' ? corps.ordre : Math.max(0, ...langues.filter((l) => l.code !== 'fr').map((l) => l.ordre)) + 1,
      audios_publies: 0,
    }
    langues.push(langue)
    journaliser('plateforme.langue_creee', { code, nom: langue.nom_fr, pays: langue.pays })
    ecrit()
    signal('audio', 'admin', session.ulid)
    return json(201, { langue })
  }
  m = /^\/admin\/langues\/([a-z-]{2,12})$/.exec(route)
  if (m) {
    const langue = langues.find((l) => l.code === m![1])
    if (!langue) return json(404, { message: 'Ressource introuvable.' })
    if (methode === 'PATCH') {
      const corps = await lireJson(init)
      if (corps.actif === false && langue.code === 'fr') return json(409, { message: 'Le français reste actif.', code: 'LANGUE_PROTEGEE' })
      for (const champ of ['nom_local', 'nom_fr', 'nom_en'] as const) {
        if (champ in corps) {
          if (!nomValide(corps[champ], MOTIF_NOM_LANGUE)) return invalide(champ, 'Nom invalide (2 à 40 caractères).')
          langue[champ] = String(corps[champ]).trim()
        }
      }
      if ('pays' in corps) {
        const listePays = Array.isArray(corps.pays) ? (corps.pays as unknown[]) : null
        if (!listePays || listePays.some((c) => !pays.some((p) => p.code === c))) return invalide('pays', 'Pays inconnu.')
        langue.pays = listePays as CodePays[]
      }
      if (typeof corps.actif === 'boolean') langue.actif = corps.actif
      journaliser('plateforme.langue_modifiee', { code: langue.code, champs: Object.keys(corps) })
      ecrit()
      return json(200, { langue })
    }
    if (methode === 'DELETE') {
      if (langue.code === 'fr') return json(409, { message: 'Le français reste actif.', code: 'LANGUE_PROTEGEE' })
      if (langue.audios_publies > 0) return json(409, { message: 'Cette langue a des audios.', code: 'LANGUE_UTILISEE' })
      langues.splice(langues.indexOf(langue), 1)
      journaliser('plateforme.langue_supprimee', { code: langue.code })
      ecrit()
      return json(204)
    }
  }

  // ----- Moyens de paiement -----
  if (route === '/admin/moyens-paiement' && methode === 'GET') {
    const filtre = url.searchParams.get('pays')
    if (filtre && !pays.some((p) => p.code === filtre)) return invalide('pays', 'Pays inconnu.')
    const liste = moyens.filter((x) => !filtre || x.pays === filtre).sort((a, b) => a.pays.localeCompare(b.pays) || a.ordre - b.ordre || a.nom.localeCompare(b.nom))
    return json(200, { moyens: liste.map((x) => ({ ...x, boutiques_actives: (x.boutiques_actives ?? 0) + (configBoutique.get(x.ulid)?.active ? 1 : 0) })) })
  }
  const validerMoyen = (corps: Record<string, unknown>, creation: boolean, paysMoyen: CodePays, ulidCourant: string | null): Response | null => {
    if ((creation || 'nom' in corps) && !nomValide(corps.nom, MOTIF_NOM_MOYEN)) return invalide('nom', 'Nom invalide (2 à 40 caractères).')
    if ('nom' in corps && moyens.some((x) => x.pays === paysMoyen && x.ulid !== ulidCourant && x.nom.toLowerCase() === String(corps.nom).trim().toLowerCase())) return invalide('nom', 'Ce nom existe déjà pour ce pays.')
    if ((creation || 'couleur' in corps) && !COULEURS.includes(corps.couleur as CouleurMoyen)) return invalide('couleur', 'Couleur inconnue.')
    for (const champ of ['instructions_fr', 'instructions_en'] as const) {
      const v = corps[champ]
      if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > 160 || /[<>\r\n]/.test(v))) return invalide(champ, 'Texte brut de 160 caractères au plus.')
    }
    return null
  }
  if (route === '/admin/moyens-paiement' && methode === 'POST') {
    const corps = await lireJson(init)
    const code = corps.pays
    if (!pays.some((p) => p.code === code)) return invalide('pays', 'Pays inconnu.')
    if (corps.type !== 'lien' && corps.type !== 'numero') return invalide('type', 'Type inconnu.')
    const refus = validerMoyen(corps, true, code as CodePays, null)
    if (refus) return refus
    const moyen: MoyenCatalogue = {
      ulid: ulidMoyen(),
      pays: code as CodePays,
      nom: String(corps.nom).trim(),
      type: corps.type,
      couleur: corps.couleur as CouleurMoyen,
      instructions_fr: (corps.instructions_fr as string | null | undefined) || null,
      instructions_en: (corps.instructions_en as string | null | undefined) || null,
      actif: corps.actif !== false,
      ordre: Math.max(0, ...moyens.filter((x) => x.pays === code).map((x) => x.ordre)) + 1,
      boutiques_actives: 0,
    }
    moyens.push(moyen)
    journaliser('plateforme.moyen_cree', { pays: moyen.pays, nom: moyen.nom, type: moyen.type })
    ecrit()
    return json(201, { moyen })
  }
  m = /^\/admin\/moyens-paiement\/([0-9A-Z]{26})$/.exec(route)
  if (m) {
    const moyen = moyens.find((x) => x.ulid === m![1])
    if (!moyen) return json(404, { message: 'Ressource introuvable.' })
    if (methode === 'PATCH') {
      const corps = await lireJson(init)
      const refus = validerMoyen(corps, false, moyen.pays, moyen.ulid)
      if (refus) return refus
      if ('nom' in corps) moyen.nom = String(corps.nom).trim()
      if ('couleur' in corps) moyen.couleur = corps.couleur as CouleurMoyen
      if ('instructions_fr' in corps) moyen.instructions_fr = (corps.instructions_fr as string | null) || null
      if ('instructions_en' in corps) moyen.instructions_en = (corps.instructions_en as string | null) || null
      if (typeof corps.actif === 'boolean') moyen.actif = corps.actif
      journaliser('plateforme.moyen_modifie', { pays: moyen.pays, nom: moyen.nom, champs: Object.keys(corps) })
      ecrit()
      return json(200, { moyen })
    }
    if (methode === 'DELETE') {
      if ((moyen.boutiques_actives ?? 0) > 0 || configBoutique.has(moyen.ulid)) return json(409, { message: 'Ce moyen a déjà servi.', code: 'MOYEN_UTILISE' })
      moyens.splice(moyens.indexOf(moyen), 1)
      journaliser('plateforme.moyen_supprime', { pays: moyen.pays, nom: moyen.nom })
      ecrit()
      return json(204)
    }
  }
  return null
}
