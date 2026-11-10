/**
 * Mode mock — routes de la vague 3 (CONTRAT_API § V3), branchées par `mock.ts`. Jamais inclus en production.
 *
 * - Studio audio : matrice d'environ 90 clés (tirées du vrai registre `voix/cles-vocales.json`) × les langues actives du catalogue
 *   (mockCatalogue : graines + langues de démonstration), couverture partielle ;
 *   dépôt → `en_traitement` → `brouillon` après 1,5 s + signal `audio` (canal `admin`) ; publication → manifeste mis à jour
 *   + signal `audios` (canal `plateforme`). Les enregistrements déposés sont réellement réécoutables (URL `blob:`).
 * - 2FA : code `123456` (ou un code de secours affiché à l'activation). Le super-admin a la 2FA active, non validée.
 *   Levier `sessionStorage['satspoint.mock.2fa']` = `inactive` | `active` | `validee`.
 * - Console : statistiques, boutiques (suspendre / réactiver), santé, journal (pagination par numéro de page).
 * - Recherche (ventes, articles, équipe, pages), dernières recherches ; import d'articles avec suggestions ; invitation `demo`.
 */
import { suggererCorrespondance } from '@/ecrans/articles/correspondance'
import { pertinence } from '@/lib/texte'
import { emettreSignal } from '@/temps-reel/signaux'
import { clesVocalesLangues, langueActive, languesStudio, publierAudioLangue, repondreCatalogueAdmin } from './mockCatalogue'
import { lirePagination, paginer } from './mockPagination'
import registre from '@/voix/cles-vocales.json'
import type {
  Article,
  BoutiqueAdmin,
  ChampImport,
  CleAudio,
  Correspondance,
  EntreeJournal,
  EtatCleAudio,
  EtatDeuxFa,
  GroupeRecherche,
  ImportEtat,
  LangueAudio,
  MatriceAudio,
  ModeImport,
  RoleBoutique,
  StatutAudio,
  Utilisateur,
  Vente,
} from './types'

export interface ContexteMock {
  url: URL
  route: string
  methode: string
  init: RequestInit | undefined
  session: Utilisateur | null
  ventes: () => Vente[]
  articles: () => Article[]
  ajouterArticle: (a: Omit<Article, 'ulid' | 'position'>) => Article
  membres: () => Array<{ ulid: string; nom: string; contact: string; role: RoleBoutique }>
  ecrireSession: (u: Utilisateur | null) => void
  boutiqueDemo: { ulid: string; nom: string; ville: string }
  motDePasse: string
  bip: (langue: LangueAudio) => string
}

const MINUTE = 60_000
const JOUR = 24 * 60 * MINUTE
const ISO = (d: number) => new Date(d).toISOString()

function json(statut: number, corps: unknown = null): Response {
  if (statut === 204 || corps === null) return new Response(null, { status: statut })
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })
}

async function lireJson(init?: RequestInit): Promise<Record<string, unknown>> {
  if (!init?.body || typeof init.body !== 'string') return {}
  try {
    return JSON.parse(init.body) as Record<string, unknown>
  } catch {
    return {}
  }
}

function signal(rubrique: string, canal: string, auteur: string | null = null, delai = 200) {
  setTimeout(() => emettreSignal({ rubrique, auteur, horodatage: new Date().toISOString(), canal }), delai)
}

// ---------------------------------------------------------------------------
// Double authentification
// ---------------------------------------------------------------------------

const CLE_2FA = 'satspoint.mock.2fa'
const CODE_TOTP = '123456'
let codesSecours: string[] = ['k7m2-9qpx', 'h3vd-8wrt', 'p4ns-2ycz', 'f6jb-5tkm', 'w8qa-3edn', 'r2xc-7gvh', 'z5lt-4mus', 'b9pe-6kfw']

function lire2fa(u: Utilisateur): 'inactive' | 'active' | 'validee' {
  const v = sessionStorage.getItem(`${CLE_2FA}.${u.ulid}`) ?? sessionStorage.getItem(CLE_2FA)
  if (v === 'inactive' || v === 'active' || v === 'validee') return v
  return u.role_plateforme === 'super_admin' ? 'active' : 'inactive'
}

function ecrire2fa(u: Utilisateur, v: 'inactive' | 'active' | 'validee') {
  sessionStorage.setItem(`${CLE_2FA}.${u.ulid}`, v)
}

/** État `deux_fa` ajouté à `GET /moi` (et aux réponses de connexion). */
export function etatDeuxFa(u: Utilisateur): EtatDeuxFa {
  const etat = lire2fa(u)
  return { active: etat !== 'inactive', requise: u.role_plateforme === 'super_admin', validee: etat === 'validee' }
}

/** À la connexion, la session repart non validée. */
export function reinitialiserDeuxFa(u: Utilisateur) {
  if (lire2fa(u) === 'validee' && !sessionStorage.getItem(CLE_2FA)) ecrire2fa(u, 'active')
}

