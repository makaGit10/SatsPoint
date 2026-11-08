import { describe, expect, it } from 'vitest';
import {
  calculerSignature,
  comparerTempsConstant,
  construireMessage,
  genererNonce,
  MagasinNonces,
  sha256Hex,
  signer,
  VerificateurHmac,
} from '../src/securite/hmac.js';

const SECRET = 'secret-hmac-de-test-0123456789';

function verificateur(maintenantMs = 1_700_000_000_000) {
  return { v: new VerificateurHmac(SECRET, { maintenant: () => maintenantMs }), maintenantMs };
}

describe('HMAC — construction du message (contrat § 1)', () => {
  it('suit exactement timestamp.nonce.METHODE.chemin.sha256(corps)', () => {
    const corps = '{"uri":"mock://demo"}';
    const message = construireMessage({ timestamp: 1700000000, nonce: 'ab'.repeat(16), methode: 'put', chemin: '/connexions/x?a=1', corps });
    expect(message).toBe(`1700000000.${'ab'.repeat(16)}.PUT./connexions/x?a=1.${sha256Hex(corps)}`);
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('signer() produit des en-têtes vérifiables et un nonce de 16 octets', () => {
    const { v, maintenantMs } = verificateur();
    const enTetes = signer(SECRET, { methode: 'POST', chemin: '/x', corps: '{}', timestamp: Math.floor(maintenantMs / 1000) });
    expect(enTetes['X-SP-Nonce']).toMatch(/^[0-9a-f]{32}$/);
    expect(enTetes['X-SP-Signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(
      v.verifier({
        methode: 'POST',
        chemin: '/x',
        corps: '{}',
        enTetes: { timestamp: enTetes['X-SP-Timestamp'], nonce: enTetes['X-SP-Nonce'], signature: enTetes['X-SP-Signature'] },
      }),
    ).toEqual({ ok: true });
  });
});

describe('HMAC — vérification', () => {
  function requeteValide(maintenantMs: number, surcharge: Partial<{ timestamp: number; nonce: string; corps: string; chemin: string }> = {}) {
    const timestamp = surcharge.timestamp ?? Math.floor(maintenantMs / 1000);
    const nonce = surcharge.nonce ?? genererNonce();
    const corps = surcharge.corps ?? '{"a":1}';
    const chemin = surcharge.chemin ?? '/connexions/demo/factures';
    const signature = calculerSignature(SECRET, construireMessage({ timestamp, nonce, methode: 'POST', chemin, corps }));
    return { methode: 'POST', chemin, corps, enTetes: { timestamp: String(timestamp), nonce, signature } };
  }

  it('accepte une requête valide', () => {
    const { v, maintenantMs } = verificateur();
    expect(v.verifier(requeteValide(maintenantMs))).toEqual({ ok: true });
  });

  it('accepte un horodatage dans la fenêtre de 30 s (±29 s)', () => {
    const { v, maintenantMs } = verificateur();
    expect(v.verifier(requeteValide(maintenantMs, { timestamp: Math.floor(maintenantMs / 1000) - 29 }))).toEqual({ ok: true });
    expect(v.verifier(requeteValide(maintenantMs, { timestamp: Math.floor(maintenantMs / 1000) + 29 }))).toEqual({ ok: true });
  });

  it('refuse un horodatage périmé (> 30 s, passé ou futur)', () => {
    const { v, maintenantMs } = verificateur();
    expect(v.verifier(requeteValide(maintenantMs, { timestamp: Math.floor(maintenantMs / 1000) - 31 }))).toEqual({ ok: false, raison: 'HORODATAGE_PERIME' });
    expect(v.verifier(requeteValide(maintenantMs, { timestamp: Math.floor(maintenantMs / 1000) + 31 }))).toEqual({ ok: false, raison: 'HORODATAGE_PERIME' });
  });

  it('refuse un nonce rejoué (même après signature valide)', () => {
    const { v, maintenantMs } = verificateur();
    const r = requeteValide(maintenantMs);
    expect(v.verifier(r)).toEqual({ ok: true });
    expect(v.verifier(r)).toEqual({ ok: false, raison: 'NONCE_REJOUE' });
  });

  it('un nonce refusé pour mauvaise signature n’est pas consommé', () => {
    const { v, maintenantMs } = verificateur();
    const r = requeteValide(maintenantMs);
    const falsifiee = { ...r, enTetes: { ...r.enTetes, signature: 'f'.repeat(64) } };
    expect(v.verifier(falsifiee)).toEqual({ ok: false, raison: 'SIGNATURE_INVALIDE' });
    expect(v.verifier(r)).toEqual({ ok: true });
  });

  it('refuse une signature fausse, un mauvais secret, un corps ou un chemin modifié', () => {
    const { v, maintenantMs } = verificateur();
    const r = requeteValide(maintenantMs);
    expect(v.verifier({ ...r, enTetes: { ...r.enTetes, signature: 'a'.repeat(64) } })).toEqual({ ok: false, raison: 'SIGNATURE_INVALIDE' });
    expect(v.verifier({ ...r, corps: '{"a":2}' })).toEqual({ ok: false, raison: 'SIGNATURE_INVALIDE' });
    expect(v.verifier({ ...r, chemin: '/connexions/autre/factures' })).toEqual({ ok: false, raison: 'SIGNATURE_INVALIDE' });
    expect(v.verifier({ ...r, methode: 'GET' })).toEqual({ ok: false, raison: 'SIGNATURE_INVALIDE' });
    const autre = new VerificateurHmac('un-autre-secret-0123456789', { maintenant: () => maintenantMs });
    expect(autre.verifier(r)).toEqual({ ok: false, raison: 'SIGNATURE_INVALIDE' });
  });

  it('refuse les en-têtes manquants ou mal formés', () => {
    const { v, maintenantMs } = verificateur();
    const r = requeteValide(maintenantMs);
    expect(v.verifier({ ...r, enTetes: { ...r.enTetes, signature: undefined } })).toEqual({ ok: false, raison: 'EN_TETE_MANQUANT' });
    expect(v.verifier({ ...r, enTetes: { ...r.enTetes, timestamp: 'hier' } })).toEqual({ ok: false, raison: 'HORODATAGE_INVALIDE' });
    expect(v.verifier({ ...r, enTetes: { ...r.enTetes, nonce: 'court' } })).toEqual({ ok: false, raison: 'NONCE_INVALIDE' });
    expect(v.verifier({ ...r, enTetes: { ...r.enTetes, signature: 'pas-hex' } })).toEqual({ ok: false, raison: 'SIGNATURE_INVALIDE' });
  });

  it('refuse un secret trop court à la construction', () => {
    expect(() => new VerificateurHmac('court')).toThrow();
  });
});

describe('MagasinNonces', () => {
  it('oublie un nonce après 5 minutes', () => {
    const m = new MagasinNonces(5 * 60 * 1000);
    const t0 = 1_000_000;
    expect(m.consommer('abc', t0)).toBe(true);
    expect(m.consommer('abc', t0 + 60_000)).toBe(false);
    expect(m.consommer('abc', t0 + 5 * 60_000 + 1)).toBe(true);
  });

  it('borne sa capacité', () => {
    const m = new MagasinNonces(60_000, 10);
    for (let i = 0; i < 25; i++) m.consommer(`n${i}`, 1_000 + i);
    expect(m.taille).toBeLessThanOrEqual(10);
  });
});

describe('comparerTempsConstant', () => {
  it('compare correctement', () => {
    expect(comparerTempsConstant('abc', 'abc')).toBe(true);
    expect(comparerTempsConstant('abc', 'abd')).toBe(false);
    expect(comparerTempsConstant('abc', 'abcd')).toBe(false);
  });
});
