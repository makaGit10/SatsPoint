import * as OTPAuth from 'otpauth';
import path from 'node:path';
import { expect } from '@playwright/test';
import { ClientApi, creerCompteTest, suffixe, type Compte } from '../fixtures';

/** Code TOTP (6 chiffres, 30 s, SHA-1) ; `decalage` en périodes (1 = période suivante, acceptée par la fenêtre ± 30 s). */
export function codeTotp(secret: string, decalage = 0): string {
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret.replace(/\s+/g, '').toUpperCase()), digits: 6, period: 30, algorithm: 'SHA1' });
  return totp.generate({ timestamp: Date.now() + decalage * 30_000 });
}

export type SuperAdminTest = { compte: Compte; api: ClientApi; etat: string; secret: string; codesSecours: string[] };

/** Super-admin DE TEST (jamais le compte réel) avec 2FA activée et validée dans sa session (par l'API). */
export async function superAdminValide(): Promise<SuperAdminTest> {
  const compte = creerCompteTest(`Super-admin ${suffixe()}`, { superAdmin: true });
  const api = await ClientApi.connecte(compte);
  const init = await api.post('/auth/2fa/initialiser');
  expect(init.status, init.texte).toBe(200);
  const secret = init.json.secret as string;
  const activation = await api.post('/auth/2fa/activer', { code: codeTotp(secret) });
  expect(activation.status, activation.texte).toBe(200);
  const etat = await api.etat(path.resolve(__dirname, '..', '.auth', `admin-${suffixe()}.json`));
  return { compte, api, etat, secret, codesSecours: activation.json.codes_secours };
}

/** Fichier WAV mono 16 bits de `duree` secondes (sinusoïde 440 Hz), pour le dépôt d'audio. */
export function wav(duree = 1.2, frequence = 440): Buffer {
  const taux = 16_000;
  const n = Math.floor(taux * duree);
  const donnees = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i += 1) donnees.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequence * i) / taux) * 12_000), i * 2);
  const entete = Buffer.alloc(44);
  entete.write('RIFF', 0);
  entete.writeUInt32LE(36 + donnees.length, 4);
  entete.write('WAVE', 8);
  entete.write('fmt ', 12);
  entete.writeUInt32LE(16, 16);
  entete.writeUInt16LE(1, 20);
  entete.writeUInt16LE(1, 22);
  entete.writeUInt32LE(taux, 24);
  entete.writeUInt32LE(taux * 2, 28);
  entete.writeUInt16LE(2, 32);
  entete.writeUInt16LE(16, 34);
  entete.write('data', 36);
  entete.writeUInt32LE(donnees.length, 40);
  return Buffer.concat([entete, donnees]);
}

/** Dépose un audio (multipart) puis attend la fin du traitement serveur (file `audio`, ffmpeg) ; renvoie l'audio. */
export async function deposerAudio(admin: SuperAdminTest, cle: string, langue: string) {
  const cookie = (await admin.api.ctx.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN');
  const r = await admin.api.ctx.post('/api/v1/admin/audio', {
    headers: { 'X-XSRF-TOKEN': cookie ? decodeURIComponent(cookie.value) : '' },
    multipart: { cle, langue, fichier: { name: `${cle}.wav`, mimeType: 'audio/wav', buffer: wav() } },
  });
  expect([201, 202], await r.text()).toContain(r.status());
  const id = (await r.json()).audio.id as number;
  await expect
    .poll(async () => (await admin.api.get(`/admin/audio/${id}`)).json?.audio?.statut, { timeout: 60_000, intervals: [500, 1000, 2000] })
    .toBe('brouillon');
  return id;
}

/** Publie des brouillons et vérifie qu'ils sont dans le manifeste public de la langue. */
export async function publierAudios(admin: SuperAdminTest, ids: number[], langue: string, cles: string[]) {
  const r = await admin.api.post('/admin/audio/publier', { ids });
  expect(r.status, r.texte).toBe(200);
  const anonyme = await ClientApi.anonyme();
  await expect.poll(async () => Object.keys((await anonyme.get(`/api/v1/audio/manifeste/${langue}`)).json?.audios ?? {})).toEqual(expect.arrayContaining(cles));
  await anonyme.fermer();
}
