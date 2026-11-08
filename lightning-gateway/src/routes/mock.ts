import type { FastifyInstance } from 'fastify';
import type { Registre } from '../registre.js';
import { schemaParamsFacture, valider } from '../schemas.js';

export type OptionsRoutes = { registre: Registre };

/** `POST /mock/{id}/payer/{payment_hash}` → `{ ok: true }` — uniquement pour une connexion `mock://`, sinon 404. */
export async function routesMock(app: FastifyInstance, { registre }: OptionsRoutes): Promise<void> {
  app.post('/mock/:id/payer/:payment_hash', async (req) => {
    const { id, payment_hash } = valider(schemaParamsFacture, req.params, 'paramètres');
    const mock = registre.obtenirMock(id);
    mock.payer(payment_hash);
    return { ok: true };
  });
}
