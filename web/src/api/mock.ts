/**
 * Mode mock (développement uniquement, `VITE_MOCK_API=true` / `npm run dev:mock`).
 * Intercepte `fetch` pour simuler l'API selon le contrat `/api/v1` (docs/CONTRAT_API.md). Jamais inclus en production :
 * l'import est dynamique et gardé par `import.meta.env.DEV`.
 *
 * Machine d'état réaliste : vente créée → tentative (facture Lightning, lien PayTech, lien Wave) → `simuler` → payée
 * → signal temps réel simulé (rubriques `paiements`, `ventes`, `wallet`) → tableau de bord recalculé. Les tentatives
 * expirent après `expire_le` (minuterie), le cours bouge légèrement toutes les 60 s.
 *
 * Leviers pour les essais / captures (sessionStorage) :
 * - `satspoint.mock.session` : identifiant du compte connecté ;
 * - `satspoint.mock.session.preferences` : préférences imposées ;
 * - `satspoint.mock.cours` = `indisponible` : le cours n'est plus disponible (Lightning bloqué) ;
 * - `satspoint.mock.wallet` = `deconnecte` : aucun portefeuille connecté ;
 * - `satspoint.mock.moyens` = `aucun` : ni portefeuille, ni PayTech, ni lien Wave (aucun moyen de paiement branché) ;
 * - `satspoint.mock.vide` = `1` : boutique sans aucune vente.
 */
import { emettreSignal } from '@/temps-reel/signaux'
import { audiosPublies, etatDeuxFa, reinitialiserDeuxFa, repondreV3, repondreV3Public, type ContexteMock } from './mockV3'
import type {
  Article,
  BoutiqueDetail,
  Config,
  Equipe,
  Invitation,
  LangueAudio,
  ManifesteAudio,
  MethodePaiement,
  Operateur,
  Paiement,
  Preferences,
  RecuPublic,
  RoleBoutique,
  StatutVente,
  TableauDeBord,
  TransactionWallet,
  Utilisateur,
  Vente,
  VenteCourte,
  Wallet,
} from './types'

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
  app: { nom: 'SatsPoint', env: 'local', demo: true, version: '0.2.0-mock' },
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
  'caisse.lightning',
  'caisse.mobileMoney',
  'paiement.recu',
  'paiement.expire',
  'paiement.annule',
  'paiement.copier',
  'paiement.partager',
  'paiement.annuler',
  'paiement.verifier',
  'paiement.simuler',
  'paiement.nouvelleDemande',
  'succes.envoyerRecu',
  'succes.nouvelleVente',
  'ventes.exporter',
  'ventes.filtrer',
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

const bips = new Map<LangueAudio, string>()
function bip(langue: LangueAudio): string {
  if (!bips.has(langue)) bips.set(langue, bipDataUrl(FREQUENCES[langue]))
  return bips.get(langue)!
}

function manifeste(langue: LangueAudio): ManifesteAudio {
  const url = bip(langue)
  const audios: Record<string, string> = {}
  // Le français couvre tout (repli) ; les langues locales couvrent un sous-ensemble pour montrer le repli.
  const cles = langue === 'fr' ? CLES_AUDIO : CLES_AUDIO.filter((c) => !c.startsWith('auth.') && c !== 'langue.en')
  for (const cle of cles) audios[cle] = url
  // Le nom de chaque langue est dit dans sa propre langue.
  if (langue !== 'fr') audios[`langue.${langue}`] = url
  // Audios publiés depuis le studio (vague 3).
  const publies = audiosPublies(langue)
  Object.assign(audios, publies)
  return { langue, version: 1 + Object.keys(publies).length, audios }
}

// ---------------------------------------------------------------------------
// Données métier simulées
// ---------------------------------------------------------------------------

/** Générateur pseudo-aléatoire déterministe (mêmes données à chaque lancement). */
function creerAleatoire(graine: number) {
  let etat = graine >>> 0
  return () => {
    etat = (etat * 1664525 + 1013904223) >>> 0
    return etat / 0x100000000
  }
}

const ALPHABET_ULID = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
let compteurUlid = 0
function ulid(prefixe = '01J'): string {
  compteurUlid += 1
  const temps = Date.now().toString(36).toUpperCase().padStart(9, '0').slice(-9)
  let suite = ''
  for (let i = 0; i < 26 - prefixe.length - 9 - 3; i++) suite += ALPHABET_ULID[Math.floor(Math.random() * 32)]
  return `${prefixe}${temps}${suite}${compteurUlid.toString(36).toUpperCase().padStart(3, '0')}`
}

const SATS_PAR_BTC = 100_000_000
const COURS_BASE = 64_000_000
const ISO = (d: Date | number) => new Date(d).toISOString()
const MINUTE = 60_000
const JOUR = 24 * 60 * MINUTE

/** Cours qui bouge légèrement (± 0,6 %) avec un pas de 60 s. */
function coursActuel(): number {
  const pas = Math.floor(Date.now() / MINUTE)
  const variation = Math.sin(pas / 7) * 0.004 + Math.cos(pas / 3) * 0.002
  return Math.round(COURS_BASE * (1 + variation))
}

function enSats(xof: number, cours: number) {
  return Math.ceil((xof * SATS_PAR_BTC) / cours)
}

function fauxBolt11(sats: number, graine: string): string {
  const alea = creerAleatoire(graine.split('').reduce((a, c) => a + c.charCodeAt(0), 7))
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
  let corps = ''
  for (let i = 0; i < 180; i++) corps += alphabet[Math.floor(alea() * 32)]
  return `lnbc${sats * 10}n1p${corps}`
}

interface Etat {
  cree_le: string
  boutique: BoutiqueDetail
  wallet: { connecte: boolean; alias: string; lud16: string; permissions: string[]; budget_sats: number; solde_sats: number; verifie_le: string }
  transactions: TransactionWallet[]
  ventes: Vente[]
  sequence: number
  articles: Article[]
  invitations: Invitation[]
  membres: Array<{ ulid: string; role: RoleBoutique; actif: boolean; derniere_connexion_le: string | null }>
  /** Reçus : jeton → ulid de vente. */
  recus: Record<string, string>
}

const CAISSIERS = [
  { ulid: COMPTES['proprio@demo.test']!.ulid, nom: 'Awa Ndiaye' },
  { ulid: COMPTES['gerant@demo.test']!.ulid, nom: 'Fatou Sow' },
  { ulid: COMPTES['caissier@demo.test']!.ulid, nom: 'Moussa Fall' },
]

const ARTICLES_DEMO: Array<Omit<Article, 'ulid' | 'position'>> = [
  { nom: 'Café Touba', prix_xof: 300, categorie: 'Boissons', couleur: 'brun', sku: null, actif: true },
  { nom: 'Thiéboudienne', prix_xof: 2500, categorie: 'Plats', couleur: 'orange', sku: 'PL-01', actif: true },
  { nom: 'Yassa poulet', prix_xof: 3000, categorie: 'Plats', couleur: 'jaune', sku: 'PL-02', actif: true },
  { nom: 'Bissap 50 cl', prix_xof: 500, categorie: 'Boissons', couleur: 'rouge', sku: null, actif: true },
  { nom: 'Eau 1,5 L', prix_xof: 400, categorie: 'Boissons', couleur: 'bleu', sku: null, actif: true },
  { nom: 'Pastels (×4)', prix_xof: 1000, categorie: 'Snacks', couleur: 'vert', sku: null, actif: true },
  { nom: 'Bazin (le mètre)', prix_xof: 7500, categorie: 'Tissus', couleur: 'violet', sku: 'TX-07', actif: true },
  { nom: 'Recharge 1 000', prix_xof: 1000, categorie: 'Services', couleur: 'gris', sku: null, actif: false },
]

