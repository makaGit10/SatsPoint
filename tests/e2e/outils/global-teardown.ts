import fs from 'node:fs';
import path from 'node:path';
import { artisan } from '../fixtures';

/** Après la suite (même en cas d'échec) : supprime toutes les données TEST-E2E- et les sessions de test en cache. */
export default async function globalTeardown() {
  const bilan = artisan('e2e:nettoyer', 'TEST-E2E-').trim();
  console.log(`[nettoyage] ${bilan}`);
  const auth = path.resolve(__dirname, '..', '.auth');
  if (fs.existsSync(auth)) {
    for (const f of fs.readdirSync(auth)) if (!f.startsWith('demo-')) fs.rmSync(path.join(auth, f));
  }
}
