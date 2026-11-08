import type { FastifyInstance } from 'fastify';
import type { Registre } from '../registre.js';
import { schemaCorpsConnexion, schemaParamsId, schemaQueryConnexion, valider } from '../schemas.js';

export type OptionsRoutes = { registre: Registre };

/**
 * `PUT /connexions/{id}` — vérifie par `get_info`, mémorise, s'abonne aux notifications.
 * `GET /connexions/{id}` — même forme + `connecte`, `derniere_verification` (revérifie sauf `?verifier=false`).
 * `DELETE /connexions/{id}` — 204 (idempotent).
 */
export async function routesConnexions(app: FastifyInstance, { registre }: OptionsRoutes): Promise<void> {
  app.put('/connexions/:id', async (req, reply) => {
    const { id } = valider(schemaParamsId, req.params, 'paramètres');
    const corps = valider(schemaCorpsConnexion, req.body, 'corps');
    const connexion = await registre.enregistrer(id, corps.uri, corps.budget_msats);
    const { connecte: _c, derniere_verification: _d, ...reponse } = registre.versPublic(connexion);
    return reply.status(200).send(reponse);
  });

  app.get('/connexions/:id', async (req) => {
    const { id } = valider(schemaParamsId, req.params, 'paramètres');
    const query = valider(schemaQueryConnexion, req.query, 'query');
    const verifier = query.verifier === undefined || query.verifier === 'true' || query.verifier === '1';
    const connexion = verifier ? await registre.verifier(id) : registre.obtenir(id);
    return registre.versPublic(connexion);
  });

  app.delete('/connexions/:id', async (req, reply) => {
    const { id } = valider(schemaParamsId, req.params, 'paramètres');
    registre.supprimer(id);
    return reply.status(204).send();
  });
}
