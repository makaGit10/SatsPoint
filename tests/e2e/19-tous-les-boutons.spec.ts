import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { creerVente, ecranPret, expect, PREFIXE_TEST, test, tolerer, tolererEchec } from './fixtures';
import { superAdminValide } from './outils/admin';

/**
 * Parcours 19 — Tous les boutons (DIRECTIVES A.3 étape 3) : sur chaque écran, inventaire de tout ce qui est
 * cliquable (boutons, liens, onglets, radios, interrupteurs, cases, listes déroulantes) et clic sur chacun ;
 * un effet précis doit être constaté (navigation, fenêtre, menu, requête réseau, téléchargement, changement d'état
 * ARIA ou de contenu). Les boutons désactivés sont relevés avec leur contexte. Les destructeurs ne sont cliqués
 * que sur des données de test ; leur confirmation est annulée (les deux sens sont vérifiés dans les parcours 04 à 15).
 * Le tableau complet est écrit dans `test-results/boutons-<projet>.json` (repris dans RAPPORT.md).
 */

type Ligne = { ecran: string; element: string; role: string; resultat: 'OK' | 'KO' | 'DÉSACTIVÉ' | 'IGNORÉ'; effet: string };

const SELECTEUR = [
  'button',
  'a[href]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="checkbox"]',
  'input[type="checkbox"]',
  'select',
].join(',');