// ---------------------------------------------------------------------------
// Studio audio
// ---------------------------------------------------------------------------

interface CelluleStudio extends EtatCleAudio {
  publieUrl?: string | null
}

const entrees = registre as Array<{ cle: string; ecran: string; contexte: string; texte_fr: string; texte_en: string; essentielle: boolean }>
/** ~90 clés (deux pages de matrice) : les essentielles d'abord, puis un échantillon des autres écrans. */
const CLES_STUDIO = (() => {
  const essentielles = entrees.filter((e) => e.essentielle).slice(0, 50)
  const autres = entrees.filter((e) => !e.essentielle)
  const pas = Math.max(1, Math.floor(autres.length / 40))
  return [...essentielles, ...autres.filter((_, i) => i % pas === 0).slice(0, 40)]
})()

const PUBLIES: Record<string, number> = { fr: 30, wo: 18, srr: 9, ff: 5, dyo: 2 }

/** Clés du studio : celles du registre + `langue.{code}` des langues ajoutées au catalogue (créées par le serveur). */
function clesStudio() {
  const essentielles = CLES_STUDIO.filter((e) => e.essentielle)
  const ajoutees = clesVocalesLangues().filter((c) => !CLES_STUDIO.some((e) => e.cle === c.cle))
  return [...essentielles, ...ajoutees, ...CLES_STUDIO.filter((e) => !e.essentielle)]
}
let sequenceAudio = 1000
const studio = new Map<string, CelluleStudio>()

function cleCellule(cle: string, langue: LangueAudio) {
  return `${langue}|${cle}`
}

function initialiserStudio(bip: (l: LangueAudio) => string) {
  if (studio.size) return
  const debut = Date.now() - 6 * JOUR
  CLES_STUDIO.forEach((e, i) => {
    for (const { code } of languesStudio()) {
      const publies = PUBLIES[code] ?? 0
      let statut: StatutAudio = 'manquant'
      if (i < publies) statut = 'publie'
      else if (code === 'wo' && i < publies + 3) statut = 'brouillon'
      else if (code === 'fr' && i < publies + 2) statut = 'brouillon'
      else if (code === 'srr' && i === publies) statut = 'brouillon'
      else if (code === 'ff' && i === publies) statut = 'erreur'
      const cellule: CelluleStudio = { statut }
      if (code === 'wo' && i === 1) {
        studio.set(cleCellule(e.cle, code), { statut: 'brouillon', id: ++sequenceAudio, url: bip(code), publieUrl: bip(code), duree_ms: 1300, mis_a_jour_le: ISO(debut) })
        continue
      }
      if (statut !== 'manquant') {
        cellule.id = ++sequenceAudio
        cellule.url = statut === 'erreur' ? null : bip(code)
        cellule.duree_ms = 900 + ((i * 137) % 1400)
        cellule.mis_a_jour_le = ISO(debut + i * 3 * 60 * MINUTE)
        if (statut === 'erreur') cellule.erreur = 'Fichier illisible : réenregistrez.'
        if (statut === 'publie') cellule.publieUrl = cellule.url
      }
      studio.set(cleCellule(e.cle, code), cellule)
    }
  })
}

/** Clés publiées par le studio pour une langue (fusionnées dans le manifeste du mock). */
export function audiosPublies(langue: LangueAudio): Record<string, string> {
  const resultat: Record<string, string> = {}
  for (const [cle, cellule] of studio) {
    const [l, c] = cle.split('|') as [LangueAudio, string]
    if (l === langue && cellule.publieUrl) resultat[c] = cellule.publieUrl
  }
  return resultat
}

function matrice(): MatriceAudio {
  const langues = languesStudio()
  const cles: CleAudio[] = clesStudio().map((e, ordre) => ({
    ...e,
    ordre,
    etats: Object.fromEntries(
      langues.map(({ code }) => {
        const c = studio.get(cleCellule(e.cle, code)) ?? { statut: 'manquant' as const }
        const { publieUrl, ...visible } = c
        // Comme le back (V3.9) : version publiée + nouvelle version en préparation.
        if (publieUrl && c.statut !== 'publie') {
          return [code, { statut: 'publie', url: publieUrl, nouvelle_version: { statut: c.statut, id: c.id!, url: c.url ?? null, duree_ms: c.duree_ms ?? null, mis_a_jour_le: c.mis_a_jour_le ?? null } }]
        }
        return [code, visible]
      }),
    ),
  }))
  const couverture: MatriceAudio['couverture'] = {}
  for (const { code } of langues) {
    const etats = cles.map((c) => ({ statut: c.etats[code]?.nouvelle_version?.statut ?? c.etats[code]?.statut ?? 'manquant', essentielle: c.essentielle }))
    couverture[code] = {
      publies: etats.filter((e) => e.statut === 'publie').length,
      brouillons: etats.filter((e) => e.statut === 'brouillon').length,
      manquants: etats.filter((e) => e.statut !== 'publie' && e.statut !== 'brouillon').length,
      total: etats.length,
      essentielles_manquantes: etats.filter((e) => e.essentielle && e.statut !== 'publie').length,
    }
  }
  return { langues, ecrans: [...new Set(cles.map((e) => e.ecran))], couverture, cles }
}

