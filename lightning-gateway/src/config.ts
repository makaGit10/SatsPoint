import { z } from 'zod';

/**
 * Configuration de la passerelle, lue dans les variables d'environnement et validée.
 * Aucune valeur secrète n'est écrite ailleurs que dans l'objet retourné (jamais journalisée).
 */

const booleen = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const schemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3011),
  HOST: z.string().min(1).default('0.0.0.0'),
  GATEWAY_HMAC_SECRET: z
    .string()
    .min(16, 'GATEWAY_HMAC_SECRET est obligatoire (16 caractères minimum)'),
  API_INTERNAL_URL: z
    .union([z.literal(''), z.url({ protocol: /^https?$/ })])
    .optional()
    .transform((v) => (v ? v.replace(/\/+$/, '') : undefined)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ALLOW_MOCK_WALLET: booleen,
});

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  secretHmac: string;
  apiInternalUrl: string | undefined;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Le portefeuille simulé est accepté si l'on n'est pas en production, ou si ALLOW_MOCK_WALLET=true. */
  mockAutorise: boolean;
  /** Délai maximal d'un appel au portefeuille (ms). Contrat : 15 s. */
  delaiPortefeuilleMs: number;
};

export const DELAI_PORTEFEUILLE_MS = 15_000;

export function chargerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultat = schemaEnv.safeParse(env);
  if (!resultat.success) {
    const details = resultat.error.issues.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`);
    throw new Error(`Configuration invalide — ${details.join(' ; ')}`);
  }
  const e = resultat.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    secretHmac: e.GATEWAY_HMAC_SECRET,
    apiInternalUrl: e.API_INTERNAL_URL,
    logLevel: e.LOG_LEVEL,
    mockAutorise: e.NODE_ENV !== 'production' || e.ALLOW_MOCK_WALLET,
    delaiPortefeuilleMs: DELAI_PORTEFEUILLE_MS,
  };
}