const NOTES = ['Table 4', null, null, '2 m de bazin', null, 'Livraison Plateau', null, null, 'Client fidèle', null]

/** Jeu de données initial : ≈ 60 ventes sur 30 jours, quelques tentatives en attente pour les écrans de paiement. */
function creerEtatInitial(): Etat {
  const alea = creerAleatoire(20261108)
  const maintenant = Date.now()
  const ventes: Vente[] = []
  let sequence = 0
  const recus: Record<string, string> = {}
  const transactions: TransactionWallet[] = []

  const nouvelleVente = (
    options: { montant: number; methode: MethodePaiement; operateur?: Operateur; statut: StatutVente; cree: number; caissier: number; note?: string | null; alerte?: Vente['alerte'] },
    pendant?: (v: Vente) => void,
  ): Vente => {
    sequence += 1
    const cours = Math.round(COURS_BASE * (1 + (alea() - 0.5) * 0.03))
    const sats = options.methode === 'lightning' ? enSats(options.montant, cours) : null
    const venteUlid = ulid('01V')
    const paiementUlid = ulid('01P')
    const regle = options.statut === 'payee' ? options.cree + 20_000 + alea() * 90_000 : null
    const paiement: Paiement = {
      ulid: paiementUlid,
      methode: options.methode,
      operateur: options.methode === 'paytech' ? (options.operateur ?? 'wave') : null,
      statut: options.statut === 'payee' ? 'reussi' : options.statut === 'annulee' ? 'annule' : options.statut === 'expiree' ? 'expire' : 'en_attente',
      montant_xof: options.montant,
      montant_sats: sats,
      cours_xof_par_btc: options.methode === 'lightning' ? cours : null,
      bolt11: options.methode === 'lightning' && options.statut !== 'annulee' ? fauxBolt11(sats ?? 1, paiementUlid) : null,
      payment_hash_abrege: options.methode === 'lightning' && options.statut === 'payee' ? paiementUlid.slice(-8).toLowerCase() : null,
      paytech: options.methode === 'paytech' ? { redirect_url: `https://paytech.sn/payment/checkout/${paiementUlid.toLowerCase()}`, token: paiementUlid.toLowerCase() } : null,
      wave_lien: options.methode === 'wave_manuel' ? `https://pay.wave.com/m/M_demo_satspoint/c/sn/?amount=${options.montant}` : null,
      simule: true,
      cree_le: ISO(options.cree),
      expire_le: options.methode === 'lightning' || options.methode === 'paytech' ? ISO(options.cree + 5 * MINUTE) : null,
      regle_le: regle ? ISO(regle) : null,
    }
    const caissier = CAISSIERS[options.caissier]!
    const vente: Vente = {
      ulid: venteUlid,
      numero: `V-${String(sequence).padStart(6, '0')}`,
      montant_xof: options.montant,
      statut: options.statut,
      methode_reussie: options.statut === 'payee' ? options.methode : null,
      methode_en_cours: options.statut === 'en_attente' ? options.methode : null,
      operateur_reussi: options.statut === 'payee' ? paiement.operateur : null,
      montant_sats_reussi: options.statut === 'payee' ? sats : null,
      caissier,
      note: options.note === undefined ? (NOTES[Math.floor(alea() * NOTES.length)] ?? null) : options.note,
      alerte: options.alerte ?? null,
      cree_le: ISO(options.cree),
      payee_le: regle ? ISO(regle) : null,
      lignes: [],
      paiements: [paiement],
      paiement_reussi: options.statut === 'payee' ? paiement : null,
      recu_url: options.statut === 'payee' ? `/r/${venteUlid.toLowerCase()}` : null,
    }
    if (vente.recu_url) recus[venteUlid.toLowerCase()] = venteUlid
    if (vente.statut === 'payee' && vente.methode_reussie === 'lightning') {
      transactions.push({
        type: 'entrante',
        statut: 'reglee',
        montant_sats: sats ?? 0,
        frais_sats: 0,
        description: `SatsPoint · Boutique Démo · ${vente.numero}`,
        regle_le: vente.payee_le,
        cree_le: vente.cree_le,
      })
    }
    pendant?.(vente)
    ventes.push(vente)
    return vente
  }

  const MONTANTS = [300, 500, 1000, 1500, 2500, 3000, 4500, 5000, 7500, 10000, 12000, 15000, 25000, 45000]
  // 30 jours d'historique, du plus ancien au plus récent (la journée en cours est bien remplie).
  for (let j = 30; j >= 0; j--) {
    const debutJour = maintenant - j * JOUR
    const nombre = j === 0 ? 9 : 1 + Math.floor(alea() * (j % 7 === 0 ? 2 : 5))
    for (let i = 0; i < nombre; i++) {
      const heure = j === 0 ? Math.min(0.97, 0.1 + (i / nombre) * 0.85) : 0.3 + alea() * 0.55
      const cree = j === 0 ? maintenant - (1 - heure) * 9 * 60 * MINUTE : debutJour - debutJour % JOUR + heure * JOUR
      if (cree > maintenant - 2 * MINUTE) continue
      const r = alea()
      const methode: MethodePaiement = r < 0.55 ? 'lightning' : r < 0.9 ? 'paytech' : 'wave_manuel'
      const operateur: Operateur = alea() < 0.6 ? 'wave' : alea() < 0.7 ? 'orange_money' : 'free_money'
      const s = alea()
      const statut: StatutVente = s < 0.86 ? 'payee' : s < 0.93 ? 'annulee' : 'expiree'
      nouvelleVente({ montant: MONTANTS[Math.floor(alea() * MONTANTS.length)]!, methode, operateur, statut, cree, caissier: Math.floor(alea() * 3) })
    }
  }

  // Une vente avec panier (lignes) et un trop-perçu, pour le détail.
  nouvelleVente({ montant: 3500, methode: 'lightning', statut: 'payee', cree: maintenant - 70 * MINUTE, caissier: 2, note: null }, (v) => {
    v.lignes = [
      { libelle: 'Thiéboudienne', quantite: 1, prix_unitaire_xof: 2500, article_ulid: null },
      { libelle: 'Bissap 50 cl', quantite: 2, prix_unitaire_xof: 500, article_ulid: null },
    ]
  })
  nouvelleVente({ montant: 5000, methode: 'paytech', operateur: 'orange_money', statut: 'payee', cree: maintenant - 55 * MINUTE, caissier: 1, alerte: 'trop_percu', note: null }, (v) => {
    const second: Paiement = { ...v.paiements[0]!, ulid: ulid('01P'), methode: 'lightning', operateur: null, montant_sats: enSats(5000, COURS_BASE), cours_xof_par_btc: COURS_BASE, bolt11: fauxBolt11(7813, 'bis'), payment_hash_abrege: 'a1b2c3d4', paytech: null, statut: 'reussi' }
    v.paiements = [second, v.paiements[0]!]
  })

  // Tentatives en attente (identifiants stables pour les captures) : Lightning, PayTech, Wave direct.
  const fixer = (v: Vente, ulidVente: string, ulidPaiement: string) => {
    v.ulid = ulidVente
    v.paiements[0]!.ulid = ulidPaiement
  }
  nouvelleVente({ montant: 15000, methode: 'lightning', statut: 'en_attente', cree: maintenant - 20_000, caissier: 0, note: null }, (v) => fixer(v, '01VDEMOLIGHTNING00000000001', '01PDEMOLIGHTNING00000000001'))
  nouvelleVente({ montant: 7500, methode: 'paytech', operateur: 'wave', statut: 'en_attente', cree: maintenant - 40_000, caissier: 2, note: 'Table 2' }, (v) => fixer(v, '01VDEMOPAYTECH0000000000001', '01PDEMOPAYTECH0000000000001'))
  nouvelleVente({ montant: 12000, methode: 'wave_manuel', statut: 'en_attente', cree: maintenant - 3 * MINUTE, caissier: 1, note: null }, (v) => fixer(v, '01VDEMOWAVE0000000000000001', '01PDEMOWAVE0000000000000001'))
  // Une demande Lightning dont le délai est dépassé (l'expiration est appliquée à la première lecture).
  nouvelleVente({ montant: 4500, methode: 'lightning', statut: 'en_attente', cree: maintenant - 9 * MINUTE, caissier: 0, note: null }, (v) => fixer(v, '01VDEMOEXPIRE00000000000001', '01PDEMOEXPIRE00000000000001'))
  // Une vente payée (écran de succès) et son reçu « demo ».
  nouvelleVente({ montant: 15000, methode: 'lightning', statut: 'payee', cree: maintenant - 90_000, caissier: 0, note: null }, (v) => {
    fixer(v, '01VDEMOPAYEE000000000000001', '01PDEMOPAYEE000000000000001')
    v.recu_url = '/r/demo'
  })
  recus.demo = '01VDEMOPAYEE000000000000001'

  // Quelques sorties du portefeuille.
  transactions.push(
    { type: 'sortante', statut: 'reglee', montant_sats: 12000, frais_sats: 4, description: 'Fournisseur bazin', regle_le: ISO(maintenant - 2 * JOUR), cree_le: ISO(maintenant - 2 * JOUR) },
    { type: 'sortante', statut: 'reglee', montant_sats: 2500, frais_sats: 1, description: 'Transfert Alby', regle_le: ISO(maintenant - 6 * JOUR), cree_le: ISO(maintenant - 6 * JOUR) },
  )
  transactions.sort((a, b) => (a.cree_le < b.cree_le ? 1 : -1))

  const entrees = transactions.filter((t) => t.type === 'entrante').reduce((s, t) => s + t.montant_sats, 0)
  const sorties = transactions.filter((t) => t.type === 'sortante').reduce((s, t) => s + t.montant_sats + t.frais_sats, 0)

  return {
    cree_le: ISO(maintenant),
    boutique: {
      ulid: BOUTIQUE_DEMO.ulid,
      nom: BOUTIQUE_DEMO.nom,
      telephone: '+221771234567',
      ville: 'Dakar',
      devise: 'XOF',
      reglages: {
        expiration_facture_min: 5,
        montant_max_xof: 2_000_000,
        moyens: { lightning: true, paytech: true, wave_manuel: true },
        message_recu: 'Merci de votre visite !',
        wave_lien: 'https://pay.wave.com/m/M_demo_satspoint/c/sn/',
      },
      configuration: { ...BOUTIQUE_DEMO.configuration },
      paytech: { configure: true, environnement: 'test' },
    },
    wallet: {
      connecte: true,
      alias: 'Coinos · boutique-demo',
      lud16: 'boutiquedemo@coinos.io',
      permissions: ['get_info', 'get_balance', 'make_invoice', 'lookup_invoice', 'list_transactions', 'pay_invoice'],
      budget_sats: 100_000,
      solde_sats: Math.max(0, 250_000 + entrees - sorties),
      verifie_le: ISO(maintenant - 40_000),
    },
    transactions,
    ventes,
    sequence,
    articles: ARTICLES_DEMO.map((a, i) => ({ ...a, ulid: ulid('01A'), position: i })),
    invitations: [{ ulid: ulid('01I'), contact: '+221 77 555 12 34', role: 'caissier', expire_le: ISO(maintenant + 60 * 60 * MINUTE) }],
    membres: [
      { ulid: CAISSIERS[0]!.ulid, role: 'proprietaire', actif: true, derniere_connexion_le: ISO(maintenant - 5 * MINUTE) },
      { ulid: CAISSIERS[1]!.ulid, role: 'gerant', actif: true, derniere_connexion_le: ISO(maintenant - 3 * 60 * MINUTE) },
      { ulid: CAISSIERS[2]!.ulid, role: 'caissier', actif: true, derniere_connexion_le: ISO(maintenant - 25 * MINUTE) },
    ],
    recus,
  }
}