function trouverParId(id: number): [string, CelluleStudio] | null {
  for (const entree of studio) if (entree[1].id === id) return entree
  return null
}

// ---------------------------------------------------------------------------
// Console plateforme
// ---------------------------------------------------------------------------

const NOMS_BOUTIQUES = [
  ['Boutique Démo', 'Dakar'], ['Quincaillerie Touba', 'Touba'], ['Chez Fatou Couture', 'Thiès'], ['Pharmacie du Port', 'Ziguinchor'],
  ['Marché Sandaga — Stand 12', 'Dakar'], ['Boulangerie Keur Massar', 'Keur Massar'], ['Télécentre Médina', 'Dakar'], ['Bazin Royal', 'Kaolack'],
  ['Épicerie Saint-Louis', 'Saint-Louis'], ['Garage Mbour Auto', 'Mbour'], ['Salon Awa Beauté', 'Rufisque'], ['Librairie Diola', 'Bignona'],
  ['Restaurant Le Teranga', 'Dakar'], ['Cyber Pikine', 'Pikine'], ['Atelier Bois Sédhiou', 'Sédhiou'], ['Vente de poisson Joal', 'Joal'],
  ['Mercerie Tambacounda', 'Tambacounda'], ['Cosmétiques Louga', 'Louga'], ['Kiosque Ngor', 'Dakar'], ['Tissus Diourbel', 'Diourbel'],
  ['Primeur Fatick', 'Fatick'], ['Électro Kolda', 'Kolda'], ['Café Touba Almadies', 'Dakar'], ['Glacier Saly', 'Saly'],
] as const
const PROPRIETAIRES = ['Awa Ndiaye', 'Mamadou Diallo', 'Fatou Sarr', 'Ousmane Badji', 'Aïssatou Ba', 'Cheikh Fall', 'Khady Diop', 'Ibrahima Sy']

const boutiques: BoutiqueAdmin[] = NOMS_BOUTIQUES.map(([nom, ville], i) => ({
  ulid: i === 0 ? '01JBOUTIQUEDEMO000000000001' : `01JBOUT${String(i).padStart(4, '0')}ADMIN000000000`.slice(0, 26),
  nom,
  ville,
  statut: i === 9 || i === 17 ? 'suspendue' : 'active',
  cree_le: ISO(Date.now() - (60 - i * 2) * JOUR),
  proprietaire: { nom: PROPRIETAIRES[i % PROPRIETAIRES.length]!, contact: i % 3 === 0 ? `+221 77 ••• •• ${String(10 + i).slice(-2)}` : `${PROPRIETAIRES[i % PROPRIETAIRES.length]!.split(' ')[0]!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@•••.sn` },
  configuration: { wallet: i % 5 !== 3, paytech: i % 3 !== 1, paiement_test: i % 4 !== 2 },
  activite: { ventes_7j: i === 9 ? 0 : Math.max(0, Math.round(80 / (i + 1)) + ((i * 7) % 11)), derniere_vente_le: i === 9 ? null : ISO(Date.now() - (i * 3 + 1) * 60 * MINUTE) },
}))

const ACTIONS_JOURNAL = [
  'auth.connexion', 'auth.2fa_verifiee', 'audio.publie', 'boutique.creee', 'wallet.connecte', 'paytech.ipn_refusee',
  'equipe.invitation_creee', 'paiement.confirme_manuellement', 'auth.echec', 'plateforme.boutique_suspendue', 'wallet.envoi_reussi', 'paytech.configure',
]
const journal: EntreeJournal[] = Array.from({ length: 64 }, (_, i) => {
  const action = ACTIONS_JOURNAL[(i * 5) % ACTIONS_JOURNAL.length]!
  const b = boutiques[(i * 7) % boutiques.length]!
  const plateforme = action.startsWith('audio.') || action === 'plateforme.boutique_suspendue' || action === 'auth.2fa_verifiee'
  return {
    id: 5000 - i,
    action,
    utilisateur: action === 'paytech.ipn_refusee' ? null : plateforme ? { ulid: '01JUSERSUPER00000000000000001', nom: 'Marème Makalou' } : { ulid: `01JUSERJ${i}`, nom: b.proprietaire?.nom ?? '—' },
    boutique: plateforme && action !== 'plateforme.boutique_suspendue' ? null : { ulid: b.ulid, nom: b.nom },
    ip: action === 'paytech.ipn_refusee' ? '41.82.12.7' : `196.207.${(i * 13) % 255}.${(i * 29) % 255}`,
    details: action === 'audio.publie' ? { langue: 'wo', cles: 3 } : action === 'auth.echec' ? { motif: 'mot_de_passe' } : null,
    cree_le: ISO(Date.now() - i * 47 * MINUTE),
  }
})

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------

