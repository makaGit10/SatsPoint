import { describe, expect, it } from 'vitest';
import { PortefeuilleMock } from '../src/portefeuilles/mock.js';
import { factureDepuisTransaction, transactionNormalisee } from '../src/portefeuilles/nwc.js';
import type { TypesNwc } from '../src/portefeuilles/alby.js';
import { journalSilencieux } from './aide.js';

function transaction(surcharge: Partial<TypesNwc.Nip47Transaction>): TypesNwc.Nip47Transaction {
  return {
    type: 'incoming',
    state: 'pending',
    invoice: '',
    description: 'test',
    description_hash: '',
    preimage: '',
    payment_hash: 'a'.repeat(64),
    amount: 1000,
    fees_paid: 0,
    settled_at: 0,
    created_at: 1_800_000_000,
    expires_at: 1_800_000_600,
    ...surcharge,
  };
}

describe('Normalisation des réponses NIP-47', () => {
  it('facture en attente → en_attente sans preimage ; réglée → reglee avec preimage et regle_le', () => {
    const futur = Math.floor(Date.now() / 1000) + 600;
    const attente = factureDepuisTransaction(transaction({ expires_at: futur }), 'a'.repeat(64));
    expect(attente).toEqual({ payment_hash: 'a'.repeat(64), statut: 'en_attente', montant_msats: 1000, expire_le: new Date(futur * 1000).toISOString() });
    const reglee = factureDepuisTransaction(transaction({ state: 'settled', settled_at: 1_800_000_100, preimage: 'B'.repeat(64), expires_at: futur }));
    expect(reglee).toMatchObject({ statut: 'reglee', preimage: 'b'.repeat(64), regle_le: '2027-01-15T08:01:40.000Z' });
  });

  it('facture expirée → expiree', () => {
    const passe = Math.floor(Date.now() / 1000) - 10;
    expect(factureDepuisTransaction(transaction({ expires_at: passe })).statut).toBe('expiree');
  });

  it('complète montant et expiration depuis le BOLT11 quand le portefeuille renvoie 0 (cas Coinos)', async () => {
    const mock = new PortefeuilleMock({ journal: journalSilencieux });
    const f = await mock.makeInvoice({ montant_msats: 225_000, description: 'SatsPoint test', expiration_s: 600 });
    const facture = factureDepuisTransaction(transaction({ payment_hash: f.payment_hash, invoice: f.bolt11, amount: 0, expires_at: 0, created_at: 0 }), f.payment_hash);
    expect(facture.montant_msats).toBe(225_000);
    expect(facture.statut).toBe('en_attente');
    expect(facture.expire_le).toBe(f.expire_le);
  });

  it('refuse une réponse portant un autre payment_hash que celui demandé', () => {
    expect(() => factureDepuisTransaction(transaction({ payment_hash: 'c'.repeat(64) }), 'a'.repeat(64))).toThrow(/autre facture/);
    expect(() => factureDepuisTransaction(transaction({ payment_hash: 'pas-un-hash' }))).toThrow();
  });

  it('transactions : type, statut, frais, dates', () => {
    const entrante = transactionNormalisee(transaction({ state: 'settled', settled_at: 1_800_000_100 }));
    expect(entrante).toEqual({
      type: 'entrante',
      statut: 'reglee',
      montant_msats: 1000,
      frais_msats: 0,
      description: 'test',
      payment_hash: 'a'.repeat(64),
      regle_le: '2027-01-15T08:01:40.000Z',
      cree_le: '2027-01-15T08:00:00.000Z',
    });
    expect(transactionNormalisee(transaction({ type: 'outgoing', state: 'failed', fees_paid: 12 }))).toMatchObject({ type: 'sortante', statut: 'echouee', frais_msats: 12, regle_le: null });
    expect(transactionNormalisee(transaction({ type: 'outgoing', state: 'pending' })).statut).toBe('en_attente');
  });
});
