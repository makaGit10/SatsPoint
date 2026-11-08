/** Types du contrat API `/api/v1` (voir web/README.md et docs/CAHIER_DES_CHARGES.md § 11). */

export type LangueAudio = 'wo' | 'srr' | 'ff' | 'dyo' | 'fr'
export type Theme = 'clair' | 'sombre' | 'auto'
export type LocaleInterface = 'fr' | 'en'
export type RoleBoutique = 'proprietaire' | 'gerant' | 'caissier'
export type RolePlateforme = 'super_admin' | null

export interface LangueAudioDecrite {
  code: LangueAudio
  nom: string
  nom_local: string
}

export interface Config {
  app: { nom: string; env: string; demo: boolean; version: string }
  reverb: { cle: string; hote: string; port: number; schema: 'http' | 'https' }
  locales: LocaleInterface[]
  langues_audio: LangueAudioDecrite[]
}

export interface Preferences {
  locale: LocaleInterface
  langue_audio: LangueAudio | null
  theme: Theme
  aide_vocale: boolean
}

export interface ConfigurationBoutique {
  wallet: boolean
  paytech: boolean
  paiement_test: boolean
}

export interface Boutique {
  ulid: string
  nom: string
  ville: string
  devise: 'XOF'
  role: RoleBoutique
  configuration: ConfigurationBoutique
}

export interface Utilisateur {
  ulid: string
  nom: string
  email: string | null
  telephone: string | null
  role_plateforme: RolePlateforme
  preferences: Preferences
  boutique: Boutique | null
  /** Double authentification (vague 3) ; absente des anciennes réponses = inactive. */
  deux_fa?: EtatDeuxFa
}

export interface EtatDeuxFa {
  active: boolean
  /** Obligatoire pour ce compte (super-admin). */
  requise: boolean
  /** Validée pour la session en cours. */
  validee: boolean
}

export interface ReponseUtilisateur {
  utilisateur: Utilisateur
}

export interface ManifesteAudio {
  langue: LangueAudio
  version: string | number
  audios: Record<string, string>
}

export interface CorpsErreur {
  message: string
  code?: string
  errors?: Record<string, string[]>
}

export interface DonneesInscription {
  nom: string
  identifiant: string
  password: string
  password_confirmation: string
  locale?: LocaleInterface
}

export interface DonneesConnexion {
  identifiant: string
  password: string
  se_souvenir?: boolean
}

export interface DonneesReinitialisation {
  jeton: string
  identifiant: string
  password: string
  password_confirmation: string
}

/** Signal temps réel (jamais de donnée métier). */
export interface SignalDonnees {
  rubrique: string
  auteur: string | null
  horodatage: string
}

// ---------------------------------------------------------------------------
// Vague 2 — contrat `docs/CONTRAT_API.md` (caisse, paiements, ventes, tableau de bord, portefeuille, réglages, équipe)
// ---------------------------------------------------------------------------

export type MethodePaiement = 'lightning' | 'paytech' | 'wave_manuel'
export type Operateur = 'wave' | 'orange_money' | 'free_money'
export type StatutPaiement = 'en_attente' | 'reussi' | 'expire' | 'echoue' | 'annule'
export type StatutVente = 'en_attente' | 'payee' | 'annulee' | 'expiree'
export type AlerteVente = 'trop_percu' | 'payee_apres_annulation'
export type Periode = 'aujourdhui' | 'hier' | '7j' | '30j' | 'perso'

export interface Paiement {
  ulid: string
  methode: MethodePaiement
  operateur: Operateur | null
  statut: StatutPaiement
  montant_xof: number
  montant_sats: number | null
  cours_xof_par_btc: number | null
  bolt11: string | null
  payment_hash_abrege: string | null
  paytech: { redirect_url: string; token: string } | null
  wave_lien: string | null
  simule: boolean
  cree_le: string
  expire_le: string | null
  regle_le: string | null
}

export interface VenteCourte {
  ulid: string
  numero: string
  montant_xof: number
  statut: StatutVente
  methode_reussie: MethodePaiement | null
  operateur_reussi: Operateur | null
  /** Méthode de la tentative encore en attente (icône dans la liste tant que la vente n'est pas payée). */
  methode_en_cours: MethodePaiement | null
  montant_sats_reussi: number | null
  caissier: { ulid: string; nom: string }
  note: string | null
  alerte: AlerteVente | null
  cree_le: string
  payee_le: string | null
}

export interface LigneVente {
  libelle: string
  quantite: number
  prix_unitaire_xof: number
  article_ulid: string | null
}