const recentes = new Map<string, string[]>()
const RECENTES_DEFAUT = ['bazin', 'V-000142', 'wave']

const PAGES_SERVEUR: Array<{ titre: string; sous_titre: string; url: string; roles: RoleBoutique[]; mots: string }> = [
  { titre: 'Portefeuille', sous_titre: 'Solde, recevoir, envoyer', url: '/portefeuille', roles: ['proprietaire', 'gerant'], mots: 'wallet lightning sats solde' },
  { titre: 'Réglages › PayTech', sous_titre: 'Mobile money (Wave, Orange Money)', url: '/reglages#paytech', roles: ['proprietaire', 'gerant'], mots: 'paytech mobile money wave orange' },
  { titre: 'Réglages › Thème', sous_titre: 'Clair, sombre, automatique', url: '/reglages#preferences', roles: ['proprietaire', 'gerant', 'caissier'], mots: 'theme sombre clair' },
  { titre: 'Aide › Encaisser un client', sous_titre: 'Aide', url: '/caisse', roles: ['proprietaire', 'gerant', 'caissier'], mots: 'aide encaisser paiement' },
]

function rechercherMock(q: string, ctx: ContexteMock): GroupeRecherche[] {
  const u = ctx.session!
  const role = u.boutique?.role ?? null
  const groupes: GroupeRecherche[] = []
  const garder = <T,>(liste: Array<T & { score: number }>) => liste.filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 5)

  if (role) {
    const chiffres = q.replace(/\D/g, '')
    const ventes = garder(
      ctx
        .ventes()
        .filter((v) => role !== 'caissier' || v.caissier.ulid === u.ulid)
        .map((v) => {
          const score = Math.max(pertinence(v.numero, q), v.note ? pertinence(v.note, q) * 0.9 : 0, chiffres.length >= 3 && String(v.montant_xof).startsWith(chiffres) ? 50 : 0, chiffres && v.numero.endsWith(chiffres.padStart(6, '0')) ? 95 : 0)
          return { titre: v.numero, sous_titre: `${v.montant_xof.toLocaleString('fr-FR')} FCFA${v.note ? ` · ${v.note}` : ''}`, url: `/ventes?vente=${v.ulid}`, score: Math.round(score) }
        }),
    )
    if (ventes.length) groupes.push({ rubrique: 'ventes', resultats: ventes })

    const articles = garder(
      ctx.articles().map((a) => ({
        titre: a.nom,
        sous_titre: [`${a.prix_xof.toLocaleString('fr-FR')} FCFA`, a.categorie].filter(Boolean).join(' · '),
        url: `/articles?article=${a.ulid}`,
        score: Math.max(pertinence(a.nom, q), a.categorie ? pertinence(a.categorie, q) * 0.7 : 0, a.sku ? pertinence(a.sku, q) : 0),
      })),
    )
    if (articles.length) groupes.push({ rubrique: 'articles', resultats: articles })

    if (role !== 'caissier') {
      const equipe = garder(ctx.membres().map((m) => ({ titre: m.nom, sous_titre: m.contact, url: '/equipe', score: Math.max(pertinence(m.nom, q), pertinence(m.contact, q) * 0.8) })))
      if (equipe.length) groupes.push({ rubrique: 'equipe', resultats: equipe })
    }
    const pages = garder(PAGES_SERVEUR.filter((p) => p.roles.includes(role)).map((p) => ({ titre: p.titre, sous_titre: p.sous_titre, url: p.url, score: Math.max(pertinence(p.titre, q), pertinence(p.mots, q) * 0.8) })))
    if (pages.length) groupes.push({ rubrique: 'pages', resultats: pages })
  }
  return groupes.sort((a, b) => (b.resultats[0]?.score ?? 0) - (a.resultats[0]?.score ?? 0))
}

// ---------------------------------------------------------------------------
// Import d'articles
// ---------------------------------------------------------------------------

interface ImportMock extends ImportEtat {
  colonnes: string[]
  lignes: string[][]
}
const imports = new Map<string, ImportMock>()

function decouperCsv(texte: string): string[][] {
  const lignesBrutes = texte.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  const premiere = lignesBrutes[0] ?? ''
  const separateur = [';', '\t', ','].map((s) => ({ s, n: premiere.split(s).length })).sort((a, b) => b.n - a.n)[0]!.s
  return lignesBrutes.map((l) => {
    const cellules: string[] = []
    let courant = ''
    let guillemets = false
    for (let i = 0; i < l.length; i++) {
      const c = l[i]!
      if (c === '"') {
        if (guillemets && l[i + 1] === '"') {
          courant += '"'
          i++
        } else guillemets = !guillemets
      } else if (c === separateur && !guillemets) {
        cellules.push(courant.trim())
        courant = ''
      } else courant += c
    }
    cellules.push(courant.trim())
    return cellules
  })
}

