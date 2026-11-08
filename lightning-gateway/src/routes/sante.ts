import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import type { Evenements } from '../evenements.js';
import type { Registre } from '../registre.js';

export type OptionsSante = { registre: Registre; evenements: Evenements; config: Config };

/** `GET /sante` (sans HMAC) → `{ ok, connexions, mock, uptime_s }`. */
export async function routesSante(app: FastifyInstance, options: OptionsSante): Promise<void> {
  const { registre } = options;
  app.get('/sante', async () => ({
    ok: true,
    connexions: registre.taille,
    mock: registre.aUneConnexionMock(),
    uptime_s: Math.floor(process.uptime()),
  }));
}
