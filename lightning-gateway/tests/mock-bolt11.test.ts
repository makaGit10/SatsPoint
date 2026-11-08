import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { decoderBolt11, factureExpiree, normaliserBolt11, ressembleABolt11 } from '../src/portefeuilles/bolt11.js';
import { PortefeuilleMock, SOLDE_INITIAL_MSATS } from '../src/portefeuilles/mock.js';
import { journalSilencieux } from './aide.js';

const require = createRequire(import.meta.url);
const bolt11Lib = require('bolt11') as typeof import('bolt11');

describe('PortefeuilleMock — factures BOLT11 regtest', () => {
  it('produit une facture lnbcrt signée, décodable par light-bolt11-decoder et par bolt11', async () => {
    const mock = new PortefeuilleMock({ journal: journalSilencieux });
    const info = await mock.getInfo();
    const f = await mock.makeInvoice({ montant_msats: 225_000, description: 'SatsPoint test', expiration_s: 600 });
    expect(f.bolt11.startsWith('lnbcrt')).toBe(true);
    const d = decoderBolt11(f.bolt11);
    expect(d).toMatchObject({ reseau: 'bcrt', payment_hash: f.payment_hash, montant_msats: 225_000, description: 'SatsPoint test', expiration_s: 600 });
    const complet = bolt11Lib.decode(f.bolt11);
    expect(complet.payeeNodeKey).toBe(info.pubkey); // signature valide → clé du nœud recouvrée = clé de test
    expect(complet.millisatoshis).toBe('225000');
    expect(normaliserBolt11(`LIGHTNING:${f.bolt11.toUpperCase()}`)).toBe(f.bolt11);
    expect(ressembleABolt11(f.bolt11)).toBe(true);
    expect(ressembleABolt11('awa@exemple.test')).toBe(false);
  });

  it('expire les factures selon l’horloge', async () => {
    let maintenant = 1_800_000_000;
    const mock = new PortefeuilleMock({ journal: journalSilencieux, maintenantS: () => maintenant });
    const f = await mock.makeInvoice({ montant_msats: 1_000, description: '', expiration_s: 60 });
    expect((await mock.lookupInvoice(f.payment_hash)).statut).toBe('en_attente');
    maintenant += 61;
    expect((await mock.lookupInvoice(f.payment_hash)).statut).toBe('expiree');
    expect(factureExpiree(decoderBolt11(f.bolt11), maintenant)).toBe(true);
    expect(() => mock.payer(f.payment_hash)).toThrow(/expirée/);
    await expect(mock.payInvoice({ bolt11: f.bolt11 })).rejects.toMatchObject({ code: 'FACTURE_INVALIDE' });
  });

  it('payer() crédite le solde, fournit la preimage et notifie une seule fois', async () => {
    const mock = new PortefeuilleMock({ journal: journalSilencieux });
    const notifications: string[] = [];
    await mock.onNotification((n) => notifications.push(n.type));
    const f = await mock.makeInvoice({ montant_msats: 5_000, description: 'x', expiration_s: 600 });
    expect(mock.payer(f.payment_hash)).toEqual({ deja_reglee: false });
    expect(mock.payer(f.payment_hash)).toEqual({ deja_reglee: true });
    await new Promise((r) => setImmediate(r));
    expect(notifications).toEqual(['payment_received']);
    expect((await mock.getBalance()).msats).toBe(SOLDE_INITIAL_MSATS + 5_000);
    expect(() => mock.payer('f'.repeat(64))).toThrow(/inconnue/i);
  });

  it('rejette les factures sans montant si montant_msats manque, accepte sinon', async () => {
    const mock = new PortefeuilleMock({ journal: journalSilencieux });
    const sansMontant = bolt11Lib.sign(
      bolt11Lib.encode({ network: { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, validWitnessVersions: [0, 1] }, tags: [{ tagName: 'payment_hash', data: 'a'.repeat(64) }, { tagName: 'description', data: 'libre' }] }),
      Buffer.from('1'.repeat(64), 'hex'),
    ).paymentRequest!;
    expect(decoderBolt11(sansMontant).montant_msats).toBeNull();
    await expect(mock.payInvoice({ bolt11: sansMontant })).rejects.toMatchObject({ code: 'FACTURE_INVALIDE' });
    const r = await mock.payInvoice({ bolt11: sansMontant, montant_msats: 3_000 });
    expect(r.montant_msats).toBe(3_000);
    expect(r.payment_hash).toBe('a'.repeat(64));
  });

  it('decoderBolt11 refuse les entrées invalides avec FACTURE_INVALIDE', () => {
    for (const entree of ['', 'lnbc1garbage', 'bonjour', 'lnbc' + 'q'.repeat(5000), 'lnxx1qqq']) {
      expect(() => decoderBolt11(entree), entree.slice(0, 20)).toThrow(expect.objectContaining({ code: 'FACTURE_INVALIDE' }));
    }
  });
});
