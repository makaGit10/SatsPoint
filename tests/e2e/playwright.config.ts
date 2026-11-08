import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout SatsPoint (voir docs/DIRECTIVES.md § 4 et annexe A.3).
 *
 * - Environnement de TEST uniquement : URL fixe, jamais la production.
 * - Sans fenêtre, traces conservées en cas d'échec, UNE relance pour repérer les tests instables.
 * - Deux tailles : bureau 1366×768 et téléphone 390×844 (SatsPoint est d'abord mobile).
 *
 * Variables : E2E_BASE_URL (défaut http://localhost:5190), E2E_API_URL (défaut http://localhost:8120),
 *             E2E_MDP_DEMO (mot de passe des comptes de démo), E2E_MDP_ADMIN.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /\d{2}-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
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
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
});
