import type { FastifyInstance } from 'fastify';
import type { Registre } from '../registre.js';
import { schemaParamsId, schemaQueryTransactions, valider } from '../schemas.js';
import { avecConnexion } from './factures.js';

export type OptionsRoutes = { registre: Registre };

/**
 * `GET /connexions/{id}/solde` → `{ msats }`
 * `GET /connexions/{id}/transactions?limite=&decalage=&type=` → `{ transactions: [...] }`
 */
export async function routesPortefeuille(app: FastifyInstance, { registre }: OptionsRoutes): Promise<void> {
  app.get('/connexions/:id/solde', async (req) => {
    const { id } = valider(schemaParamsId, req.params, 'paramètres');
    const c = registre.obtenir(id);
    return avecConnexion(registre, c, () => c.portefeuille.getBalance());
  });

  app.get('/connexions/:id/transactions', async (req) => {
    const { id } = valider(schemaParamsId, req.params, 'paramètres');
    const filtre = valider(schemaQueryTransactions, req.query, 'query');
    const c = registre.obtenir(id);
    const transactions = await avecConnexion(registre, c, () => c.portefeuille.listTransactions(filtre));
    return { transactions };
  });
}