export interface Vente extends VenteCourte {
  lignes: LigneVente[]
  paiements: Paiement[]
  paiement_reussi: Paiement | null
  recu_url: string | null
}

export interface Cours {
  disponible: boolean
  btc_xof: number | null
  recupere_le: string | null
  age_s: number | null
  sources: number
}

export interface CorpsCreationVente {
  montant_xof: number
  note?: string
  lignes?: Array<{ article_ulid?: string; libelle: string; quantite: number; prix_unitaire_xof: number }>
  methode: MethodePaiement
  operateur?: Operateur
}

export interface ReponsePaiement {
  paiement: Paiement
  vente: { ulid: string; statut: StatutVente; numero: string }
}

export interface FiltresVentes {
  periode?: Periode
  du?: string
  au?: string
  statut?: StatutVente
  methode?: MethodePaiement
  caissier?: string
  q?: string
  limite?: number
}

export interface PageVentes {
  ventes: VenteCourte[]
  curseur_suivant: string | null
  totaux: { nombre: number; montant_xof: number; payees_xof: number }
}

export interface RecuPublic {
  numero: string
  montant_xof: number
  montant_sats: number | null
  methode: MethodePaiement
  operateur: Operateur | null
  statut: 'payee'
  paye_le: string
  boutique: { nom: string; ville: string }
  message: string | null
}

export interface TableauDeBord {
  periode: Exclude<Periode, 'perso'>
  du: string
  au: string
  chiffre_affaires_xof: number
  nombre_ventes: number
  panier_moyen_xof: number
  repartition: {
    lightning: { nombre: number; montant_xof: number }
    mobile_money: { nombre: number; montant_xof: number }
  }
  comparaison_pct: number | null
  serie: Array<{ jour: string; montant_xof: number; nombre: number }>
  dernieres_ventes: VenteCourte[]
}

export interface Wallet {
  connecte: boolean
  alias: string | null
  lud16: string | null
  permissions: string[]
  budget_sats: number | null
  verifie_le: string | null
  solde: { sats: number; xof: number; cours_xof_par_btc: number } | null
}

export interface TransactionWallet {
  type: 'entrante' | 'sortante'
  statut: string
  montant_sats: number
  frais_sats: number
  description: string | null
  regle_le: string | null
  cree_le: string
}

export interface ReponseRecevoir {
  bolt11: string
  montant_sats: number
  montant_xof: number
  expire_le: string
}

export interface ApercuEnvoi {
  type: 'bolt11' | 'adresse' | 'lnurl'
  montant_sats: number | null
  montant_xof: number | null
  destinataire: string
  description: string | null
  min_sats?: number
  max_sats?: number
}

export interface ResultatEnvoi {
  payment_hash_abrege: string
  montant_sats: number
  frais_sats: number
}

export interface ReglagesBoutique {
  expiration_facture_min: number
  montant_max_xof: number
  moyens: { lightning: boolean; paytech: boolean; wave_manuel: boolean }
  message_recu: string | null
  wave_lien: string | null
}

export interface BoutiqueDetail {
  ulid: string
  nom: string
  telephone: string | null
  ville: string
  devise: 'XOF'
  reglages: ReglagesBoutique
  configuration: ConfigurationBoutique
  paytech: { configure: boolean; environnement: 'test' | 'prod' }
}

export interface Article {
  ulid: string
  nom: string
  prix_xof: number
  categorie: string | null
  couleur: string
  sku: string | null
  actif: boolean
  position: number
}

export interface Membre {
  ulid: string
  nom: string
  contact: string
  role: RoleBoutique
  actif: boolean
  derniere_connexion_le: string | null
  est_moi: boolean
}

export interface Invitation {
  ulid: string
  contact: string
  role: RoleBoutique
  expire_le: string
  /** Lien complet, renvoyé seulement à la création d'une invitation par téléphone (aucun SMS envoyé : le responsable le transmet). */
  lien?: string
}

export interface Equipe {
  membres: Membre[]
  invitations: Invitation[]
}

// ---------------------------------------------------------------------------
// Vague 3 — contrat `docs/CONTRAT_API.md` § V3 (studio audio, 2FA, console, recherche, import / export, invitation)
// ---------------------------------------------------------------------------

export type StatutAudio = 'publie' | 'brouillon' | 'en_traitement' | 'erreur' | 'manquant'