let etat: Etat = creerEtatInitial()
if (sessionStorage.getItem('satspoint.mock.vide') === '1') {
  etat.ventes = []
  etat.transactions = []
  etat.recus = {}
  etat.sequence = 0
}
if (sessionStorage.getItem('satspoint.mock.wallet') === 'deconnecte') {
  etat.wallet.connecte = false
  etat.boutique.configuration.wallet = false
}
if (sessionStorage.getItem('satspoint.mock.moyens') === 'aucun') {
  etat.wallet.connecte = false
  etat.boutique.configuration = { ...etat.boutique.configuration, wallet: false, paytech: false }
  etat.boutique.paytech = { configure: false, environnement: 'test' }
  etat.boutique.reglages = { ...etat.boutique.reglages, wave_lien: null }
}
const coursIndisponible = () => sessionStorage.getItem('satspoint.mock.cours') === 'indisponible'

// ---------------------------------------------------------------------------
// Transitions (toujours côté « serveur » ; le front relit via GET /paiements/{ulid})
// ---------------------------------------------------------------------------

function signaler(rubriques: string[], auteur: string | null, delai = 250) {
  setTimeout(() => {
    for (const rubrique of rubriques) {
      emettreSignal({ rubrique, auteur, horodatage: new Date().toISOString(), canal: `boutique.${BOUTIQUE_DEMO.ulid}` })
    }
  }, delai)
}

function trouverPaiement(ulidPaiement: string): { vente: Vente; paiement: Paiement } | null {
  for (const vente of etat.ventes) {
    const paiement = vente.paiements.find((p) => p.ulid === ulidPaiement)
    if (paiement) return { vente, paiement }
  }
  return null
}

/** Expiration paresseuse + minuterie : une tentative `en_attente` dont `expire_le` est passé devient `expire`. */
function appliquerExpirations(): boolean {
  const maintenant = Date.now()
  let change = false
  for (const vente of etat.ventes) {
    for (const p of vente.paiements) {
      if (p.statut === 'en_attente' && p.expire_le && new Date(p.expire_le).getTime() <= maintenant) {
        p.statut = 'expire'
        change = true
      }
    }
    if (vente.statut === 'en_attente' && vente.paiements.length && vente.paiements.every((p) => p.statut !== 'en_attente')) {
      // Toutes les tentatives sont terminées sans succès : la vente expire 30 min après la dernière échéance.
      const derniere = Math.max(...vente.paiements.map((p) => new Date(p.expire_le ?? p.cree_le).getTime()))
      if (maintenant - derniere > 30 * MINUTE) {
        vente.statut = 'expiree'
        change = true
      }
    }
  }
  return change
}

setInterval(() => {
  if (appliquerExpirations()) signaler(['paiements', 'ventes'], null, 0)
}, 2000)