/** Éléments jamais cliqués par l'inventaire générique (testés ailleurs ou sortants). */
const EXCLUS = /^(Écouter|Me déconnecter|Langue de l'interface|Thème|Thème : (Clair|Sombre)|English|Français|Clair|Sombre|Automatique)$/;
const RAISON_EXCLUS = "préférence du compte, testée dans les parcours 01, 11 et 14 (la changer ici fausserait la suite de l'inventaire)";

async function inventaire(page: Page) {
  return page.evaluate((sel) => {
    const visibles = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => {
      if (e.closest('[data-haut-parleur]') || e.hasAttribute('data-haut-parleur')) return false;
      if (e.closest('[aria-hidden="true"]')) return false;
      const r = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && !(e instanceof HTMLInputElement && e.type === 'hidden');
    });
    return visibles.map((e, index) => {
      const nom = (e.getAttribute('aria-label') || (e as HTMLInputElement).labels?.[0]?.innerText || e.innerText || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const role = e.getAttribute('role') || (e.tagName === 'A' ? 'link' : e.tagName === 'SELECT' ? 'combobox' : e.tagName === 'INPUT' ? 'checkbox' : 'button');
      const desactive = (e as HTMLButtonElement).disabled || e.getAttribute('aria-disabled') === 'true';
      const cible = e.getAttribute('target');
      return { index, nom, role, desactive, cible };
    });
  }, SELECTEUR);
}

async function signature(page: Page) {
  return page.evaluate(() => {
    const etats = [...document.querySelectorAll('[aria-pressed],[aria-checked],[aria-selected],[aria-expanded],[data-state]')]
      .map((e) => `${e.getAttribute('aria-pressed')}${e.getAttribute('aria-checked')}${e.getAttribute('aria-selected')}${e.getAttribute('aria-expanded')}${e.getAttribute('data-state')}`)
      .join('|');
    const cases = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map((c) => (c.checked ? 1 : 0)).join('');
    return [cases, location.pathname + location.search + location.hash, document.querySelectorAll('[role="dialog"],[role="menu"],[role="alertdialog"]').length, document.body.innerText.length, etats, document.documentElement.getAttribute('data-theme'), document.documentElement.lang].join('§');
  });
}

/** Navigation tolérante à une redirection de l'application qui interrompt le chargement (ERR_ABORTED). */
async function aller(page: Page, chemin: string, ecran: string) {
  await page.goto(chemin).catch(async () => page.goto(chemin));
  await ecranPret(page, ecran);
}

async function cliquerTout(page: Page, ecran: string, chemin: string, lignes: Ligne[], dejaVus: Set<string>) {
  await aller(page, chemin, ecran);
  const stockageInitial = await page.evaluate(() => ({ ...localStorage }));
  const liste = await inventaire(page);
  for (const el of liste) {
    const cle = `${el.role}:${el.nom}`;
    if (dejaVus.has(cle)) continue;
    dejaVus.add(cle);
    if (!el.nom) {
      lignes.push({ ecran, element: `(sans nom) #${el.index}`, role: el.role, resultat: 'KO', effet: 'élément cliquable sans nom accessible' });
      continue;
    }
    if (/^(Touche \d+|Effacer — )/.test(el.nom)) {
      lignes.push({ ecran, element: el.nom, role: el.role, resultat: 'IGNORÉ', effet: "touche du pavé : saisie testée chiffre par chiffre dans le parcours 03 (dans l'inventaire, l'ordre des clics atteint le montant maximal puis Échap vide la saisie)" });
      continue;
    }
    if (EXCLUS.test(el.nom)) {
      lignes.push({ ecran, element: el.nom, role: el.role, resultat: 'IGNORÉ', effet: el.nom === 'Me déconnecter' ? 'testé dans le parcours 15' : RAISON_EXCLUS });
      continue;
    }
    if (el.desactive) {
      lignes.push({ ecran, element: el.nom, role: el.role, resultat: 'DÉSACTIVÉ', effet: 'désactivé dans cet état (raison relevée dans RAPPORT.md)' });
      continue;
    }
    // L'écran n'est rechargé que s'il a quitté son état de départ (adresse, fenêtre restée ouverte, élément introuvable) :
    // recharger à chaque clic dépasserait la limite de débit de l'API (240 requêtes / min / utilisateur).
    let actuels = await inventaire(page);
    let rang = actuels.findIndex((x) => x.nom === el.nom && x.role === el.role);
    const ouverte = (await page.locator('[role="dialog"],[role="menu"]').count()) > 0;
    if (rang < 0 || ouverte || new URL(page.url()).pathname + new URL(page.url()).search !== chemin) {
      await page.evaluate((s) => {
        localStorage.clear();
        for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v as string);
      }, stockageInitial);
      await aller(page, chemin, ecran);
      actuels = await inventaire(page);
      rang = actuels.findIndex((x) => x.nom === el.nom && x.role === el.role);
    }
    if (rang < 0) {
      lignes.push({ ecran, element: el.nom, role: el.role, resultat: 'IGNORÉ', effet: "n'apparaît que dans un autre état" });
      continue;
    }
    const elements = await page.evaluateHandle((sel) => {
      return [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => {
        if (e.closest('[data-haut-parleur]') || e.hasAttribute('data-haut-parleur') || e.closest('[aria-hidden="true"]')) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
      });
    }, SELECTEUR);
    const element = (await elements.evaluateHandle((arr, i) => (arr as HTMLElement[])[i], rang)).asElement()!;
    const dejaActif = await element.evaluate((e) => e.getAttribute('aria-checked') === 'true' || e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-current') === 'page');
    if (dejaActif) {
      lignes.push({ ecran, element: el.nom, role: el.role, resultat: 'OK', effet: 'déjà sélectionné (état courant affiché)' });
      continue;
    }
    const avant = await signature(page);
    const pressePapiersAvant = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
    let requetes = 0;
    const surRequete = (r: { url: () => string }) => {
      if (/\/api\/v1\/(cours|paiements\/[0-9A-Z]{26}$)|\/@vite|\.tsx?($|\?)|\.css|\/node_modules\/|\/src\//.test(r.url())) return;
      requetes += 1;
    };
    let telechargement = false;
    let onglet = false;
    const surDl = () => (telechargement = true);
    const surPopup = (p: Page) => {
      onglet = true;
      void p.close();
    };
    page.on('request', surRequete);
    page.on('download', surDl);
    page.on('popup', surPopup);
    let valeurInitiale: string | null = null;
    try {
      if (el.role === 'combobox') {
        valeurInitiale = await element.evaluate((s) => (s as HTMLSelectElement).value);
        // Dernière option différente : la première voisine peut être sans effet visible (ex. « Tous les pays » → Sénégal quand toutes les langues sont sénégalaises).
        const autre = await element.evaluate((s) => [...(s as HTMLSelectElement).options].map((o) => o.value).reverse().find((v) => v !== (s as HTMLSelectElement).value));
        if (autre !== undefined) await element.selectOption(autre);
      } else {
        // Centré à l'écran avant le clic (comme le ferait une personne) : jamais sous l'en-tête collant ni la barre du bas.
        await element.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }));
        await element.click({ timeout: 5_000 });
      }
      let copie = false;
      await expect
        .poll(
          async () => {
            if ((await signature(page)) !== avant || requetes > 0 || telechargement || onglet) return true;
            const pp = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
            copie = pp !== pressePapiersAvant && pp !== '';
            return copie;
          },
          { timeout: 8_000, intervals: [100, 200, 400] },
        )
        .toBe(true);
      const apres = await signature(page);
      const effet = onglet
        ? 'nouvel onglet'
        : telechargement
          ? 'téléchargement'
          : copie
            ? 'copié dans le presse-papiers'
            : apres.split('§')[1] !== avant.split('§')[1]
              ? `navigation → ${apres.split('§')[1]}`
              : Number(apres.split('§')[2]) > Number(avant.split('§')[2])
                ? 'fenêtre / menu ouvert'
                : requetes > 0
                  ? `${requetes} requête(s) réseau`
                  : 'état modifié (ARIA / contenu)';
      lignes.push({ ecran, element: el.nom, role: el.role, resultat: 'OK', effet });
    } catch {
      lignes.push({ ecran, element: el.nom, role: el.role, resultat: 'KO', effet: 'aucun effet constaté en 8 s' });
    } finally {
      page.off('request', surRequete);
      page.off('download', surDl);
      page.off('popup', surPopup);
    }
    // Fenêtre ou menu ouvert par le clic : on le referme.
    await page.keyboard.press('Escape');
    // Préférence enregistrée sur le compte (langue, thème) : on remet la valeur de départ.
    if (valeurInitiale !== null) {
      if (page.url().endsWith(chemin)) {
        const sel = page.locator('select').filter({ has: page.locator(`option[value="${valeurInitiale}"]`) });
        for (const s of await sel.all()) if ((await s.inputValue()) !== valeurInitiale && (await s.isVisible())) await s.selectOption(valeurInitiale).catch(() => undefined);
      }
    }
  }
  await page.evaluate((s) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v as string);
  }, stockageInitial);
}

