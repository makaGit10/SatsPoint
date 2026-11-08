import { clsx, type ClassValue } from 'clsx'

/** Concatène des classes conditionnelles (sans doublon inutile). */
export function cn(...entrees: ClassValue[]) {
  return clsx(entrees)
}
