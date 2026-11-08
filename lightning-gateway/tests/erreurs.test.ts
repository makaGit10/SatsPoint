import { describe, expect, it } from 'vitest';
import { CODES_ERREUR, ErreurPasserelle, erreur } from '../src/erreurs.js';
import { nwc } from '../src/portefeuilles/alby.js';
import { PortefeuilleNwc, traduireErreurNwc } from '../src/portefeuilles/nwc.js';
import { avecDelai } from '../src/utils/delai.js';
import { appTest, injecterSigne, journalSilencieux } from './aide.js';

describe('Erreurs typées', () => {
  it('chaque code a un statut HTTP et une forme JSON { erreur: { code, message } }', () => {
    for (const code of Object.keys(CODES_ERREUR) as Array<keyof typeof CODES_ERREUR>) {
      const e = erreur(code);
      expect(e.statut).toBe(CODES_ERREUR[code]);
      expect(e.versJson()).toEqual({ erreur: { code, message: expect.any(String) } });
      expect(e).toBeInstanceOf(ErreurPasserelle);
    }
    expect(CODES_ERREUR.CONNEXION_INCONNUE).toBe(404);
    expect(CODES_ERREUR.DELAI_DEPASSE).toBe(504);
    expect(CODES_ERREUR.PORTEFEUILLE_INJOIGNABLE).toBe(502);
  });

  it('avecDelai lève DELAI_DEPASSE au-delà du délai et laisse passer une réponse rapide', async () => {
    const lente = new Promise<string>((r) => setTimeout(() => r('tard'), 200));
    await expect(avecDelai(lente, 20, 'test')).rejects.toMatchObject({ code: 'DELAI_DEPASSE', statut: 504 });
    await expect(avecDelai(Promise.resolve('vite'), 100)).resolves.toBe('vite');
    await expect(avecDelai(Promise.reject(erreur('INTERNE')), 100)).rejects.toMatchObject({ code: 'INTERNE' });
  });

  it('traduit les erreurs du SDK NWC vers les codes du contrat', () => {
    const cas: Array<[Error, string]> = [
      [new nwc.Nip47WalletError('x', 'INSUFFICIENT_BALANCE'), 'SOLDE_INSUFFISANT'],
      [new nwc.Nip47WalletError('x', 'QUOTA_EXCEEDED'), 'BUDGET_DEPASSE'],
      [new nwc.Nip47WalletError('x', 'RESTRICTED'), 'PERMISSION_MANQUANTE'],
      [new nwc.Nip47WalletError('x', 'UNAUTHORIZED'), 'PERMISSION_MANQUANTE'],
      [new nwc.Nip47WalletError('x', 'NOT_IMPLEMENTED'), 'PERMISSION_MANQUANTE'],
      [new nwc.Nip47WalletError('x', 'NOT_FOUND'), 'FACTURE_INCONNUE'],
      [new nwc.Nip47WalletError('x', 'PAYMENT_FAILED'), 'PAIEMENT_ECHOUE'],
      [new nwc.Nip47WalletError('x', 'OTHER'), 'INTERNE'],
      [new nwc.Nip47ReplyTimeoutError('x', 'INTERNAL'), 'DELAI_DEPASSE'],
      [new nwc.Nip47PublishTimeoutError('x', 'INTERNAL'), 'DELAI_DEPASSE'],
      [new nwc.Nip47NetworkError('x', 'OTHER'), 'PORTEFEUILLE_INJOIGNABLE'],
      [new nwc.Nip47PublishError('x', 'OTHER'), 'PORTEFEUILLE_INJOIGNABLE'],
      [new nwc.Nip47UnsupportedEncryptionError('x', 'OTHER'), 'PORTEFEUILLE_INJOIGNABLE'],
      [new nwc.Nip47ResponseDecodingError('x', 'INTERNAL'), 'INTERNE'],
      [new Error('failed to connect to relay'), 'PORTEFEUILLE_INJOIGNABLE'],
      [new Error('no info event (kind 13194) returned from relay'), 'PORTEFEUILLE_INJOIGNABLE'],
      [new Error('autre chose'), 'INTERNE'],
      [erreur('FACTURE_INVALIDE'), 'FACTURE_INVALIDE'],
    ];
    for (const [entree, attendu] of cas) {
      const e = traduireErreurNwc(entree) as ErreurPasserelle;
      expect(e.code, entree.message).toBe(attendu);
    }
  });

  it('analyserUri accepte une URI NWC bien formée et refuse les autres', () => {
    const pubkey = 'b'.repeat(64);
    const secret = 'c'.repeat(64);
    const ok = PortefeuilleNwc.analyserUri(`nostr+walletconnect://${pubkey}?relay=wss%3A%2F%2Frelais.test&secret=${secret}&lud16=awa%40exemple.test`);
    expect(ok).toEqual({ pubkey, relais: 'wss://relais.test/' });
    expect(() => PortefeuilleNwc.analyserUri(`nostr+walletconnect://${pubkey}?relay=wss://relais.test`)).toThrow(/secret/i);
    expect(() => PortefeuilleNwc.analyserUri(`nostr+walletconnect://${pubkey}?secret=${secret}`)).toThrow(/URI/);
    expect(() => PortefeuilleNwc.analyserUri(`nostr+walletconnect://${pubkey}?relay=https://relais.test&secret=${secret}`)).toThrow(/ws/);
    expect(() => PortefeuilleNwc.analyserUri(`mock://demo`)).toThrow(/nostr\+walletconnect/);
  });

  it('un relais injoignable donne PORTEFEUILLE_INJOIGNABLE sans bloquer les autres connexions', async () => {
    const app = await appTest();
    await app.ready();
    const uri = `nostr+walletconnect://${'d'.repeat(64)}?relay=ws%3A%2F%2F127.0.0.1%3A9&secret=${'e'.repeat(64)}`;
    const debut = Date.now();
    const [injoignable, mock] = await Promise.all([
      injecterSigne(app, { method: 'PUT', url: '/connexions/injoignable', payload: { uri } }),
      injecterSigne(app, { method: 'PUT', url: '/connexions/demo', payload: { uri: 'mock://demo' } }),
    ]);
    expect(mock.statusCode).toBe(200);
    expect(injoignable.statusCode).toBe(502);
    expect(injoignable.json().erreur.code).toBe('PORTEFEUILLE_INJOIGNABLE');
    expect(Date.now() - debut).toBeLessThan(15_000);
    const sante = await app.inject({ method: 'GET', url: '/sante' });
    expect(sante.json().connexions).toBe(1); // la connexion en échec n'est pas mémorisée
    await app.close();
    void journalSilencieux;
  }, 30_000);
});
