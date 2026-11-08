import { z } from 'zod';
import { erreur } from './erreurs.js';

/** Bornes d'entrée (règle 2 : type, format, longueur, bornes ; rejet par défaut). */
export const MONTANT_MAX_MSATS = 100_000_000_000_000; // 1 000 BTC — garde-fou technique, l'API applique les plafonds métier
export const DESCRIPTION_MAX = 639; // limite BOLT11 du champ description (octets)
export const EXPIRATION_MIN_S = 30;
export const EXPIRATION_MAX_S = 7 * 24 * 3600;
export const EXPIRATION_DEFAUT_S = 900;

export const schemaId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'identifiant de connexion invalide');
export const schemaHash = z.string().regex(/^[0-9a-fA-F]{64}$/, 'payment_hash invalide').transform((h) => h.toLowerCase());

export const schemaParamsId = z.object({ id: schemaId });
export const schemaParamsFacture = z.object({ id: schemaId, payment_hash: schemaHash });

const montantMsats = z.number().int().positive().max(MONTANT_MAX_MSATS);

export const schemaCorpsConnexion = z
  .object({
    uri: z.string().min(1).max(4096),
    budget_msats: z.number().int().nonnegative().max(MONTANT_MAX_MSATS).optional(),
  })
  .strict();

export const schemaCorpsFacture = z
  .object({
    montant_msats: montantMsats,
    description: z
      .string()
      .max(DESCRIPTION_MAX)
      .default('')
      .refine((s) => Buffer.byteLength(s, 'utf8') <= DESCRIPTION_MAX, 'description trop longue'),
    expiration_s: z.number().int().min(EXPIRATION_MIN_S).max(EXPIRATION_MAX_S).default(EXPIRATION_DEFAUT_S),
  })
  .strict();

export const schemaQueryTransactions = z
  .object({
    limite: z.coerce.number().int().min(1).max(100).default(20),
    decalage: z.coerce.number().int().min(0).max(100_000).default(0),
    type: z.enum(['entrante', 'sortante']).optional(),
  })
  .strict();

export const schemaQueryConnexion = z
  .object({
    verifier: z.enum(['true', 'false', '1', '0']).optional(),
  })
  .strict();

export const schemaCorpsApercu = z
  .object({
    destination: z.string().min(1).max(4096),
    montant_msats: montantMsats.optional(),
  })
  .strict();

export const schemaCorpsPaiement = z
  .union([
    z.object({ bolt11: z.string().min(1).max(4096), montant_msats: montantMsats.optional() }).strict(),
    z.object({ destination: z.string().min(1).max(4096), montant_msats: montantMsats }).strict(),
  ]);

/** Valide une entrée et renvoie la valeur typée, ou lève `ENTREE_INVALIDE` avec les champs fautifs. */
export function valider<T extends z.ZodType>(schema: T, donnees: unknown, contexte = 'corps'): z.output<T> {
  const r = schema.safeParse(donnees);
  if (r.success) return r.data as z.output<T>;
  const champs = [...new Set(r.error.issues.map((i) => i.path.map(String).join('.') || contexte))].slice(0, 6);
  throw erreur('ENTREE_INVALIDE', `Entrée invalide (${contexte}) : ${champs.join(', ')}`);
}
