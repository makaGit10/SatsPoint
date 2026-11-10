import { lazy, type ComponentType } from 'react'
import { chargerPaquet, type NomPaquet } from '@/i18n'

/** Écran chargé à la demande avec son paquet de traductions (rien dans le JavaScript du premier écran). */
function avecPaquet<T extends ComponentType>(paquet: NomPaquet, chargeur: () => Promise<{ default: T }>) {
  return lazy(() => Promise.all([chargeur(), chargerPaquet(paquet)]).then(([m]) => m))
}

// Écrans et coquille chargés à la demande (un morceau de JavaScript par route).
export const Coquille = lazy(() => import('@/coquille/Coquille').then((m) => ({ default: m.Coquille })))
export const Langue = lazy(() => import('@/ecrans/Langue'))
export const Landing = avecPaquet('landing', () => import('@/ecrans/landing/Landing'))
export const Accueil = lazy(() => import('@/ecrans/Accueil'))
export const Connexion = lazy(() => import('@/ecrans/auth/Connexion'))
export const Inscription = lazy(() => import('@/ecrans/auth/Inscription'))
export const MotDePasseOublie = lazy(() => import('@/ecrans/auth/MotDePasseOublie'))
export const Reinitialisation = lazy(() => import('@/ecrans/auth/Reinitialisation'))
export const Caisse = lazy(() => import('@/ecrans/Caisse'))
export const Paiement = lazy(() => import('@/ecrans/paiement/Paiement'))
export const Ventes = avecPaquet('extras', () => import('@/ecrans/Ventes'))
export const TableauDeBord = avecPaquet('extras', () => import('@/ecrans/TableauDeBord'))
export const Portefeuille = avecPaquet('gestion', () => import('@/ecrans/Portefeuille'))
export const Equipe = avecPaquet('gestion', () => import('@/ecrans/Equipe'))
export const Articles = avecPaquet('extras', () => import('@/ecrans/Articles'))
export const Reglages = avecPaquet('gestion', () => import('@/ecrans/Reglages'))
export const Demarrage = avecPaquet('gestion', () => import('@/ecrans/Demarrage'))
export const Console = avecPaquet('admin', () => import('@/ecrans/admin/Console'))
export const StudioAudio = avecPaquet('admin', () => import('@/ecrans/admin/StudioAudio'))
export const DeuxFacteurs = avecPaquet('admin', () => import('@/ecrans/securite/DeuxFacteurs'))
export const VerificationDeuxFacteurs = avecPaquet('admin', () => import('@/ecrans/securite/VerificationDeuxFacteurs'))
export const Invitation = avecPaquet('extras', () => import('@/ecrans/Invitation'))
export const Recu = lazy(() => import('@/ecrans/Recu'))
export const Introuvable = lazy(() => import('@/ecrans/Introuvable'))
