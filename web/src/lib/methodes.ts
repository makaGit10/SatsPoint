import type { MethodePaiement, Operateur } from '@/api/types'

export const OPERATEURS: Operateur[] = ['wave', 'orange_money', 'free_money']

/** « Bitcoin », « Mobile money · Wave », « Wave direct » (libellés i18n, jamais de texte en dur). */
export function libelleMethode(t: (cle: string) => string, methode: MethodePaiement | null, operateur: Operateur | null): string {
  if (!methode) return '—'
  if (methode === 'paytech' && operateur) return `${t('methodes.paytech')} · ${t(`operateurs.${operateur}`)}`
  return t(`methodes.${methode}`)
}

/** `LIGHTNING:` + BOLT11 en majuscules : QR plus compact et plus lisible (cahier § 6.4). */
export function contenuQrLightning(bolt11: string): string {
  return `LIGHTNING:${bolt11.toUpperCase()}`
}
