import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { contenuQrLightning, libelleMethode } from './methodes'

describe('formatage du reçu et de la demande de paiement', () => {
  const t = (cle: string) => i18n.t(cle)

  it('libellé du moyen de paiement en FR puis EN', async () => {
    await i18n.changeLanguage('fr')
    expect(libelleMethode(t, 'lightning', null)).toBe('Bitcoin')
    expect(libelleMethode(t, 'paytech', 'orange_money')).toBe('Mobile money · Orange Money')
    expect(libelleMethode(t, 'wave_manuel', 'wave')).toBe('Wave direct')
    expect(libelleMethode(t, null, null)).toBe('—')
    await i18n.changeLanguage('en')
    expect(libelleMethode(t, 'paytech', 'wave')).toBe('Mobile money · Wave')
    await i18n.changeLanguage('fr')
  })

  it('QR Lightning : préfixe LIGHTNING: et BOLT11 en majuscules', () => {
    expect(contenuQrLightning('lnbc150n1pabc')).toBe('LIGHTNING:LNBC150N1PABC')
  })

  it('message du reçu (interpolation) en FR et EN', async () => {
    await i18n.changeLanguage('fr')
    expect(i18n.t('succes.messageRecu', { boutique: 'Boutique Démo', montant: '15 000 FCFA', lien: 'https://x/r/abc' })).toBe('Votre reçu Boutique Démo (15 000 FCFA) : https://x/r/abc')
    await i18n.changeLanguage('en')
    expect(i18n.t('succes.messageRecu', { boutique: 'Demo Shop', montant: '15 000 FCFA', lien: 'https://x/r/abc' })).toBe('Your Demo Shop receipt (15 000 FCFA): https://x/r/abc')
    await i18n.changeLanguage('fr')
  })
})