function ecrire(projet: string, lignes: Ligne[]) {
  const dossier = path.resolve(__dirname, 'test-results');
  fs.mkdirSync(dossier, { recursive: true });
  const fichier = path.join(dossier, `boutons-${projet}.json`);
  const existant: Ligne[] = fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : [];
  fs.writeFileSync(fichier, JSON.stringify([...existant.filter((l) => !lignes.some((n) => n.ecran === l.ecran)), ...lignes], null, 1));
}

test.describe('19 · Tous les boutons', () => {
  test.setTimeout(600_000);

  test('écrans de la boutique (propriétaire, données de test)', async ({ pageProprietaire: page, boutique }, testInfo) => {
    tolerer(page, /\/api\/v1\/.*/, 422);
    tolerer(page, /\/api\/v1\/.*/, 409);
    await boutique.api.patch('/boutique', { reglages: { wave_lien: 'https://pay.wave.com/m/M_e2e_btn/c/sn/', moyens: { lightning: true, paytech: false, wave_manuel: true } } });
    await boutique.api.post('/articles', { nom: `${PREFIXE_TEST} Article`, prix_xof: 500, couleur: '#16A34A' });
    await boutique.api.post('/articles', { nom: `${PREFIXE_TEST} Article 2`, prix_xof: 700, couleur: '#DC2626' });
    const payee = await creerVente(boutique.api, 1000);
    await boutique.api.post(`/paiements/${payee.paiement.ulid}/simuler`);
    await creerVente(boutique.api, 2000);
    const lignes: Ligne[] = [];
    const vus = new Set<string>();
    for (const [chemin, ecran] of [
      ['/caisse', 'caisse'],
      ['/ventes', 'ventes'],
      ['/tableau-de-bord', 'tableau-de-bord'],
      ['/portefeuille', 'portefeuille'],
      ['/articles', 'articles'],
      ['/equipe', 'equipe'],
      ['/reglages', 'reglages'],
      ['/demarrage', 'demarrage'],
      ['/securite/2fa', 'securite-2fa'],
    ] as const) {
      try {
        await cliquerTout(page, ecran, chemin, lignes, vus);
      } finally {
        ecrire(testInfo.project.name, lignes);
      }
    }
    const ko = lignes.filter((l) => l.resultat === 'KO');
    expect(ko, `boutons sans effet : ${JSON.stringify(ko, null, 1)}`).toEqual([]);
  });

  test('écrans publics et console super-admin', async ({ ouvrir }, testInfo) => {
    const lignes: Ligne[] = [];
    const vus = new Set<string>();
    const { page: visiteur, surveillance } = await ouvrir(undefined);
    surveillance.tolerer(/\/api\/v1\/auth\//, 422);
    tolererEchec(visiteur, /ERR_ABORTED/);
    for (const [chemin, ecran] of [
      ['/accueil', 'accueil'],
      ['/connexion', 'connexion'],
      ['/inscription', 'inscription'],
      ['/mot-de-passe/oubli', 'oubli'],
    ] as const) {
      try {
        await cliquerTout(visiteur, ecran, chemin, lignes, vus);
      } finally {
        ecrire(`${testInfo.project.name}-public-admin`, lignes);
      }
    }
    const admin = await superAdminValide();
    const { page } = await ouvrir(admin.etat);
    tolerer(page, /\/api\/v1\/.*/, 422);
    for (const [chemin, ecran] of [
      ['/admin', 'admin'],
      ['/admin?onglet=boutiques', 'admin'],
      ['/admin?onglet=sante', 'admin'],
      ['/admin?onglet=journal', 'admin'],
      ['/admin/studio', 'studio'],
    ] as const) {
      try {
        await cliquerTout(page, ecran, chemin, lignes, vus);
      } finally {
        ecrire(`${testInfo.project.name}-public-admin`, lignes);
      }
    }
    const ko = lignes.filter((l) => l.resultat === 'KO');
    expect(ko, `boutons sans effet : ${JSON.stringify(ko, null, 1)}`).toEqual([]);
  });
});