/** Règlement d'une tentative (simulation, IPN PayTech, confirmation manuelle). Jamais de perte silencieuse. */
function regler(vente: Vente, paiement: Paiement) {
  const maintenant = ISO(Date.now())
  paiement.statut = 'reussi'
  paiement.regle_le = maintenant
  if (paiement.methode === 'lightning') paiement.payment_hash_abrege = paiement.ulid.slice(-8).toLowerCase()

  if (vente.statut === 'payee') {
    vente.alerte = 'trop_percu'
  } else {
    if (vente.statut === 'annulee' || vente.statut === 'expiree') vente.alerte = 'payee_apres_annulation'
    vente.statut = 'payee'
    vente.payee_le = maintenant
    vente.methode_reussie = paiement.methode
    vente.operateur_reussi = paiement.operateur
    vente.montant_sats_reussi = paiement.montant_sats
    vente.paiement_reussi = paiement
    const jeton = vente.ulid.toLowerCase()
    vente.recu_url = `/r/${jeton}`
    etat.recus[jeton] = vente.ulid
    for (const autre of vente.paiements) if (autre !== paiement && autre.statut === 'en_attente') autre.statut = 'annule'
  }
  if (paiement.methode === 'lightning' && paiement.montant_sats) {
    etat.wallet.solde_sats += paiement.montant_sats
    etat.transactions.unshift({
      type: 'entrante',
      statut: 'reglee',
      montant_sats: paiement.montant_sats,
      frais_sats: 0,
      description: `SatsPoint · ${etat.boutique.nom} · ${vente.numero}`,
      regle_le: maintenant,
      cree_le: paiement.cree_le,
    })
  }
}

function creerTentative(vente: Vente, methode: MethodePaiement, operateur: Operateur | undefined): Paiement | { erreur: Response } {
  const maintenant = Date.now()
  const ulidPaiement = ulid('01P')
  const base: Paiement = {
    ulid: ulidPaiement,
    methode,
    operateur: null,
    statut: 'en_attente',
    montant_xof: vente.montant_xof,
    montant_sats: null,
    cours_xof_par_btc: null,
    bolt11: null,
    payment_hash_abrege: null,
    paytech: null,
    wave_lien: null,
    simule: true,
    cree_le: ISO(maintenant),
    expire_le: null,
    regle_le: null,
  }
  if (methode === 'lightning') {
    if (!etat.boutique.reglages.moyens.lightning) return { erreur: json(422, { message: 'Le paiement bitcoin est désactivé.', code: 'MOYEN_DESACTIVE' }) }
    if (coursIndisponible()) return { erreur: json(503, { message: "Le prix du bitcoin n'est pas disponible pour le moment.", code: 'COURS_INDISPONIBLE' }) }
    if (!etat.wallet.connecte) return { erreur: json(503, { message: 'Votre portefeuille ne répond pas.', code: 'WALLET_INJOIGNABLE' }) }
    const cours = coursActuel()
    base.cours_xof_par_btc = cours
    base.montant_sats = enSats(vente.montant_xof, cours)
    base.bolt11 = fauxBolt11(base.montant_sats, ulidPaiement)
    base.expire_le = ISO(maintenant + etat.boutique.reglages.expiration_facture_min * MINUTE)
  } else if (methode === 'paytech') {
    if (!etat.boutique.reglages.moyens.paytech || !etat.boutique.paytech.configure) return { erreur: json(422, { message: "Le mobile money n'est pas configuré.", code: 'PAYTECH_NON_CONFIGURE' }) }
    base.operateur = operateur ?? 'wave'
    base.paytech = { redirect_url: `https://paytech.sn/payment/checkout/${ulidPaiement.toLowerCase()}`, token: ulidPaiement.toLowerCase() }
    base.expire_le = ISO(maintenant + etat.boutique.reglages.expiration_facture_min * MINUTE)
  } else {
    const lien = etat.boutique.reglages.wave_lien
    if (!etat.boutique.reglages.moyens.wave_manuel || !lien) return { erreur: json(422, { message: "Le lien Wave n'est pas configuré.", code: 'WAVE_NON_CONFIGURE' }) }
    base.operateur = 'wave'
    base.wave_lien = `${lien}${lien.includes('?') ? '&' : '?'}amount=${vente.montant_xof}`
  }
  for (const p of vente.paiements) if (p.statut === 'en_attente') p.statut = 'annule'
  vente.paiements.unshift(base)
  return base
}

function courte(v: Vente): VenteCourte {
  const { lignes: _l, paiements: _p, paiement_reussi: _r, recu_url: _u, ...reste } = v
  return { ...reste, methode_en_cours: v.statut === 'en_attente' ? (v.paiements.find((p) => p.statut === 'en_attente')?.methode ?? null) : null }
}