const XLSX_EXEMPLE = [
  ['Désignation', 'PU', 'Famille', 'Réf.', 'Stock'],
  ['Bazin riche 3 m', '15 000', 'Tissus', 'BZ-003', '12'],
  ['Wax hollandais', '9 500', 'Tissus', 'WX-001', '30'],
  ['Thé Ataya (paquet)', '1 200', 'Épicerie', 'TH-01', '80'],
]

function avancerImport(ulid: string, ctx: ContexteMock, mode: ModeImport, correspondance: Correspondance) {
  const imp = imports.get(ulid)
  if (!imp) return
  const champ = (c: ChampImport) => imp.colonnes.findIndex((col) => correspondance[col] === c)
  const iNom = champ('nom')
  const iPrix = champ('prix_xof')
  const iCat = champ('categorie')
  const iSku = champ('sku')
  const lot = imp.lignes.slice(imp.traitees, imp.traitees + 4)
  lot.forEach((ligne, k) => {
    const numero = imp.traitees + k + 2
    const nom = (ligne[iNom] ?? '').trim()
    const prixBrut = (ligne[iPrix] ?? '').replace(/\s| |fcfa/gi, '')
    const prix = /^\d+$/.test(prixBrut) ? Number(prixBrut) : NaN
    if (!nom) return imp.erreurs.push({ ligne: numero, message: 'Le nom est vide.' })
    if (!Number.isInteger(prix)) return imp.erreurs.push({ ligne: numero, message: `Prix illisible : « ${ligne[iPrix] ?? ''} ».` })
    const existant = ctx.articles().find((a) => a.nom.toLowerCase() === nom.toLowerCase())
    if (existant) {
      if (mode === 'creer_et_mettre_a_jour') {
        existant.prix_xof = prix
        imp.mises_a_jour++
      } else imp.erreurs.push({ ligne: numero, message: 'Un article porte déjà ce nom.' })
      return
    }
    ctx.ajouterArticle({ nom, prix_xof: prix, categorie: iCat >= 0 ? ligne[iCat] || null : null, sku: iSku >= 0 ? ligne[iSku] || null : null, couleur: 'orange', actif: true })
    imp.creees++
  })
  imp.traitees = Math.min(imp.total, imp.traitees + lot.length)
  if (imp.traitees >= imp.total) {
    imp.statut = 'termine'
    imp.rapport_url = imp.erreurs.length ? `/api/v1/imports/${ulid}/rapport` : null
    signal('articles', `boutique.${ctx.boutiqueDemo.ulid}`, null, 0)
  } else setTimeout(() => avancerImport(ulid, ctx, mode, correspondance), 450)
  signal('imports', `boutique.${ctx.boutiqueDemo.ulid}`, null, 0)
}

// ---------------------------------------------------------------------------
// Routes publiques (avant le contrôle de session)
// ---------------------------------------------------------------------------

export function repondreV3Public(ctx: ContexteMock): Response | null {
  const m = /^\/invitations\/([^/]+)$/.exec(ctx.route)
  if (m && ctx.methode === 'GET') {
    const jeton = decodeURIComponent(m[1]!)
    if (jeton === 'expiree') return json(410, { message: 'Invitation expirée.', code: 'INVITATION_EXPIREE' })
    if (jeton !== 'demo' && jeton !== 'gerant') return json(404, { message: 'Invitation introuvable.' })
    return json(200, {
      invitation: { boutique: { nom: ctx.boutiqueDemo.nom }, role: jeton === 'gerant' ? 'gerant' : 'caissier', contact_masque: jeton === 'gerant' ? 'ib•••@demo.test' : '+221 77 ••• •• 67', expire_le: ISO(Date.now() + 2 * JOUR + 5 * 60 * MINUTE) },
    })
  }
  return null
}

// ---------------------------------------------------------------------------
// Routes connectées
// ---------------------------------------------------------------------------

