import { artisan, PREFIXE_TEST } from '../fixtures';

/** Avant la suite : supprime les restes d'une exécution précédente interrompue (préfixe TEST-E2E-). */
export default async function globalSetup() {
  artisan('e2e:nettoyer', 'TEST-E2E-');
  process.env.E2E_PREFIXE = PREFIXE_TEST;
}
