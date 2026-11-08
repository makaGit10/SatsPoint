import { create } from 'zustand'
import type { Theme } from '@/api/types'
import { CLES_STOCKAGE, ecrireStockage, lireStockage } from './stockage'

export const THEMES: Theme[] = ['clair', 'sombre', 'auto']

export function estTheme(valeur: unknown): valeur is Theme {
  return valeur === 'clair' || valeur === 'sombre' || valeur === 'auto'
}

/** Thème au premier lancement : clair (identité « blanc et or ») ; « automatique » reste un choix possible. */
export const THEME_PAR_DEFAUT: Theme = 'clair'

function lireThemeMemorise(): Theme {
  const v = lireStockage(CLES_STOCKAGE.theme)
  return estTheme(v) ? v : THEME_PAR_DEFAUT
}

/** Thème réellement affiché (résout « auto » selon le système). */
export function themeEffectif(theme: Theme): 'clair' | 'sombre' {
  if (theme !== 'auto') return theme
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair'
}

/** Couleur de la barre d'état : alignée sur --fond (jetons.css). */
const COULEURS_BARRE = { clair: '#faf9f6', sombre: '#141311' } as const

export function appliquerTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const racine = document.documentElement
  if (theme === 'auto') racine.removeAttribute('data-theme')
  else racine.setAttribute('data-theme', theme)
  // Barre d'état du navigateur alignée sur le thème.
  const effectif = themeEffectif(theme)
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    if (theme === 'auto') {
      const media = meta.getAttribute('media') ?? ''
      meta.content = media.includes('dark') ? COULEURS_BARRE.sombre : COULEURS_BARRE.clair
    } else {
      meta.content = COULEURS_BARRE[effectif]
    }
  })
}

interface EtatTheme {
  theme: Theme
  definir: (theme: Theme) => void
}

export const useTheme = create<EtatTheme>((set) => ({
  theme: lireThemeMemorise(),
  definir: (theme) => {
    appliquerTheme(theme)
    // « auto » est mémorisé explicitement : sans valeur, on retombe sur le thème par défaut (clair).
    ecrireStockage(CLES_STOCKAGE.theme, theme)
    set({ theme })
  },
}))

// Applique le thème mémorisé dès le chargement du module (complète le script inline de index.html).
appliquerTheme(useTheme.getState().theme)
