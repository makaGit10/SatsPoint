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
