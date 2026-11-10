import {
  Calculator,
  LayoutDashboard,
  Mic,
  Package,
  Receipt,
  Rocket,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { RoleBoutique, Utilisateur } from '@/api/types'
import { estSuperAdmin, roleBoutique } from '@/auth/store'

export interface ElementNavigation {
  /** Clé i18n (et clé vocale). */
  cle: string
  /** Libellé court pour la barre du bas (mobile). */
  cleCourte?: string
  chemin: string
  icone: LucideIcon
  /** Rôles de boutique autorisés (refus par défaut). */
  roles: readonly RoleBoutique[]
  /** Présent dans la barre du bas sur mobile. */
  barreBas?: boolean
}

export const NAV_BOUTIQUE: readonly ElementNavigation[] = [
  { cle: 'nav.caisse', chemin: '/caisse', icone: Calculator, roles: ['proprietaire', 'gerant', 'caissier'], barreBas: true },
  { cle: 'nav.ventes', chemin: '/ventes', icone: Receipt, roles: ['proprietaire', 'gerant', 'caissier'], barreBas: true },
  { cle: 'nav.tableau', cleCourte: 'nav.tableauCourt', chemin: '/tableau-de-bord', icone: LayoutDashboard, roles: ['proprietaire', 'gerant', 'caissier'], barreBas: true },
  { cle: 'nav.portefeuille', chemin: '/portefeuille', icone: Wallet, roles: ['proprietaire', 'gerant'], barreBas: true },
  { cle: 'nav.articles', chemin: '/articles', icone: Package, roles: ['proprietaire', 'gerant', 'caissier'] },
  { cle: 'nav.equipe', chemin: '/equipe', icone: Users, roles: ['proprietaire', 'gerant'] },
  { cle: 'nav.reglages', chemin: '/reglages', icone: Settings, roles: ['proprietaire', 'gerant'] },
  { cle: 'nav.demarrage', chemin: '/demarrage', icone: Rocket, roles: ['proprietaire'] },
]

export const NAV_ADMIN: readonly ElementNavigation[] = [
  { cle: 'nav.admin', chemin: '/admin', icone: ShieldCheck, roles: [], barreBas: true },
  { cle: 'nav.studio', chemin: '/admin/studio', icone: Mic, roles: [], barreBas: true },
]

/** Éléments visibles pour une personne donnée. */
export function navigationPour(utilisateur: Utilisateur | null): ElementNavigation[] {
  if (!utilisateur) return []
  // Super-admin : console et studio, puis SA boutique (s'il en a une) comme n'importe quel propriétaire ;
  // sans boutique, une entrée pour en créer une. Il ne voit jamais les données des autres boutiques.
  if (estSuperAdmin(utilisateur)) {
    const boutique = navigationBoutique(utilisateur).map((e) => ({ ...e, barreBas: e.barreBas && e.chemin === '/caisse' }))
    return [...NAV_ADMIN, ...boutique]
  }
  return navigationBoutique(utilisateur)
}

function navigationBoutique(utilisateur: Utilisateur): ElementNavigation[] {
  const role = roleBoutique(utilisateur)
  if (!role) return NAV_BOUTIQUE.filter((e) => e.chemin === '/demarrage')
  // Démarrage guidé visible tant que la configuration n'est pas terminée.
  const configuration = utilisateur.boutique?.configuration
  const demarrageFini = Boolean(configuration?.wallet && configuration?.paiement_test)
  return NAV_BOUTIQUE.filter((e) => e.roles.includes(role) && !(e.chemin === '/demarrage' && demarrageFini))
}

/** Chemin d'atterrissage après connexion. */
export function cheminAccueil(utilisateur: Utilisateur | null): string {
  if (!utilisateur) return '/accueil'
  if (estSuperAdmin(utilisateur)) return '/admin'
  if (!utilisateur.boutique) return '/demarrage'
  return '/caisse'
}

export function estActif(cheminCourant: string, chemin: string): boolean {
  if (chemin === '/admin') return cheminCourant === '/admin'
  return cheminCourant === chemin || cheminCourant.startsWith(`${chemin}/`)
}
