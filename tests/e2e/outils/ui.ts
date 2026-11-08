import { expect, type Page, type Response } from '@playwright/test';

/** Saisit un montant sur le pavé de la caisse (chiffre par chiffre, `000` quand c'est possible). */
export async function taperMontant(page: Page, montant: number) {
  const pave = page.getByRole('group', { name: 'Pavé numérique' });
  const texte = String(montant);
  let reste = texte;
  while (reste.length) {
    if (reste.startsWith('000') && reste.length < texte.length) {
      await pave.getByRole('button', { name: 'Touche 000', exact: true }).click();
      reste = reste.slice(3);
    } else {
      await pave.getByRole('button', { name: `Touche ${reste[0]}`, exact: true }).click();
      reste = reste.slice(1);
    }
  }
}

/** Montant formaté FCFA tolérant aux espaces fines insécables (« 1 500 FCFA »). */
export function regexFCFA(montant: number): RegExp {
  const groupes = montant.toLocaleString('fr-FR').replace(/\s/g, '\\s?');
  return new RegExp(`${groupes}\\sFCFA`);
}

/** Clique sur « Encaisser » et attend la création de la vente ; renvoie la vente créée. */
export async function encaisser(page: Page) {
  const [reponse] = await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/ventes' && r.request().method() === 'POST'),
    page.getByRole('button', { name: /^Encaisser/ }).click(),
  ]);
  expect(reponse.status()).toBe(201);
  const corps = await reponse.json();
  await expect(page).toHaveURL(/\/caisse\/paiement\/[0-9A-Z]{26}/);
  return corps.vente as { ulid: string; numero: string; paiements: Array<{ ulid: string }> };
}

/** Attend une réponse d'API (méthode + motif de chemin) déclenchée par une action. */
export async function attendreApi(page: Page, methode: string, chemin: RegExp, action: () => Promise<unknown>): Promise<Response> {
  const [r] = await Promise.all([page.waitForResponse((x) => x.request().method() === methode && chemin.test(new URL(x.url()).pathname)), action()]);
  return r;
}

/** Toast (Radix Toast) par titre. */
export function toast(page: Page, titre: string | RegExp) {
  return page.locator('[data-radix-toast-viewport] li, ol[tabindex] > li').filter({ hasText: titre }).first();
}
