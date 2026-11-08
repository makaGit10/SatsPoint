import type { ReactNode } from 'react'
import { create } from 'zustand'
import { annoncer } from '@/voix/annoncer'

export type TypeToast = 'succes' | 'erreur' | 'info' | 'attente'

export interface Toast {
  id: number
  type: TypeToast
  titre: ReactNode
  description?: ReactNode
  /** Clé vocale : haut-parleur dans la notification et annonce automatique. */
  voix?: string
  duree?: number
}

interface EtatToasts {
  toasts: Toast[]
  ajouter: (toast: Omit<Toast, 'id'>) => number
  retirer: (id: number) => void
}

let compteur = 0
let derniere: { empreinte: string; horodatage: number } | null = null
const FENETRE_DOUBLON = 600

export const useToasts = create<EtatToasts>((set) => ({
  toasts: [],
  ajouter: (toast) => {
    // Même message en rafale (double effet en développement, double clic) → une seule notification.
    const empreinte = `${toast.type}|${typeof toast.titre === 'string' ? toast.titre : ''}`
    const maintenant = Date.now()
    if (derniere && derniere.empreinte === empreinte && maintenant - derniere.horodatage < FENETRE_DOUBLON) return compteur
    derniere = { empreinte, horodatage: maintenant }
    const id = ++compteur
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }))
    if (toast.voix) void annoncer(toast.voix)
    return id
  },
  retirer: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Notification utilisable partout (y compris hors React). */
export function notifier(toast: Omit<Toast, 'id'>) {
  return useToasts.getState().ajouter(toast)
}
