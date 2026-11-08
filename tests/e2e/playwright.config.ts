import { defineConfig, devices } from '@playwright/test';
import { chargerEnvRacine } from './outils/env';

chargerEnvRacine();

/**
 * Tests de bout en bout SatsPoint (voir docs/DIRECTIVES.md § 4 et annexe A.3).
 *
 * - Environnement de TEST uniquement : URL fixe, jamais la production.
 * - Sans fenêtre, traces conservées en cas d'échec, UNE relance pour repérer les tests instables.
 * - Deux tailles : bureau 1366×768 et téléphone 390×844 (SatsPoint est d'abord mobile).
 * - Données `TEST-E2E-<date>` supprimées avant et après la suite (`php artisan e2e:nettoyer`).
 *
 * Variables : E2E_BASE_URL (défaut http://localhost:5190), E2E_API_URL (défaut http://localhost:8120) ;
 * mots de passe lus dans le `.env` racine (DEMO_PASSWORD) s'ils ne sont pas fournis (E2E_MDP_DEMO).
 */
const permissions = ['clipboard-read', 'clipboard-write'];

export default defineConfig({
  testDir: '.',
  testMatch: /\d{2}-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/resultats.json' }], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  globalSetup: './outils/global-setup.ts',
  globalTeardown: './outils/global-teardown.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5190',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'fr-FR',
    timezoneId: 'Africa/Dakar',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'bureau',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 }, permissions },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, permissions },
    },
  ],
});
