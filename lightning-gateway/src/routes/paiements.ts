import type { FastifyInstance } from 'fastify';
import { erreur } from '../erreurs.js';
import { abregerHash } from '../journal.js';
import { decoderBolt11 } from '../portefeuilles/bolt11.js';
import type { Portefeuille } from '../portefeuilles/types.js';
import type { Registre } from '../registre.js';
import { schemaCorpsApercu, schemaCorpsPaiement, schemaParamsId, valider } from '../schemas.js';
import { avecConnexion } from './factures.js';

export type OptionsRoutes = { registre: Registre };

type PortefeuilleAvecResolution = Portefeuille & {
  resoudreEnBolt11(destination: string, montantMsats: number): Promise<{ bolt11: string; montant_msats: number }>;
};

function peutResoudre(p: Portefeuille): p is PortefeuilleAvecResolution {
  return typeof (p as Partial<PortefeuilleAvecResolution>).resoudreEnBolt11 === 'function';
}

/**
 * `POST /connexions/{id}/paiements/apercu` → `{ type, bolt11?, montant_msats, description?, destinataire?, min_msats?, max_msats?, payment_hash? }`
 * `POST /connexions/{id}/paiements` → `{ payment_hash, preimage, frais_msats, montant_msats }`
 *   — budget côté passerelle (`budget_msats` de la connexion) vérifié avant l'appel `pay_invoice`.
 */
export async function routesPaiements(app: FastifyInstance, { registre }: OptionsRoutes): Promise<void> {
  app.post('/connexions/:id/paiements/apercu', async (req) => {
    const { id } = valider(schemaParamsId, req.params, 'paramètres');
    const corps = valider(schemaCorpsApercu, req.body, 'corps');
    const c = registre.obtenir(id);
    return c.portefeuille.apercuPaiement(corps);
  });

  app.post('/connexions/:id/paiements', async (req) => {
    const { id } = valider(schemaParamsId, req.params, 'paramètres');
    const corps = valider(schemaCorpsPaiement, req.body, 'corps');
    const c = registre.obtenir(id);

    // 1. Résolution en facture BOLT11 + montant effectif.
    let bolt11: string;
    let montant: number;
    if ('bolt11' in corps) {
      const d = decoderBolt11(corps.bolt11);
      const m = d.montant_msats ?? corps.montant_msats;
      if (m === undefined) throw erreur('FACTURE_INVALIDE', 'Facture sans montant : montant_msats est requis');
      if (d.montant_msats !== null && corps.montant_msats !== undefined && corps.montant_msats !== d.montant_msats) {
        throw erreur('FACTURE_INVALIDE', 'Le montant demandé diffère du montant de la facture');
      }
      bolt11 = d.bolt11;
      montant = m;
    } else {
      if (!peutResoudre(c.portefeuille)) throw erreur('DESTINATION_INVALIDE', 'Ce portefeuille ne résout pas les destinations');
      const r = await c.portefeuille.resoudreEnBolt11(corps.destination, corps.montant_msats);
      bolt11 = r.bolt11;
      montant = r.montant_msats;
    }

    // 2. Budget passerelle (réservation pour résister aux paiements concurrents).
    registre.reserverBudget(c, montant);
    try {
      // Le portefeuille ne transmet `amount` au NIP-47 que si la facture n'en fixe pas ; sinon il vérifie l'égalité.
      const resultat = await avecConnexion(registre, c, () => c.portefeuille.payInvoice({ bolt11, montant_msats: montant }));
      registre.confirmerBudget(c, montant, resultat.montant_msats + resultat.frais_msats);
      app.log.info(
        { id, hash: abregerHash(resultat.payment_hash), montant_msats: resultat.montant_msats, frais_msats: resultat.frais_msats },
        'paiement sortant effectué',
      );
      return resultat;
    } catch (e) {
      // Un délai dépassé ne prouve pas l'échec : on garde la réservation jusqu'à vérification côté API.
      if ((e as { code?: string }).code === 'DELAI_DEPASSE') registre.confirmerBudget(c, montant, montant);
      else registre.libererBudget(c, montant);
      throw e;
    }
  });
}
