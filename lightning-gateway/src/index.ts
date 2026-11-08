import { construireApp } from './app.js';
import { chargerConfig } from './config.js';
import { creerJournal } from './journal.js';

/**
 * Point d'entrée de la passerelle Lightning SatsPoint.
 * Variables d'environnement : PORT (3011), HOST, GATEWAY_HMAC_SECRET (obligatoire),
 * API_INTERNAL_URL, LOG_LEVEL, ALLOW_MOCK_WALLET, NODE_ENV.
 */
async function demarrer(): Promise<void> {
  let config;
  try {
    config = chargerConfig();
  } catch (e) {
    // Pas encore de journal : message sobre sur la sortie d'erreur, sans valeur de variable.
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
  const journal = creerJournal(config.logLevel);
  const app = await construireApp({ config, journal });

  await app.listen({ port: config.port, host: config.host });
  journal.info(
    {
      port: config.port,
      host: config.host,
      env: config.nodeEnv,
      mock_autorise: config.mockAutorise,
      api_interne: config.apiInternalUrl ? new URL(config.apiInternalUrl).host : null,
    },
    'passerelle Lightning démarrée',
  );

  // Réhydratation non bloquante : l'API peut ne pas être prête, on réessaie avec un délai croissant.
  if (app.api) {
    void app.registre.rehydrater(app.api).catch((e: unknown) => {
      journal.error({ erreur: e instanceof Error ? e.message : String(e) }, 'réhydratation en erreur');
    });
  } else {
    journal.warn('API_INTERNAL_URL absente : pas de réhydratation ni d’envoi d’événements');
  }

  let arretEnCours = false;
  const arreter = (signal: string): void => {
    if (arretEnCours) return;
    arretEnCours = true;
    journal.info({ signal }, 'arrêt de la passerelle');
    const garde = setTimeout(() => process.exit(0), 8_000);
    garde.unref();
    void app
      .close()
      .then(() => app.evenements.vider())
      .finally(() => process.exit(0));
  };
  process.on('SIGTERM', () => arreter('SIGTERM'));
  process.on('SIGINT', () => arreter('SIGINT'));
  process.on('unhandledRejection', (raison) => {
    journal.error({ erreur: raison instanceof Error ? raison.message : String(raison) }, 'promesse rejetée non gérée');
  });
}

demarrer().catch((e: unknown) => {
  process.stderr.write(`Démarrage impossible : ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