export interface EtatCleAudio {
  statut: StatutAudio
  id?: number
  url?: string | null
  duree_ms?: number | null
  mis_a_jour_le?: string | null
  erreur?: string | null
  /** Une version publiée existe et une nouvelle est en préparation (précision back V3.9). */
  nouvelle_version?: { statut: StatutAudio; id: number; url?: string | null; duree_ms?: number | null; mis_a_jour_le?: string | null } | null
  /** URL de la version publiée quand une nouvelle version est affichée (normalisé par le front). */
  url_publiee?: string | null
}

export interface CleAudio {
  cle: string
  ecran: string
  contexte: string
  texte_fr: string
  texte_en: string
  essentielle: boolean
  ordre: number
  etats: Partial<Record<LangueAudio, EtatCleAudio>>
}

export interface CouvertureLangue {
  publies: number
  brouillons: number
  manquants: number
  total: number
  essentielles_manquantes: number
  pct?: number
}

export interface MatriceAudio {
  langues: Array<{ code: LangueAudio; nom: string }>
  ecrans: string[]
  couverture: Partial<Record<LangueAudio, CouvertureLangue>>
  cles: CleAudio[]
}

export interface AudioStudio {
  id: number
  cle: string
  langue: LangueAudio
  statut: StatutAudio
  duree_ms?: number | null
  url_ecoute?: string | null
  erreur?: string | null
}

export interface InitialisationDeuxFa {
  secret: string
  otpauth_url: string
  qr_svg?: string
}

export interface BoutiqueAdmin {
  ulid: string
  nom: string
  ville: string
  statut: 'active' | 'suspendue'
  cree_le: string
  proprietaire: { nom: string; contact: string } | null
  configuration: ConfigurationBoutique
  activite: { ventes_7j: number; derniere_vente_le: string | null }
}

export interface PageBoutiquesAdmin {
  boutiques: BoutiqueAdmin[]
  curseur_suivant: string | null
}

export interface SanteAdmin {
  statut?: 'ok' | 'degrade' | 'indisponible'
  base: boolean
  redis: boolean
  reverb: boolean
  passerelle: boolean
  cours: { age_s: number | null; disponible: boolean; sources?: number | null }
  /** `en_attente` : total, ou détail par file. */
  files: { en_attente: number | Record<string, number | null> | null; echouees: number | null; echouees_24h?: number | null }
  audio: { fichiers: number | null; octets: number | null; publies?: number | null }
  version?: string | null
  horodatage?: string
}

export interface EntreeJournal {
  id: number | string
  action: string
  utilisateur: { ulid: string; nom: string } | null
  boutique: { ulid: string; nom: string } | null
  ip: string | null
  details: Record<string, unknown> | string | null
  cree_le: string
}

export interface PageJournal {
  entrees: EntreeJournal[]
  curseur_suivant: string | null
}

export interface StatistiquesAdmin {
  commercants_actifs_semaine: number
  paiements_par_commercant_semaine: number
  delai_median_confirmation_ms: number | null
  part_sats_pct: number
  part_mobile_money_pct: number
  couverture_audio: Partial<Record<LangueAudio, number>>
  boutiques?: { total: number; actives: number; nouvelles_7j: number }
}

export type RubriqueRecherche = 'ventes' | 'articles' | 'equipe' | 'pages'

export interface ResultatRecherche {
  titre: string
  sous_titre: string | null
  url: string
  score: number
}

export interface GroupeRecherche {
  rubrique: RubriqueRecherche
  resultats: ResultatRecherche[]
}

export type ChampImport = 'nom' | 'prix_xof' | 'categorie' | 'sku' | 'couleur' | 'actif'
export type Correspondance = Record<string, ChampImport | null>
export type ModeImport = 'creer' | 'creer_et_mettre_a_jour' | 'ignorer_erreurs'

export interface ImportAnalyse {
  ulid: string
  colonnes: string[]
  apercu: string[][]
  suggestions: Correspondance
  /** Nombre de lignes de données du fichier (ajout front vague 3 ; `total` côté back). */
  total_lignes?: number
  total?: number
}

export interface ImportEtat {
  ulid: string
  statut: 'analyse' | 'en_cours' | 'termine' | 'echoue'
  total: number
  traitees: number
  creees: number
  mises_a_jour: number
  erreurs: Array<{ ligne: number; message: string }>
  /** Total réel des lignes en erreur (`erreurs` est borné à 100). */
  lignes_en_erreur?: number
  rapport_url: string | null
}

export interface InvitationPublique {
  boutique: { nom: string }
  role: RoleBoutique
  contact_masque: string
  expire_le: string
}
