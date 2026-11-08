import type { GroupeRecherche, ResultatRecherche, RoleBoutique, RubriqueRecherche, Utilisateur } from '@/api/types'
import { estSuperAdmin, roleBoutique } from '@/auth/store'
import { pertinence } from '@/lib/texte'

/**
 * Index local des pages et réglages : trouvables sans réseau (cahier § 6.14 « portefeuille », « PayTech », « thème »).
 * `titre` / `parent` / `mots` sont des clés i18n ; `roles` = rôles de boutique autorisés, `admin` = super-admin.
 */
export interface PageIndexee {
  id: string
  titre: string
  parent?: string
  mots: string
  url: string
  roles: readonly RoleBoutique[] | 'admin' | 'tous'
}

const TOUS: readonly RoleBoutique[] = ['proprietaire', 'gerant', 'caissier']
const GESTION: readonly RoleBoutique[] = ['proprietaire', 'gerant']

export const PAGES: readonly PageIndexee[] = [
  { id: 'caisse', titre: 'nav.caisse', mots: 'recherche.mots.caisse', url: '/caisse', roles: TOUS },
  { id: 'ventes', titre: 'nav.ventes', mots: 'recherche.mots.ventes', url: '/ventes', roles: TOUS },
  { id: 'exporter', titre: 'recherche.pages.exporter', parent: 'nav.ventes', mots: 'recherche.mots.exporter', url: '/ventes?exporter=1', roles: GESTION },
  { id: 'tableau', titre: 'nav.tableau', mots: 'recherche.mots.tableau', url: '/tableau-de-bord', roles: TOUS },
  { id: 'portefeuille', titre: 'nav.portefeuille', mots: 'recherche.mots.portefeuille', url: '/portefeuille', roles: GESTION },
  { id: 'articles', titre: 'nav.articles', mots: 'recherche.mots.articles', url: '/articles', roles: TOUS },
  { id: 'importer', titre: 'recherche.pages.importer', parent: 'nav.articles', mots: 'recherche.mots.importer', url: '/articles?importer=1', roles: GESTION },
  { id: 'equipe', titre: 'nav.equipe', mots: 'recherche.mots.equipe', url: '/equipe', roles: GESTION },
  { id: 'reglages', titre: 'nav.reglages', mots: 'recherche.mots.reglages', url: '/reglages', roles: GESTION },
  { id: 'boutique', titre: 'recherche.pages.boutique', parent: 'nav.reglages', mots: 'recherche.mots.boutique', url: '/reglages#boutique', roles: GESTION },
  { id: 'paiements', titre: 'recherche.pages.paiements', parent: 'nav.reglages', mots: 'recherche.mots.paiements', url: '/reglages#paiements', roles: GESTION },
  { id: 'paytech', titre: 'recherche.pages.paytech', parent: 'nav.reglages', mots: 'recherche.mots.paytech', url: '/reglages#paytech', roles: GESTION },
  { id: 'preferences', titre: 'recherche.pages.preferences', parent: 'nav.reglages', mots: 'recherche.mots.preferences', url: '/reglages#preferences', roles: GESTION },
  { id: 'securite', titre: 'recherche.pages.securite', mots: 'recherche.mots.securite', url: '/securite/2fa', roles: 'tous' },
  { id: 'demarrage', titre: 'nav.demarrage', mots: 'recherche.mots.demarrage', url: '/demarrage', roles: ['proprietaire'] },
  { id: 'aideEncaisser', titre: 'recherche.pages.aideEncaisser', parent: 'recherche.aide', mots: 'recherche.mots.aideEncaisser', url: '/caisse', roles: TOUS },
  { id: 'console', titre: 'nav.admin', mots: 'recherche.mots.console', url: '/admin', roles: 'admin' },
  { id: 'studio', titre: 'nav.studio', mots: 'recherche.mots.studio', url: '/admin/studio', roles: 'admin' },
]

export function pagesAutorisees(utilisateur: Utilisateur | null): PageIndexee[] {
  if (!utilisateur) return []
  const admin = estSuperAdmin(utilisateur)
  const role = roleBoutique(utilisateur)
  return PAGES.filter((p) => (p.roles === 'tous' ? true : p.roles === 'admin' ? admin : role !== null && p.roles.includes(role)))
}

/** Recherche dans l'index local (titres et mots-clés traduits). */
export function chercherPages(pages: readonly PageIndexee[], terme: string, t: (cle: string) => string): ResultatRecherche[] {
  return pages
    .map((p) => {
      const titre = p.parent ? `${t(p.parent)} › ${t(p.titre)}` : t(p.titre)
      const score = Math.max(pertinence(t(p.titre), terme), pertinence(titre, terme) * 0.9, pertinence(t(p.mots), terme) * 0.8)
      return { titre, sous_titre: null, url: p.url, score: Math.round(score) }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

export const PAR_RUBRIQUE = 5

/**
 * Fusion serveur + pages locales : pages dédoublonnées par URL (meilleure note), 5 par rubrique,
 * rubriques triées par leur meilleur résultat (les plus pertinents en tête).
 */
export function fusionnerGroupes(serveur: readonly GroupeRecherche[], pagesLocales: readonly ResultatRecherche[]): GroupeRecherche[] {
  const groupes = new Map<RubriqueRecherche, Map<string, ResultatRecherche>>()
  const ajouter = (rubrique: RubriqueRecherche, r: ResultatRecherche) => {
    const g = groupes.get(rubrique) ?? new Map<string, ResultatRecherche>()
    const cle = `${r.url}|${rubrique === 'pages' ? '' : r.titre}`
    const existant = g.get(cle)
    if (!existant || existant.score < r.score) g.set(cle, existant && rubrique === 'pages' ? { ...existant, score: r.score } : r)
    groupes.set(rubrique, g)
  }
  for (const r of pagesLocales) ajouter('pages', r)
  for (const g of serveur) for (const r of g.resultats) ajouter(g.rubrique, r)
  return [...groupes]
    .map(([rubrique, m]) => ({ rubrique, resultats: [...m.values()].sort((a, b) => b.score - a.score).slice(0, PAR_RUBRIQUE) }))
    .filter((g) => g.resultats.length > 0)
    .sort((a, b) => (b.resultats[0]?.score ?? 0) - (a.resultats[0]?.score ?? 0))
}

/** Déplacement circulaire dans une liste (↑ ↓) ; -1 si la liste est vide. */
export function deplacer(index: number, total: number, sens: 1 | -1): number {
  if (total <= 0) return -1
  if (index < 0) return sens === 1 ? 0 : total - 1
  return (index + sens + total) % total
}
