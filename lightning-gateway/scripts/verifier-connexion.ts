/**
 * Vérification réelle (lecture seule + une facture) d'un portefeuille NWC via la passerelle.
 *
 * Lit `DEMO_NWC_URI` et `GATEWAY_HMAC_SECRET` dans le fichier .env de SatsPoint (par défaut ../.env),
 * puis enchaîne : PUT /connexions/demo → GET solde → POST factures (225 000 msats = 100 FCFA) →
 * GET factures/{hash} → DELETE /connexions/demo. N'appelle JAMAIS pay_invoice.
 * L'URI n'est jamais affichée ni copiée ailleurs qu'en mémoire.
 *
 *   npx tsx scripts/verifier-connexion.ts [--env C:\SatsPoint\.env] [--url http://127.0.0.1:3011] [--id demo]
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signer } from '../src/securite/hmac.js';

type Argument = { env: string; url: string; id: string };

function lireArguments(): Argument {
  const ici = dirname(fileURLToPath(import.meta.url));
  const defaut: Argument = { env: resolve(ici, '..', '..', '.env'), url: process.env['GATEWAY_URL'] ?? 'http://127.0.0.1:3011', id: 'demo' };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--env' && v) defaut.env = resolve(v), i++;
    else if (a === '--url' && v) defaut.url = v, i++;
    else if (a === '--id' && v) defaut.id = v, i++;
  }
  return defaut;
}

function lireEnv(chemin: string): Record<string, string> {
  const resultat: Record<string, string> = {};
  for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(ligne);
    if (!m) continue;
    let valeur = m[2] ?? '';
    if ((valeur.startsWith('"') && valeur.endsWith('"')) || (valeur.startsWith("'") && valeur.endsWith("'"))) valeur = valeur.slice(1, -1);
    resultat[m[1] ?? ''] = valeur;
  }
  return resultat;
}

type Etape = { nom: string; duree_ms: number; statut: number; ok: boolean };
const etapes: Etape[] = [];

async function appeler(
  base: string,
  secret: string,
  methode: 'GET' | 'POST' | 'PUT' | 'DELETE',
  chemin: string,
  corps?: unknown,
): Promise<{ statut: number; json: unknown; duree_ms: number }> {
  const corpsBrut = corps === undefined ? '' : JSON.stringify(corps);
  const enTetes: Record<string, string> = { Accept: 'application/json', ...signer(secret, { methode, chemin, corps: corpsBrut }) };
  if (corps !== undefined) enTetes['Content-Type'] = 'application/json';
  const debut = performance.now();
  const reponse = await fetch(`${base}${chemin}`, { method: methode, headers: enTetes, body: corps === undefined ? undefined : corpsBrut, signal: AbortSignal.timeout(30_000) });
  const duree_ms = Math.round(performance.now() - debut);
  const texte = await reponse.text();
  let json: unknown = null;
  try {
    json = texte ? JSON.parse(texte) : null;
  } catch {
    json = { brut: texte.slice(0, 200) };
  }
  return { statut: reponse.status, json, duree_ms };
}

function noter(nom: string, r: { statut: number; duree_ms: number }, attendu: number): boolean {
  const ok = r.statut === attendu;
  etapes.push({ nom, duree_ms: r.duree_ms, statut: r.statut, ok });
  console.log(`${ok ? 'OK ' : 'KO '} ${nom.padEnd(42)} ${String(r.statut).padStart(3)}  ${String(r.duree_ms).padStart(6)} ms`);
  return ok;
}

async function principal(): Promise<number> {
  const args = lireArguments();
  const env = lireEnv(args.env);
  const uri = env['DEMO_NWC_URI'] ?? '';
  const secret = process.env['GATEWAY_HMAC_SECRET'] ?? env['GATEWAY_HMAC_SECRET'] ?? '';
  if (!uri.startsWith('nostr+walletconnect://') && !uri.startsWith('nostrwalletconnect://')) {
    console.error('DEMO_NWC_URI absente ou non NWC dans le fichier .env : rien à vérifier.');
    return 2;
  }
  if (secret.length < 16) {
    console.error('GATEWAY_HMAC_SECRET introuvable (fichier .env ou variable d’environnement).');
    return 2;
  }
  console.log(`Passerelle : ${args.url}  —  connexion « ${args.id} »  —  .env : ${args.env}`);
  console.log('(l’URI NWC n’est jamais affichée ; aucun pay_invoice ne sera appelé)\n');

  const sante = await fetch(`${args.url}/sante`, { signal: AbortSignal.timeout(5_000) }).then((r) => r.json() as Promise<{ ok: boolean }>).catch(() => null);
  if (!sante?.ok) {
    console.error(`La passerelle ne répond pas sur ${args.url}/sante — lancez-la d’abord (npm run dev).`);
    return 2;
  }

  // 1. Enregistrement (get_info réel)
  const put = await appeler(args.url, secret, 'PUT', `/connexions/${args.id}`, { uri });
  if (!noter('PUT /connexions/{id} (get_info)', put, 200)) {
    console.error('  réponse :', JSON.stringify(put.json));
    return 1;
  }
  const info = put.json as { pubkey: string; relais: string[]; alias: string; methods: string[]; notifications: string[]; lud16?: string; mock: boolean };
  console.log(`    pubkey ${info.pubkey.slice(0, 16)}…  relais ${info.relais.join(', ')}  alias « ${info.alias} »`);
  console.log(`    methods ${info.methods.join(' ')}`);
  console.log(`    notifications ${info.notifications.join(' ') || '(aucune)'}  lud16 ${info.lud16 ?? '-'}  mock ${info.mock}`);
  if (info.methods.includes('pay_invoice')) console.log('    attention : ce portefeuille autorise pay_invoice (non utilisé ici).');

  // 2. Solde
  const solde = await appeler(args.url, secret, 'GET', `/connexions/${args.id}/solde`);
  if (noter('GET /connexions/{id}/solde (get_balance)', solde, 200)) {
    const msats = (solde.json as { msats: number }).msats;
    console.log(`    solde ${msats} msats (${Math.floor(msats / 1000)} sats)`);
  } else console.error('  réponse :', JSON.stringify(solde.json));

  // 3. Facture 100 FCFA
  const facture = await appeler(args.url, secret, 'POST', `/connexions/${args.id}/factures`, { montant_msats: 225_000, description: 'SatsPoint test', expiration_s: 600 });
  let hash = '';
  if (noter('POST /connexions/{id}/factures (make_invoice)', facture, 201)) {
    const f = facture.json as { bolt11: string; payment_hash: string; montant_msats: number; cree_le: string; expire_le: string };
    hash = f.payment_hash;
    console.log(`    payment_hash ${hash.slice(0, 8)}…  bolt11 ${f.bolt11.slice(0, 12)}… (${f.bolt11.length} car.)  montant ${f.montant_msats} msats`);
    console.log(`    créée ${f.cree_le}  expire ${f.expire_le}`);
  } else console.error('  réponse :', JSON.stringify(facture.json));

  // 4. Lookup → en_attente
  if (hash) {
    const lookup = await appeler(args.url, secret, 'GET', `/connexions/${args.id}/factures/${hash}`);
    if (noter('GET /connexions/{id}/factures/{hash} (lookup)', lookup, 200)) {
      const l = lookup.json as { statut: string; montant_msats: number };
      console.log(`    statut ${l.statut}  montant ${l.montant_msats} msats  ${l.statut === 'en_attente' ? '(attendu)' : '(inattendu !)'}`);
      if (l.statut !== 'en_attente') etapes.push({ nom: 'statut en_attente', duree_ms: 0, statut: 0, ok: false });
    } else console.error('  réponse :', JSON.stringify(lookup.json));
  }

  // 5. Nettoyage côté passerelle (ne touche pas au portefeuille)
  const del = await appeler(args.url, secret, 'DELETE', `/connexions/${args.id}`);
  noter('DELETE /connexions/{id}', del, 204);

  const total = etapes.reduce((s, e) => s + e.duree_ms, 0);
  const echecs = etapes.filter((e) => !e.ok).length;
  console.log(`\n${etapes.length} étapes, ${echecs} échec(s), ${total} ms cumulés.`);
  return echecs === 0 ? 0 : 1;
}

principal()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    console.error('Erreur :', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
