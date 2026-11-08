import fs from 'node:fs';
import path from 'node:path';

/**
 * Lit les mots de passe des comptes de démo dans le `.env` racine (non versionné) s'ils ne sont pas
 * déjà fournis par l'environnement. Rien n'est jamais écrit ni affiché.
 */
export function chargerEnvRacine() {
  const fichier = path.resolve(__dirname, '..', '..', '..', '.env');
  if (!fs.existsSync(fichier)) return;
  const valeurs: Record<string, string> = {};
  for (const ligne of fs.readFileSync(fichier, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(ligne.trim());
    if (!m) continue;
    let v = m[2]!;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    valeurs[m[1]!] = v;
  }
  process.env.E2E_MDP_DEMO ??= valeurs.DEMO_PASSWORD;
  process.env.E2E_MDP_ADMIN ??= valeurs.SUPERADMIN_PASSWORD;
  process.env.E2E_ADMIN_EMAIL ??= valeurs.SUPERADMIN_EMAIL;
}