function debutJourDakar(d: number): number {
  const date = new Date(d)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function bornesPeriode(periode: string, du?: string | null, au?: string | null): [number, number] {
  const aujourdhui = debutJourDakar(Date.now())
  switch (periode) {
    case 'hier':
      return [aujourdhui - JOUR, aujourdhui]
    case '7j':
      return [aujourdhui - 6 * JOUR, aujourdhui + JOUR]
    case '30j':
      return [aujourdhui - 29 * JOUR, aujourdhui + JOUR]
    case 'perso': {
      const d = du ? Date.parse(`${du}T00:00:00Z`) : aujourdhui
      const a = au ? Date.parse(`${au}T00:00:00Z`) + JOUR : d + JOUR
      return [d, a]
    }
    default:
      return [aujourdhui, aujourdhui + JOUR]
  }
}

function filtrerVentes(params: URLSearchParams, session: Utilisateur): Vente[] {
  const caissier = session.boutique?.role === 'caissier'
  const periode = caissier ? 'aujourdhui' : (params.get('periode') ?? 'aujourdhui')
  const [debut, fin] = bornesPeriode(periode, params.get('du'), params.get('au'))
  const statut = params.get('statut')
  const methode = params.get('methode')
  const caissierUlid = caissier ? session.ulid : params.get('caissier')
  const q = (params.get('q') ?? '').trim().toLowerCase().replace(/\s/g, '')
  return etat.ventes
    .filter((v) => {
      const t = new Date(v.cree_le).getTime()
      if (t < debut || t >= fin) return false
      if (statut && v.statut !== statut) return false
      if (methode && !(v.methode_reussie === methode || v.paiements.some((p) => p.methode === methode))) return false
      if (caissierUlid && v.caissier.ulid !== caissierUlid) return false
      if (q && !v.numero.toLowerCase().includes(q) && !String(v.montant_xof).includes(q)) return false
      return true
    })
    .sort((a, b) => (a.cree_le < b.cree_le ? 1 : -1))
}

function tableauDeBord(periode: string, session: Utilisateur): TableauDeBord {
  const caissier = session.boutique?.role === 'caissier'
  const p = caissier ? 'aujourdhui' : periode
  const [debut, fin] = bornesPeriode(p)
  const duree = fin - debut
  const dans = (d: number, f: number) => etat.ventes.filter((v) => {
    const t = new Date(v.cree_le).getTime()
    return t >= d && t < f && (!caissier || v.caissier.ulid === session.ulid)
  })
  const courantes = dans(debut, fin)
  const payees = courantes.filter((v) => v.statut === 'payee')
  const precedentes = dans(debut - duree, debut).filter((v) => v.statut === 'payee')
  const somme = (liste: Vente[]) => liste.reduce((s, v) => s + v.montant_xof, 0)
  const ca = somme(payees)
  const caPrecedent = somme(precedentes)
  const lightning = payees.filter((v) => v.methode_reussie === 'lightning')
  const mm = payees.filter((v) => v.methode_reussie !== 'lightning')
  const serie: TableauDeBord['serie'] = []
  for (let d = debut; d < fin; d += JOUR) {
    const duJour = payees.filter((v) => {
      const t = new Date(v.cree_le).getTime()
      return t >= d && t < d + JOUR
    })
    serie.push({ jour: new Date(d).toISOString().slice(0, 10), montant_xof: somme(duJour), nombre: duJour.length })
  }
  return {
    periode: (p === 'perso' ? 'aujourdhui' : p) as TableauDeBord['periode'],
    du: new Date(debut).toISOString().slice(0, 10),
    au: new Date(fin - 1).toISOString().slice(0, 10),
    chiffre_affaires_xof: ca,
    nombre_ventes: payees.length,
    panier_moyen_xof: payees.length ? Math.round(ca / payees.length) : 0,
    repartition: {
      lightning: { nombre: lightning.length, montant_xof: somme(lightning) },
      mobile_money: { nombre: mm.length, montant_xof: somme(mm) },
    },
    comparaison_pct: caPrecedent > 0 ? Math.round(((ca - caPrecedent) / caPrecedent) * 100) : null,
    serie,
    dernieres_ventes: [...courantes].sort((a, b) => (a.cree_le < b.cree_le ? 1 : -1)).slice(0, 10).map(courte),
  }
}

function walletPublic(): Wallet {
  const w = etat.wallet
  if (!w.connecte) return { connecte: false, alias: null, lud16: null, permissions: [], budget_sats: null, verifie_le: null, solde: null }
  const cours = coursActuel()
  return {
    connecte: true,
    alias: w.alias,
    lud16: w.lud16,
    permissions: w.permissions,
    budget_sats: w.budget_sats,
    verifie_le: w.verifie_le,
    solde: { sats: w.solde_sats, xof: Math.floor((w.solde_sats * cours) / SATS_PAR_BTC), cours_xof_par_btc: cours },
  }
}

function csvVentes(ventes: Vente[]): string {
  const lignes = [['numero', 'date', 'montant_xof', 'statut', 'methode', 'operateur', 'montant_sats', 'caissier', 'note']]
  for (const v of ventes) {
    lignes.push([v.numero, v.cree_le, String(v.montant_xof), v.statut, v.methode_reussie ?? '', v.operateur_reussi ?? '', v.montant_sats_reussi?.toString() ?? '', v.caissier.nom, v.note ?? ''])
  }
  return `﻿${lignes.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n')}`
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
    const base = surcharge ? { ...utilisateur, preferences: { ...utilisateur.preferences, ...(JSON.parse(surcharge) as Partial<Preferences>) } } : utilisateur
    // La configuration de la boutique suit l'état simulé (portefeuille connecté, PayTech, paiement test).
    const avec2fa = { ...base, deux_fa: etatDeuxFa(base) }
    return avec2fa.boutique ? { ...avec2fa, boutique: { ...avec2fa.boutique, nom: etat.boutique.nom, ville: etat.boutique.ville, configuration: { ...etat.boutique.configuration } } } : avec2fa
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

const estGestion = (s: Utilisateur) => s.boutique?.role === 'proprietaire' || s.boutique?.role === 'gerant'
const estProprietaire = (s: Utilisateur) => s.boutique?.role === 'proprietaire'
const interdit = () => json(403, { message: 'Cette action est réservée au propriétaire de la boutique.' })

async function repondre(url: URL, init: RequestInit | undefined): Promise<Response | null> {
  const methode = (init?.method ?? 'GET').toUpperCase()
  const chemin = url.pathname

  if (chemin === '/sanctum/csrf-cookie') {
    document.cookie = 'XSRF-TOKEN=jeton-mock; path=/; SameSite=Lax'
    return json(204)
  }

  if (chemin.startsWith('/api/v1/audio/manifeste/')) {
    const langue = chemin.split('/').pop() as LangueAudio
    if (!(langue in FREQUENCES)) return json(404, { message: 'Langue inconnue' })
    return json(200, manifeste(langue))
  }

  if (chemin.startsWith('/r/')) {
    const jeton = decodeURIComponent(chemin.slice(3))
    const vente = etat.ventes.find((v) => v.ulid === etat.recus[jeton])
    if (!vente || vente.statut !== 'payee') return json(404, { message: 'Reçu introuvable' })
    const recu: RecuPublic = {
      numero: vente.numero,
      montant_xof: vente.montant_xof,
      montant_sats: vente.montant_sats_reussi,
      methode: vente.methode_reussie ?? 'lightning',
      operateur: vente.operateur_reussi,
      statut: 'payee',
      paye_le: vente.payee_le ?? vente.cree_le,
      boutique: { nom: etat.boutique.nom, ville: etat.boutique.ville },
      message: etat.boutique.reglages.message_recu,
    }
    return json(200, recu)
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
    reinitialiserDeuxFa(compte)
    ecrireSession(compte)
    return json(200, { utilisateur: lireSession() })
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
      ulid: ulid('01U'),
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
  const contexte: ContexteMock = {
    url,
    route,
    methode,
    init,
    session,
    ventes: () => etat.ventes,
    articles: () => etat.articles,
    ajouterArticle: (a) => {
      const article: Article = { ...a, ulid: ulid('01A'), position: etat.articles.length }
      etat.articles.push(article)
      return article
    },
    membres: () =>
      etat.membres.map((mb) => {
        const compte = Object.values(COMPTES).find((c) => c.ulid === mb.ulid)
        return { ulid: mb.ulid, nom: compte?.nom ?? '—', contact: compte?.email ?? compte?.telephone ?? '', role: mb.role }
      }),
    ecrireSession,
    boutiqueDemo: { ulid: BOUTIQUE_DEMO.ulid, nom: etat.boutique.nom, ville: etat.boutique.ville },
    motDePasse: MOT_DE_PASSE,
    bip,
  }
  const publique = repondreV3Public(contexte)
  if (publique) return publique

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

  // ----- Vague 3 : 2FA, console, studio, recherche, import, invitation -----
  const v3 = await repondreV3(contexte)
  if (v3) return v3

  // ----- Cours -----
  if (route === '/cours') {
    if (coursIndisponible()) return json(200, { disponible: false, btc_xof: null, recupere_le: null, age_s: null, sources: 0 })
    const age = Math.floor((Date.now() % MINUTE) / 1000)
    return json(200, { disponible: true, btc_xof: coursActuel(), recupere_le: ISO(Date.now() - age * 1000), age_s: age, sources: 3 })
  }

  // ----- Boutique (création : démarrage guidé, étape 1) -----
  if (route === '/boutique' && methode === 'POST') {
    if (session.boutique) return json(422, { message: 'Vous avez déjà une boutique.' })
    const corps = await lireJson(init)
    const errors: Record<string, string[]> = {}
    if (!corps.nom || String(corps.nom).trim().length < 2) errors.nom = ['Le nom est obligatoire.']
    if (!corps.ville) errors.ville = ['La ville est obligatoire.']
    if (Object.keys(errors).length) return json(422, { message: 'Les données sont invalides.', errors })
    etat = creerEtatInitial()
    etat.ventes = []
    etat.transactions = []
    etat.recus = {}
    etat.sequence = 0
    etat.articles = []
    etat.invitations = []
    etat.wallet.connecte = false
    etat.boutique = {
      ...etat.boutique,
      ulid: ulid('01B'),
      nom: String(corps.nom).trim(),
      telephone: corps.telephone ? String(corps.telephone) : null,
      ville: String(corps.ville),
      configuration: { wallet: false, paytech: false, paiement_test: false },
      paytech: { configure: false, environnement: 'test' },
      reglages: { ...etat.boutique.reglages, wave_lien: null, moyens: { lightning: true, paytech: false, wave_manuel: false } },
    }
    etat.membres = [{ ulid: session.ulid, role: 'proprietaire', actif: true, derniere_connexion_le: ISO(Date.now()) }]
    const utilisateur: Utilisateur = {
      ...session,
      boutique: { ulid: etat.boutique.ulid, nom: etat.boutique.nom, ville: etat.boutique.ville, devise: 'XOF', role: 'proprietaire', configuration: { ...etat.boutique.configuration } },
    }
    ecrireSession(utilisateur)
    return json(201, { boutique: etat.boutique, utilisateur })
  }

  if (!session.boutique) return json(403, { message: 'Aucune boutique.' })
  const moi = session.ulid

  if (route === '/boutique' && methode === 'GET') return json(200, { boutique: etat.boutique })

  if (route === '/boutique' && methode === 'PATCH') {
    if (!estGestion(session)) return interdit()
    const corps = await lireJson(init)
    const errors: Record<string, string[]> = {}
    if (corps.nom !== undefined && String(corps.nom).trim().length < 2) errors.nom = ['Le nom est obligatoire.']
    const reglages = (corps.reglages ?? {}) as Partial<BoutiqueDetail['reglages']>
    if (reglages.expiration_facture_min !== undefined && (reglages.expiration_facture_min < 2 || reglages.expiration_facture_min > 15)) errors['reglages.expiration_facture_min'] = ['Entre 2 et 15 minutes.']
    if (reglages.montant_max_xof !== undefined && reglages.montant_max_xof < 100) errors['reglages.montant_max_xof'] = ['100 FCFA minimum.']
    if (reglages.wave_lien && !/^https:\/\/pay\.wave\.com\//.test(reglages.wave_lien)) errors['reglages.wave_lien'] = ['Le lien doit commencer par https://pay.wave.com/.']
    if (Object.keys(errors).length) return json(422, { message: 'Les données sont invalides.', errors })
    if (corps.nom !== undefined) etat.boutique.nom = String(corps.nom).trim()
    if (corps.telephone !== undefined) etat.boutique.telephone = corps.telephone ? String(corps.telephone) : null
    if (corps.ville !== undefined) etat.boutique.ville = String(corps.ville)
    etat.boutique.reglages = { ...etat.boutique.reglages, ...reglages, moyens: { ...etat.boutique.reglages.moyens, ...(reglages.moyens ?? {}) } }
    if (corps.paiement_test === true) etat.boutique.configuration.paiement_test = true
    signaler(['parametres'], moi)
    return json(200, { boutique: etat.boutique })
  }

  if (route === '/boutique/paytech') {
    if (!estProprietaire(session)) return interdit()
    if (methode === 'PUT') {
      const corps = await lireJson(init)
      const deja = etat.boutique.paytech.configure
      if (!deja && (!corps.api_key || !corps.api_secret)) {
        return json(422, { message: 'Les données sont invalides.', errors: { api_key: ['La clé API est obligatoire.'], api_secret: ['Le secret est obligatoire.'] } })
      }
      etat.boutique.paytech = { configure: true, environnement: corps.environnement === 'prod' ? 'prod' : 'test' }
      etat.boutique.configuration.paytech = true
      etat.boutique.reglages.moyens.paytech = true
      signaler(['parametres'], moi)
      return json(200, etat.boutique.paytech)
    }
    if (methode === 'DELETE') {
      etat.boutique.paytech = { configure: false, environnement: 'test' }
      etat.boutique.configuration.paytech = false
      etat.boutique.reglages.moyens.paytech = false
      signaler(['parametres'], moi)
      return json(204)
    }
  }
  if (route === '/boutique/paytech/verifier' && methode === 'POST') {
    if (!estProprietaire(session)) return interdit()
    await attendre(600)
    return etat.boutique.paytech.configure
      ? json(200, { ok: true, message: 'PayTech répond : demande de paiement de 100 FCFA acceptée (test).' })
      : json(200, { ok: false, message: 'Aucune clé PayTech enregistrée.' })
  }

  // ----- Portefeuille -----
  if (route === '/boutique/wallet') {
    if (!estProprietaire(session)) return interdit()
    if (methode === 'PUT') {
      const corps = await lireJson(init)
      const uri = String(corps.uri ?? '')
      if (!uri.startsWith('nostr+walletconnect://')) return json(422, { message: 'Les données sont invalides.', errors: { uri: ['Le lien doit commencer par nostr+walletconnect://'] } })
      await attendre(700)
      etat.wallet.connecte = true
      etat.wallet.verifie_le = ISO(Date.now())
      etat.boutique.configuration.wallet = true
      signaler(['wallet', 'parametres'], moi)
      const w = walletPublic()
      return json(200, { connecte: w.connecte, alias: w.alias, lud16: w.lud16, permissions: w.permissions, budget_sats: w.budget_sats })
    }
    if (methode === 'DELETE') {
      etat.wallet.connecte = false
      etat.boutique.configuration.wallet = false
      signaler(['wallet', 'parametres'], moi)
      return json(204)
    }
  }

  if (route.startsWith('/wallet')) {
    if (!estGestion(session)) return interdit()
    if (route === '/wallet' && methode === 'GET') return json(200, walletPublic())
    if (route === '/wallet/transactions') {
      const limite = Math.min(50, Number(url.searchParams.get('limite') ?? 30))
      const decalage = Number(url.searchParams.get('decalage') ?? 0)
      return json(200, { transactions: etat.transactions.slice(decalage, decalage + limite) })
    }
    if (!etat.wallet.connecte) return json(503, { message: 'Votre portefeuille ne répond pas.', code: 'WALLET_INJOIGNABLE' })
    if (route === '/wallet/recevoir' && methode === 'POST') {
      const corps = await lireJson(init)
      const cours = coursActuel()
      const sats = corps.montant_sats ? Number(corps.montant_sats) : enSats(Number(corps.montant_xof ?? 0), cours)
      if (!(sats > 0)) return json(422, { message: 'Les données sont invalides.', errors: { montant: ['Indiquez un montant.'] } })
      const id = ulid('01R')
      return json(200, { bolt11: fauxBolt11(sats, id), montant_sats: sats, montant_xof: Math.ceil((sats * cours) / SATS_PAR_BTC), expire_le: ISO(Date.now() + 10 * MINUTE) })
    }
    if (route === '/wallet/envoyer/apercu' && methode === 'POST') {
      const corps = await lireJson(init)
      const destination = String(corps.destination ?? '').trim()
      const cours = coursActuel()
      await attendre(400)
      if (/^lnbc\d+/i.test(destination)) {
        const n = Number(/^lnbc(\d+)/i.exec(destination)?.[1] ?? 0)
        const sats = Math.max(1, Math.round(n / 10))
        return json(200, { type: 'bolt11', montant_sats: sats, montant_xof: Math.ceil((sats * cours) / SATS_PAR_BTC), destinataire: `${destination.slice(0, 14)}…${destination.slice(-6)}`, description: 'Facture Lightning' })
      }
      if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(destination)) {
        const sats = corps.montant_sats ? Number(corps.montant_sats) : null
        return json(200, { type: 'adresse', montant_sats: sats, montant_xof: sats ? Math.ceil((sats * cours) / SATS_PAR_BTC) : null, destinataire: destination, description: null, min_sats: 1, max_sats: 1_000_000 })
      }
      if (/^lnurl1/i.test(destination)) {
        const sats = corps.montant_sats ? Number(corps.montant_sats) : null
        return json(200, { type: 'lnurl', montant_sats: sats, montant_xof: sats ? Math.ceil((sats * cours) / SATS_PAR_BTC) : null, destinataire: `${destination.slice(0, 12)}…`, description: null, min_sats: 10, max_sats: 500_000 })
      }
      return json(422, { message: "Cette destination n'est pas reconnue.", code: 'DESTINATION_INVALIDE' })
    }
    if (route === '/wallet/envoyer' && methode === 'POST') {
      if (!estProprietaire(session)) return interdit()
      const corps = await lireJson(init)
      if (corps.password !== MOT_DE_PASSE) return json(422, { message: 'Mot de passe incorrect.', code: 'MOT_DE_PASSE_INCORRECT', errors: { password: ['Mot de passe incorrect.'] } })
      const destination = String(corps.destination ?? '')
      const sats = corps.montant_sats ? Number(corps.montant_sats) : Math.max(1, Math.round(Number(/^lnbc(\d+)/i.exec(destination)?.[1] ?? 0) / 10))
      if (!(sats > 0)) return json(422, { message: "Cette destination n'est pas reconnue.", code: 'DESTINATION_INVALIDE' })
      if (sats > etat.wallet.solde_sats) return json(422, { message: 'Solde insuffisant.', code: 'SOLDE_INSUFFISANT', manque_sats: sats - etat.wallet.solde_sats })
      if (sats > etat.wallet.budget_sats) return json(422, { message: "Limite d'envoi atteinte.", code: 'BUDGET_DEPASSE' })
      await attendre(900)
      const frais = Math.max(1, Math.round(sats * 0.003))
      etat.wallet.solde_sats -= sats + frais
      etat.wallet.budget_sats -= sats
      etat.transactions.unshift({ type: 'sortante', statut: 'reglee', montant_sats: sats, frais_sats: frais, description: /@/.test(destination) ? destination : 'Facture Lightning', regle_le: ISO(Date.now()), cree_le: ISO(Date.now()) })
      signaler(['wallet'], moi)
      return json(200, { payment_hash_abrege: ulid('01H').slice(-8).toLowerCase(), montant_sats: sats, frais_sats: frais })
    }
  }

  // ----- Caisse et paiements -----
  appliquerExpirations()

  if (route === '/ventes' && methode === 'POST') {
    const corps = await lireJson(init)
    const montant = Number(corps.montant_xof)
    const max = etat.boutique.reglages.montant_max_xof
    if (!Number.isInteger(montant) || montant < 100 || montant > max) {
      return json(422, { message: `Le montant doit être entre 100 et ${max} FCFA.`, code: 'MONTANT_HORS_BORNES', errors: { montant_xof: [`Entre 100 et ${max} FCFA.`] } })
    }
    const lignes = Array.isArray(corps.lignes) ? (corps.lignes as Vente['lignes']) : []
    if (lignes.length && lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire_xof, 0) !== montant) {
      return json(422, { message: 'Le montant ne correspond pas aux lignes.', errors: { montant_xof: ['Le montant doit égaler la somme des lignes.'] } })
    }
    etat.sequence += 1
    const vente: Vente = {
      ulid: ulid('01V'),
      numero: `V-${String(etat.sequence).padStart(6, '0')}`,
      montant_xof: montant,
      statut: 'en_attente',
      methode_reussie: null,
      operateur_reussi: null,
      methode_en_cours: corps.methode as MethodePaiement,
      montant_sats_reussi: null,
      caissier: { ulid: moi, nom: session.nom },
      note: corps.note ? String(corps.note).slice(0, 120) : null,
      alerte: null,
      cree_le: ISO(Date.now()),
      payee_le: null,
      lignes: lignes.map((l) => ({ libelle: l.libelle, quantite: l.quantite, prix_unitaire_xof: l.prix_unitaire_xof, article_ulid: l.article_ulid ?? null })),
      paiements: [],
      paiement_reussi: null,
      recu_url: null,
    }
    const tentative = creerTentative(vente, corps.methode as MethodePaiement, corps.operateur as Operateur | undefined)
    if ('erreur' in tentative) return tentative.erreur
    etat.ventes.push(vente)
    signaler(['ventes', 'paiements'], moi)
    return json(201, { vente })
  }

  let m = /^\/ventes\/([^/]+)\/paiements$/.exec(route)
  if (m && methode === 'POST') {
    const vente = etat.ventes.find((v) => v.ulid === m![1])
    if (!vente) return json(404, { message: 'Vente introuvable.' })
    if (vente.statut === 'payee') return json(409, { message: 'Cette vente est déjà payée.', code: 'VENTE_DEJA_PAYEE' })
    if (vente.statut === 'annulee') return json(409, { message: 'Cette vente est annulée.', code: 'VENTE_ANNULEE' })
    const corps = await lireJson(init)
    const tentative = creerTentative(vente, corps.methode as MethodePaiement, corps.operateur as Operateur | undefined)
    if ('erreur' in tentative) return tentative.erreur
    vente.statut = 'en_attente'
    signaler(['paiements'], moi)
    return json(201, { paiement: tentative })
  }

  m = /^\/ventes\/([^/]+)\/annuler$/.exec(route)
  if (m && methode === 'POST') {
    const vente = etat.ventes.find((v) => v.ulid === m![1])
    if (!vente) return json(404, { message: 'Vente introuvable.' })
    if (!estGestion(session) && vente.caissier.ulid !== moi) return interdit()
    if (vente.statut !== 'en_attente') return json(409, { message: "Cette vente n'est plus en attente.", code: 'VENTE_NON_ANNULABLE' })
    vente.statut = 'annulee'
    for (const p of vente.paiements) if (p.statut === 'en_attente') p.statut = 'annule'
    signaler(['ventes', 'paiements'], moi)
    return json(200, { vente })
  }

  m = /^\/ventes\/([^/]+)$/.exec(route)
  if (m && methode === 'GET') {
    const vente = etat.ventes.find((v) => v.ulid === m![1])
    if (!vente) return json(404, { message: 'Vente introuvable.' })
    if (!estGestion(session) && vente.caissier.ulid !== moi) return interdit()
    return json(200, { vente })
  }

  if (route === '/ventes' && methode === 'GET') {
    const liste = filtrerVentes(url.searchParams, session)
    const limite = Math.min(100, Number(url.searchParams.get('limite') ?? 30))
    const curseur = Number(url.searchParams.get('curseur') ?? 0) || 0
    const page = liste.slice(curseur, curseur + limite)
    const payees = liste.filter((v) => v.statut === 'payee')
    return json(200, {
      ventes: page.map(courte),
      curseur_suivant: curseur + limite < liste.length ? String(curseur + limite) : null,
      totaux: { nombre: liste.length, montant_xof: liste.reduce((s, v) => s + v.montant_xof, 0), payees_xof: payees.reduce((s, v) => s + v.montant_xof, 0) },
    })
  }

  if (route === '/exports/ventes' || route === '/exports/articles') {
    if (!estGestion(session)) return interdit()
    const format = url.searchParams.get('format') ?? 'csv'
    const ventes = route === '/exports/ventes'
    if (!(ventes ? ['csv', 'xlsx', 'pdf'] : ['csv', 'xlsx']).includes(format)) return json(422, { message: 'Format inconnu.', errors: { format: ['Format inconnu.'] } })
    const csv = ventes
      ? csvVentes(filtrerVentes(url.searchParams, session))
      : `\uFEFFNom;Prix (FCFA);Catégorie;Référence;Actif\n${etat.articles.map((a) => [a.nom, a.prix_xof, a.categorie ?? '', a.sku ?? '', a.actif ? 'oui' : 'non'].join(';')).join('\n')}\n`
    const types: Record<string, string> = { csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' }
    // Excel / PDF simulés : le contenu reste le CSV (le vrai fichier est produit par le back).
    return new Response(format === 'pdf' ? `%PDF-1.4\n% SatsPoint (mock)\n${csv}` : csv, { status: 200, headers: { 'Content-Type': types[format]!, 'Content-Disposition': `attachment; filename="${ventes ? 'ventes' : 'articles'}.${format}"` } })
  }

  m = /^\/paiements\/([^/]+)(?:\/(verifier|simuler|confirmer-manuellement))?$/.exec(route)
  if (m) {
    const trouve = trouverPaiement(m[1]!)
    if (!trouve) return json(404, { message: 'Paiement introuvable.' })
    const { vente, paiement } = trouve
    if (!estGestion(session) && vente.caissier.ulid !== moi) return interdit()
    const action = m[2]
    const reponse = () => json(200, { paiement, vente: { ulid: vente.ulid, statut: vente.statut, numero: vente.numero } })
    if (!action && methode === 'GET') return reponse()
    if (action === 'verifier' && methode === 'POST') {
      await attendre(500)
      return reponse()
    }
    if (action === 'simuler' && methode === 'POST') {
      if (!paiement.simule) return json(404, { message: 'Paiement introuvable.' })
      if (paiement.statut !== 'en_attente') return json(409, { message: "Cette demande de paiement n'est plus en attente.", code: 'PAIEMENT_TERMINE' })
      // Le « client » paie : règlement constaté côté serveur, puis signal temps réel (auteur inconnu).
      regler(vente, paiement)
      signaler(['paiements', 'ventes', 'wallet'], null, 400)
      return json(200, { paiement })
    }
    if (action === 'confirmer-manuellement' && methode === 'POST') {
      if (!estGestion(session)) return interdit()
      if (paiement.methode !== 'wave_manuel') return json(422, { message: 'Seul un paiement Wave direct se confirme à la main.', code: 'CONFIRMATION_IMPOSSIBLE' })
      if (paiement.statut !== 'en_attente') return json(409, { message: "Cette demande de paiement n'est plus en attente.", code: 'PAIEMENT_TERMINE' })
      regler(vente, paiement)
      signaler(['paiements', 'ventes'], moi)
      return json(200, { paiement, vente })
    }
  }

  // ----- Tableau de bord -----
  if (route === '/tableau-de-bord') return json(200, tableauDeBord(url.searchParams.get('periode') ?? 'aujourdhui', session))

  // ----- Articles -----
  if (route === '/articles' && methode === 'GET') return json(200, { articles: etat.articles })
  if (route.startsWith('/articles')) {
    if (!estGestion(session)) return interdit()
    if (route === '/articles' && methode === 'POST') {
      const corps = await lireJson(init)
      if (!corps.nom || !(Number(corps.prix_xof) > 0)) return json(422, { message: 'Les données sont invalides.', errors: { nom: corps.nom ? [] : ['Le nom est obligatoire.'], prix_xof: Number(corps.prix_xof) > 0 ? [] : ['Indiquez un prix.'] } })
      const article: Article = {
        ulid: ulid('01A'),
        nom: String(corps.nom),
        prix_xof: Number(corps.prix_xof),
        categorie: corps.categorie ? String(corps.categorie) : null,
        couleur: String(corps.couleur ?? 'orange'),
        sku: corps.sku ? String(corps.sku) : null,
        actif: corps.actif !== false,
        position: etat.articles.length,
      }
      etat.articles.push(article)
      signaler(['articles'], moi)
      return json(201, { article })
    }
    if (route === '/articles/ordre' && methode === 'POST') {
      const corps = await lireJson(init)
      const ordre = (corps.ulids as string[]) ?? []
      for (const a of etat.articles) {
        const i = ordre.indexOf(a.ulid)
        if (i >= 0) a.position = i
      }
      etat.articles.sort((a, b) => a.position - b.position)
      signaler(['articles'], moi)
      return json(204)
    }
    m = /^\/articles\/([^/]+)$/.exec(route)
    if (m) {
      const article = etat.articles.find((a) => a.ulid === m![1])
      if (!article) return json(404, { message: 'Article introuvable.' })
      if (methode === 'PATCH') {
        const corps = await lireJson(init)
        Object.assign(article, corps)
        signaler(['articles'], moi)
        return json(200, { article })
      }
      if (methode === 'DELETE') {
        etat.articles = etat.articles.filter((a) => a !== article)
        signaler(['articles'], moi)
        return json(204)
      }
    }
  }

  // ----- Équipe -----
  if (route.startsWith('/equipe')) {
    if (!estGestion(session)) return interdit()
    const equipe = (): Equipe => ({
      membres: etat.membres.map((mb) => {
        const compte = Object.values(COMPTES).find((c) => c.ulid === mb.ulid) ?? session
        return { ulid: mb.ulid, nom: compte.nom, contact: compte.email ?? compte.telephone ?? '', role: mb.role, actif: mb.actif, derniere_connexion_le: mb.derniere_connexion_le, est_moi: mb.ulid === moi }
      }),
      invitations: etat.invitations,
    })
    if (route === '/equipe' && methode === 'GET') return json(200, equipe())
    if (route === '/equipe/invitations' && methode === 'POST') {
      const corps = await lireJson(init)
      const contact = String(corps.contact ?? '').trim()
      const role = corps.role as RoleBoutique
      if (!contact) return json(422, { message: 'Les données sont invalides.', errors: { contact: ['Indiquez un téléphone ou un e-mail.'] } })
      if (!['gerant', 'caissier', 'proprietaire'].includes(role)) return json(422, { message: 'Les données sont invalides.', errors: { role: ['Rôle inconnu.'] } })
      if (role === 'proprietaire' && !estProprietaire(session)) return interdit()
      const invitation: Invitation = { ulid: ulid('01I'), contact, role, expire_le: ISO(Date.now() + 72 * 60 * MINUTE) }
      etat.invitations.push(invitation)
      signaler(['equipe'], moi)
      return json(201, { invitation })
    }
    m = /^\/equipe\/invitations\/([^/]+)$/.exec(route)
    if (m && methode === 'DELETE') {
      etat.invitations = etat.invitations.filter((i) => i.ulid !== m![1])
      signaler(['equipe'], moi)
      return json(204)
    }
    m = /^\/equipe\/([^/]+)$/.exec(route)
    if (m) {
      const membre = etat.membres.find((mb) => mb.ulid === m![1])
      if (!membre) return json(404, { message: 'Membre introuvable.' })
      if (membre.role === 'proprietaire' && !estProprietaire(session)) return interdit()
      const proprietairesActifs = etat.membres.filter((mb) => mb.role === 'proprietaire' && mb.actif).length
      if (methode === 'PATCH') {
        const corps = await lireJson(init)
        if (membre.role === 'proprietaire' && proprietairesActifs === 1 && (corps.actif === false || (corps.role && corps.role !== 'proprietaire'))) {
          return json(422, { message: 'La boutique doit garder au moins un propriétaire.', code: 'DERNIER_PROPRIETAIRE' })
        }
        if (corps.role) membre.role = corps.role as RoleBoutique
        if (typeof corps.actif === 'boolean') membre.actif = corps.actif
        signaler(['equipe'], moi)
        return json(200, { membre: equipe().membres.find((mb) => mb.ulid === membre.ulid) })
      }
      if (methode === 'DELETE') {
        if (membre.role === 'proprietaire' && proprietairesActifs === 1) return json(422, { message: 'La boutique doit garder au moins un propriétaire.', code: 'DERNIER_PROPRIETAIRE' })
        etat.membres = etat.membres.filter((mb) => mb !== membre)
        signaler(['equipe'], moi)
        return json(204)
      }
    }
  }

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
