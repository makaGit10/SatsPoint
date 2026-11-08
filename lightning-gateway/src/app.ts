import Fastify, { LogController, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ApiInterne } from './api-interne.js';
import type { Config } from './config.js';
import { ErreurPasserelle, erreur, estErreurPasserelle } from './erreurs.js';
import { Evenements } from './evenements.js';
import { creerJournal, type Journal } from './journal.js';
import type { OptionsResolution } from './paiements/destination.js';
import { creerFabrique, type Fabrique } from './portefeuilles/fabrique.js';
import { Registre } from './registre.js';
import { routesConnexions } from './routes/connexions.js';
import { routesFactures } from './routes/factures.js';
import { routesMock } from './routes/mock.js';
import { routesPaiements } from './routes/paiements.js';
import { routesPortefeuille } from './routes/portefeuille.js';
import { routesSante } from './routes/sante.js';
import { EN_TETES, MagasinNonces, VerificateurHmac } from './securite/hmac.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Corps exact reçu (chaîne), utilisé pour la signature HMAC. */
    corpsBrut: string;
    /** Corps JSON indéchiffrable : erreur renvoyée seulement après authentification. */
    corpsIllisible: boolean;
  }
}

export type OptionsApp = {
  config: Config;
  journal?: Journal;
  fabrique?: Fabrique;
  api?: ApiInterne;
  evenements?: Evenements;
  magasinNonces?: MagasinNonces;
  maintenant?: () => number;
  resolution?: Partial<OptionsResolution>;
};

export type Passerelle = FastifyInstance & {
  registre: Registre;
  evenements: Evenements;
  api: ApiInterne | undefined;
  config: Config;
};

export const LIMITE_CORPS_OCTETS = 32 * 1024;

/** Construit l'application Fastify complète (utilisée par `index.ts` et par les tests). */
export async function construireApp(options: OptionsApp): Promise<Passerelle> {
  const { config } = options;
  const journal = options.journal ?? creerJournal(config.logLevel);
  const api = options.api ?? (config.apiInternalUrl ? new ApiInterne(config.apiInternalUrl, config.secretHmac) : undefined);
  const evenements = options.evenements ?? new Evenements(api, journal);
  const fabrique =
    options.fabrique ??
    creerFabrique({
      mockAutorise: config.mockAutorise,
      delaiMs: config.delaiPortefeuilleMs,
      journal,
      ...(options.resolution ? { resolution: options.resolution } : {}),
    });
  const registre = new Registre(fabrique, evenements, journal);
  const verificateur = new VerificateurHmac(config.secretHmac, {
    ...(options.magasinNonces ? { magasin: options.magasinNonces } : {}),
    ...(options.maintenant ? { maintenant: options.maintenant } : {}),
  });

  const app = Fastify({
    loggerInstance: journal,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: LIMITE_CORPS_OCTETS,
    requestIdHeader: false,
    trustProxy: false,
    routerOptions: { ignoreTrailingSlash: false, caseSensitive: true, maxParamLength: 128 },
  }) as unknown as Passerelle;

  app.decorateRequest('corpsBrut', '');

  // Corps JSON conservé tel quel pour la signature ; corps vide accepté (DELETE, POST sans corps).
  app.removeContentTypeParser(['application/json', 'text/plain']);
  app.decorateRequest('corpsIllisible', false);
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: LIMITE_CORPS_OCTETS }, (req, corps, fin) => {
    const texte = typeof corps === 'string' ? corps : corps.toString('utf8');
    req.corpsBrut = texte;
    if (texte.trim() === '') return fin(null, undefined);
    try {
      fin(null, JSON.parse(texte));
    } catch {
      // Signalé après la vérification HMAC : un appelant non authentifié n'apprend rien sur le parseur.
      req.corpsIllisible = true;
      fin(null, undefined);
    }
  });

  // En-têtes de réponse sobres (API interne JSON uniquement).
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  // Journal d'accès minimal : méthode, route (motif), statut, durée, id de connexion. Jamais le corps.
  app.addHook('onResponse', async (req, reply) => {
    const params = req.params as Record<string, string> | undefined;
    journal.info(
      {
        methode: req.method,
        route: req.routeOptions.url ?? req.url.split('?')[0],
        statut: reply.statusCode,
        duree_ms: Math.round(reply.elapsedTime),
        id: params?.id,
      },
      'requête traitée',
    );
  });

  app.setNotFoundHandler((_req, reply) => {
    void reply.status(404).send(new ErreurPasserelle('ROUTE_INCONNUE').versJson());
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (estErreurPasserelle(err)) {
      if (err.code === 'INTERNE') journal.error({ erreur: err.message, cause: messageCause(err.cause), url: req.routeOptions.url }, 'erreur interne');
      return reply.status(err.statut).send(err.versJson());
    }
    const e = err as { code?: string; statusCode?: number; message?: string };
    if (e.statusCode === 413 || e.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send(new ErreurPasserelle('ENTREE_INVALIDE', 'Corps trop volumineux').versJson());
    }
    if (e.statusCode === 415 || e.code?.startsWith('FST_ERR_CTP_INVALID_MEDIA_TYPE')) {
      return reply.status(415).send(new ErreurPasserelle('ENTREE_INVALIDE', 'Content-Type attendu : application/json').versJson());
    }
    if (typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send(new ErreurPasserelle('ENTREE_INVALIDE').versJson());
    }
    journal.error({ erreur: e.message, code: e.code, url: req.routeOptions.url }, 'erreur non gérée');
    return reply.status(500).send(new ErreurPasserelle('INTERNE').versJson());
  });

  // Route publique (sans HMAC) : état de santé.
  await app.register(routesSante, { registre, evenements, config });

  // Toutes les autres routes exigent une signature HMAC valide.
  await app.register(async (prive) => {
    prive.addHook('preValidation', async (req: FastifyRequest, reply: FastifyReply) => {
      const resultat = verificateur.verifier({
        methode: req.method,
        chemin: req.raw.url ?? req.url,
        corps: req.corpsBrut ?? '',
        enTetes: {
          timestamp: enTete(req, EN_TETES.horodatage),
          nonce: enTete(req, EN_TETES.nonce),
          signature: enTete(req, EN_TETES.signature),
        },
      });
      if (!resultat.ok) {
        journal.warn({ raison: resultat.raison, methode: req.method, route: req.routeOptions.url }, 'requête refusée (HMAC)');
        return reply.status(401).send(new ErreurPasserelle('NON_AUTORISE').versJson());
      }
      if (req.corpsIllisible) throw erreur('ENTREE_INVALIDE', 'Corps JSON illisible');
    });
    await prive.register(routesConnexions, { registre });
    await prive.register(routesFactures, { registre });
    await prive.register(routesPortefeuille, { registre });
    await prive.register(routesPaiements, { registre });
    await prive.register(routesMock, { registre });
  });

  app.registre = registre;
  app.evenements = evenements;
  app.api = api;
  app.config = config;

  app.addHook('onClose', async () => {
    registre.fermerTout();
  });

  return app;
}

function enTete(req: FastifyRequest, nom: string): string | undefined {
  const v = req.headers[nom];
  if (Array.isArray(v)) return undefined; // en-tête dupliqué : refusé
  return v;
}

function messageCause(c: unknown): string | undefined {
  if (c instanceof Error) return c.message;
  if (c === undefined) return undefined;
  return String(c);
}
