import type { FastifyInstance } from 'fastify';
import type { Connexion, Registre } from '../registre.js';
import { schemaCorpsFacture, schemaParamsFacture, schemaParamsId, valider } from '../schemas.js';

export type OptionsRoutes = { registre: Registre };

/** Exécute un appel au portefeuille en tenant à jour l'indicateur `connecte` de la connexion. */
export async function avecConnexion<T>(registre: Registre, c: Connexion, f: () => Promise<T>): Promise<T> {
  try {
    const r = await f();
    registre.marquer(c, true);
    return r;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'PORTEFEUILLE_INJOIGNABLE' || code === 'DELAI_DEPASSE') registre.marquer(c, false);
    throw e;
  }
}

/**
 * `POST /connexions/{id}/factures` → `{ bolt11, payment_hash, montant_msats, cree_le, expire_le }`
 * `GET /connexions/{id}/factures/{payment_hash}` → `{ payment_hash, statut, montant_msats, regle_le?, preimage?, expire_le }`
 */
export async function routesFactures(app: FastifyInstance, { registre }: OptionsRoutes): Promise<void> {
  app.post('/connexions/:id/factures', async (req, reply) => {
    const { id } = valider(schemaParamsId, req.params, 'paramètres');
    const corps = valider(schemaCorpsFacture, req.body, 'corps');
    const c = registre.obtenir(id);
    const facture = await avecConnexion(registre, c, () => c.portefeuille.makeInvoice(corps));
    return reply.status(201).send(facture);
  });

  app.get('/connexions/:id/factures/:payment_hash', async (req) => {
    const { id, payment_hash } = valider(schemaParamsFacture, req.params, 'paramètres');
    const c = registre.obtenir(id);
    return avecConnexion(registre, c, () => c.portefeuille.lookupInvoice(payment_hash));
  });
}