export async function repondreV3(ctx: ContexteMock): Promise<Response | null> {
  const { route, methode, init, url } = ctx
  const session = ctx.session!
  initialiserStudio(ctx.bip)

  // ----- 2FA -----
  if (route.startsWith('/auth/2fa')) {
    if (route === '/auth/2fa/initialiser' && methode === 'POST') {
      const secret = 'JBSWY3DPEHPK3PXP'
      const compte = encodeURIComponent(session.email ?? session.telephone ?? session.nom)
      return json(200, { secret, otpauth_url: `otpauth://totp/SatsPoint:${compte}?secret=${secret}&issuer=SatsPoint&digits=6&period=30`, qr_svg: '' })
    }
    if (route === '/auth/2fa/activer' && methode === 'POST') {
      const corps = await lireJson(init)
      if (String(corps.code ?? '').replace(/\s/g, '') !== CODE_TOTP) return json(422, { message: 'Code incorrect.', code: 'CODE_INVALIDE', errors: { code: ['Code incorrect.'] } })
      ecrire2fa(session, 'validee')
      codesSecours = codesSecours.map((c, i) => `${c.slice(0, 2)}${(i * 7) % 10}${c.slice(3)}`)
      return json(200, { codes_secours: codesSecours, deux_fa: etatDeuxFa(session) })
    }
    if (route === '/auth/2fa/verifier' && methode === 'POST') {
      const corps = await lireJson(init)
      const code = String(corps.code ?? '').trim().toLowerCase()
      const secours = codesSecours.indexOf(code)
      if (code.replace(/\s/g, '') !== CODE_TOTP && secours < 0) return json(422, { message: 'Code incorrect.', code: 'CODE_INVALIDE', errors: { code: ['Code incorrect.'] } })
      if (secours >= 0) codesSecours.splice(secours, 1)
      ecrire2fa(session, 'validee')
      return json(200, { deux_fa: etatDeuxFa(session), methode: secours >= 0 ? 'secours' : 'totp', codes_secours_restants: codesSecours.length })
    }
    if (route === '/auth/2fa' && methode === 'DELETE') {
      const corps = await lireJson(init)
      if (corps.password !== ctx.motDePasse) return json(422, { message: 'Mot de passe incorrect.', errors: { password: ['Mot de passe incorrect.'] } })
      ecrire2fa(session, 'inactive')
      return json(204)
    }
  }

  // ----- Console plateforme + studio (super-admin, 2FA validée) -----
  if (route.startsWith('/admin/')) {
    if (session.role_plateforme !== 'super_admin') return json(403, { message: 'Accès refusé.' })
    if (lire2fa(session) !== 'validee') return json(403, { message: 'Double authentification requise.', code: 'DEUX_FA_REQUISE', etape: lire2fa(session) === 'inactive' ? 'activer' : 'verifier' })

    if (route === '/admin/audio/matrice' && methode === 'GET') return json(200, matrice())

    if (route === '/admin/audio' && methode === 'POST') {
      const corps = init?.body instanceof FormData ? init.body : null
      const cle = String(corps?.get('cle') ?? '')
      const langue = String(corps?.get('langue') ?? '') as LangueAudio
      const fichier = corps?.get('fichier')
      if (!clesStudio().some((e) => e.cle === cle) || !langueActive(langue)) return json(422, { message: 'Clé ou langue inconnue.', errors: { cle: ['Clé inconnue.'] } })
      if (!(fichier instanceof Blob) || fichier.size === 0) return json(422, { message: 'Fichier manquant.', errors: { fichier: ['Fichier manquant.'] } })
      if (fichier.size > 2 * 1024 * 1024) return json(422, { message: 'Fichier trop lourd (2 Mo maximum).', errors: { fichier: ['Fichier trop lourd (2 Mo maximum).'] } })
      const cellule = studio.get(cleCellule(cle, langue)) ?? { statut: 'manquant' }
      const id = ++sequenceAudio
      const urlEcoute = URL.createObjectURL(fichier)
      studio.set(cleCellule(cle, langue), { ...cellule, statut: 'en_traitement', id, url: null, erreur: null, mis_a_jour_le: new Date().toISOString() })
      // Traitement « serveur » (silences, volume, MP3 48 kb/s) puis signal sur le canal admin.
      setTimeout(() => {
        const c = studio.get(cleCellule(cle, langue))
        if (!c || c.id !== id) return
        studio.set(cleCellule(cle, langue), { ...c, statut: 'brouillon', url: urlEcoute, duree_ms: 1200 + (id % 9) * 150, mis_a_jour_le: new Date().toISOString() })
        signal('audio', 'admin', null, 0)
      }, 1500)
      return json(202, { audio: { id, cle, langue, statut: 'en_traitement' } })
    }

    if (route === '/admin/audio/publier' && methode === 'POST') {
      const corps = await lireJson(init)
      const ids = Array.isArray(corps.ids) ? (corps.ids as number[]) : null
      let publies = 0
      for (const [k, c] of studio) {
        const [l, cle] = k.split('|')
        const vise = ids ? c.id !== undefined && ids.includes(c.id) : cle === corps.cle && l === corps.langue
        if (vise && c.statut === 'brouillon') {
          studio.set(k, { ...c, statut: 'publie', publieUrl: c.url, mis_a_jour_le: new Date().toISOString() })
          if (!c.publieUrl) publierAudioLangue(l!, 1)
          publies++
        }
      }
      if (publies) {
        signal('audios', 'plateforme', null, 100)
        signal('audio', 'admin', session.ulid, 100)
      }
      return json(200, { publies })
    }

    let m = /^\/admin\/audio\/(\d+)$/.exec(route)
    if (m && methode === 'DELETE') {
      const trouve = trouverParId(Number(m[1]))
      if (!trouve) return json(404, { message: 'Audio introuvable.' })
      const [k, c] = trouve
      if (c.statut === 'publie') return json(409, { message: 'Un audio publié ne se supprime pas.', code: 'AUDIO_PUBLIE' })
      studio.set(k, c.publieUrl ? { statut: 'publie', id: c.id, url: c.publieUrl, publieUrl: c.publieUrl, duree_ms: c.duree_ms ?? null } : { statut: 'manquant' })
      signal('audio', 'admin', session.ulid, 100)
      return json(204)
    }

    if (route === '/admin/statistiques') {
      const mat = matrice()
      const couverture = Object.fromEntries(languesStudio().map(({ code }) => [code, Math.round(((mat.couverture[code]?.publies ?? 0) / (mat.couverture[code]?.total || 1)) * 100)]))
      return json(200, { boutiques: { total: boutiques.length, actives: boutiques.filter((b) => b.statut === 'active').length, nouvelles_7j: 3 }, commercants_actifs_semaine: 19, paiements_par_commercant_semaine: 23.4, delai_median_confirmation_ms: 2300, part_sats_pct: 41, part_mobile_money_pct: 59, couverture_audio: couverture })
    }

    if (route === '/admin/sante') {
      return json(200, {
        statut: 'degrade',
        base: true,
        redis: true,
        reverb: true,
        passerelle: false,
        cours: { age_s: 42, disponible: true, sources: 3 },
        files: { en_attente: { paiements: 0, audio: 1, imports: 0, default: 2 }, echouees: 1, echouees_24h: 0 },
        audio: { fichiers: 214, publies: 188, octets: 3_870_000 },
        version: '0.3.0-mock',
        horodatage: new Date().toISOString(),
      })
    }

    if (route === '/admin/boutiques' && methode === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim()
      const statut = url.searchParams.get('statut')
      const lecture = lirePagination(url.searchParams, 20)
      if ('erreur' in lecture) return lecture.erreur
      const filtrees = boutiques.filter((b) => (!statut || b.statut === statut) && (!q || pertinence(`${b.nom} ${b.ville} ${b.proprietaire?.nom ?? ''}`, q) > 0))
      const { elements, pagination } = paginer(filtrees, lecture)
      return json(200, { boutiques: elements, pagination })
    }
    m = /^\/admin\/boutiques\/([^/]+)$/.exec(route)
    if (m && methode === 'PATCH') {
      const b = boutiques.find((x) => x.ulid === m![1])
      if (!b) return json(404, { message: 'Boutique introuvable.' })
      const corps = await lireJson(init)
      if (corps.statut !== 'active' && corps.statut !== 'suspendue') return json(422, { message: 'Statut invalide.', errors: { statut: ['Statut invalide.'] } })
      b.statut = corps.statut
      journal.unshift({ id: Date.now(), action: b.statut === 'suspendue' ? 'plateforme.boutique_suspendue' : 'plateforme.boutique_reactivee', utilisateur: { ulid: session.ulid, nom: session.nom }, boutique: { ulid: b.ulid, nom: b.nom }, ip: '127.0.0.1', details: null, cree_le: new Date().toISOString() })
      signal('boutiques', 'admin', session.ulid)
      return json(200, { boutique: b })
    }

    if (route === '/admin/journal' && methode === 'GET') {
      const action = url.searchParams.get('action')
      const du = url.searchParams.get('du')
      const au = url.searchParams.get('au')
      const lecture = lirePagination(url.searchParams, 30)
      if ('erreur' in lecture) return lecture.erreur
      const filtrees = journal.filter((e) => (!action || e.action.startsWith(action)) && (!du || e.cree_le.slice(0, 10) >= du) && (!au || e.cree_le.slice(0, 10) <= au))
      const { elements, pagination } = paginer(filtrees, lecture)
      return json(200, { entrees: elements, pagination })
    }

    // ----- Catalogues : pays, langues, moyens de paiement par pays (CONTRAT_API § 14.2) -----
    const catalogue = await repondreCatalogueAdmin(route, methode, url, init, session, (action, details) =>
      journal.unshift({ id: Date.now(), action, utilisateur: { ulid: session.ulid, nom: session.nom }, boutique: null, ip: '127.0.0.1', details, cree_le: new Date().toISOString() }),
    )
    if (catalogue) return catalogue
    return json(404, { message: 'Route inconnue (mock).' })
  }

  // ----- Recherche -----
  if (route === '/recherche' && methode === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim()
    if (q.length < 2) return json(422, { message: 'Deux caractères minimum.', errors: { q: ['Deux caractères minimum.'] } })
    return json(200, { groupes: rechercherMock(q, ctx) })
  }
  if (route === '/recherche/recentes') {
    const liste = recentes.get(session.ulid) ?? (session.boutique ? [...RECENTES_DEFAUT] : [])
    if (methode === 'GET') return json(200, { recentes: liste.slice(0, 4) })
    if (methode === 'POST') {
      const corps = await lireJson(init)
      const terme = String(corps.terme ?? '').trim().slice(0, 100)
      if (terme.length >= 2) recentes.set(session.ulid, [terme, ...liste.filter((t) => t.toLowerCase() !== terme.toLowerCase())].slice(0, 4))
      return json(204)
    }
    if (methode === 'DELETE') {
      recentes.set(session.ulid, [])
      return json(204)
    }
  }

  // ----- Import d'articles -----
  if (route === '/imports/analyser' && methode === 'POST') {
    const gestion = session.boutique?.role === 'proprietaire' || session.boutique?.role === 'gerant'
    if (!gestion) return json(403, { message: 'Accès refusé.' })
    const corps = init?.body instanceof FormData ? init.body : null
    const fichier = corps?.get('fichier')
    if (!(fichier instanceof File)) return json(422, { message: 'Fichier manquant.', errors: { fichier: ['Fichier manquant.'] } })
    if (fichier.size > 2 * 1024 * 1024) return json(422, { message: 'Fichier trop lourd (2 Mo maximum).', errors: { fichier: ['Fichier trop lourd (2 Mo maximum).'] } })
    const extension = fichier.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'txt', 'xlsx'].includes(extension ?? '')) return json(422, { message: 'Format non pris en charge (CSV ou Excel).', errors: { fichier: ['Format non pris en charge (CSV ou Excel).'] } })
    const tableau = extension === 'xlsx' ? XLSX_EXEMPLE : decouperCsv(await fichier.text())
    const [colonnes = [], ...lignes] = tableau
    if (!colonnes.length || !lignes.length) return json(422, { message: 'Le fichier est vide.', errors: { fichier: ['Le fichier est vide.'] } })
    const ulid = `01IMP${Date.now().toString(36).toUpperCase()}`.padEnd(26, '0').slice(0, 26)
    imports.set(ulid, { ulid, statut: 'analyse', total: lignes.length, traitees: 0, creees: 0, mises_a_jour: 0, erreurs: [], rapport_url: null, colonnes, lignes })
    return json(200, { import: { ulid, colonnes, apercu: lignes.slice(0, 10), suggestions: suggererCorrespondance(colonnes), total_lignes: lignes.length }, champs: ['nom', 'prix_xof', 'categorie', 'sku', 'couleur', 'actif'] })
  }
  let m = /^\/imports\/([^/]+)(\/executer)?$/.exec(route)
  if (m) {
    const imp = imports.get(m[1]!)
    if (!imp) return json(404, { message: 'Import introuvable.' })
    const vue = (): ImportEtat => {
      const { colonnes: _c, lignes: _l, ...visible } = imp
      return visible
    }
    if (m[2] && methode === 'POST') {
      if (imp.statut !== 'analyse') return json(409, { message: 'Import déjà lancé.', code: 'IMPORT_DEJA_LANCE' })
      const corps = await lireJson(init)
      const correspondance = (corps.correspondance ?? {}) as Correspondance
      const valeurs = Object.values(correspondance)
      if (!valeurs.includes('nom') || !valeurs.includes('prix_xof')) return json(422, { message: 'Associez au moins le nom et le prix.', errors: { correspondance: ['Associez au moins le nom et le prix.'] } })
      imp.statut = 'en_cours'
      setTimeout(() => avancerImport(imp.ulid, ctx, (corps.mode as ModeImport) ?? 'creer', correspondance), 500)
      return json(202, { import: vue() })
    }
    if (!m[2] && methode === 'GET') return json(200, { import: vue() })
  }
  m = /^\/imports\/([^/]+)\/rapport$/.exec(route)
  if (m) {
    const imp = imports.get(m[1]!)
    if (!imp) return json(404, { message: 'Import introuvable.' })
    const csv = `﻿Ligne;Erreur\n${imp.erreurs.map((e) => `${e.ligne};${e.message}`).join('\n')}\n`
    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="rapport-import.csv"' } })
  }

  // ----- Invitation -----
  m = /^\/invitations\/([^/]+)\/accepter$/.exec(route)
  if (m && methode === 'POST') {
    const jeton = decodeURIComponent(m[1]!)
    if (jeton !== 'demo' && jeton !== 'gerant') return json(404, { message: 'Invitation introuvable ou expirée.', code: 'INVITATION_INVALIDE' })
    if (session.boutique) return json(422, { message: 'Vous faites déjà partie d’une boutique.', code: 'DEJA_MEMBRE' })
    const utilisateur: Utilisateur = { ...session, boutique: { ulid: ctx.boutiqueDemo.ulid, nom: ctx.boutiqueDemo.nom, ville: ctx.boutiqueDemo.ville, devise: 'XOF', role: jeton === 'gerant' ? 'gerant' : 'caissier', configuration: { wallet: true, paytech: true, paiement_test: true } } }
    ctx.ecrireSession(utilisateur)
    signal('equipe', `boutique.${ctx.boutiqueDemo.ulid}`, utilisateur.ulid)
    return json(200, { utilisateur })
  }

  return null
}
