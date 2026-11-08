import { describe, expect, it } from 'vitest'
import { boutonsSansVoix, construireRegistre, occurrencesFichier, serialiser } from '../../scripts/cles-vocales-lib.mjs'
import en from '@/i18n/en.json'
import fr from '@/i18n/fr.json'
import registreGenere from './cles-vocales.json'

// Sources réelles de l'application (mêmes exclusions que le script : tests, mock, dossier test).
const sources = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*', '!/src/**/*.d.ts', '!/src/test/**', '!/src/api/mock*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const fichiers = Object.entries(sources).map(([chemin, contenu]) => ({ chemin: chemin.replace(/^\/src\//, ''), contenu }))

// Fusion profonde (les paquets complètent des espaces de clés distincts).
function fusion(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = { ...a }
  for (const [k, v] of Object.entries(b)) r[k] = v && typeof v === 'object' && r[k] && typeof r[k] === 'object' ? fusion(r[k] as Record<string, unknown>, v as Record<string, unknown>) : v
  return r
}
const paquets = import.meta.glob<Record<string, unknown>>('/src/i18n/*.*.json', { eager: true, import: 'default' })
const avecPaquets = (base: Record<string, unknown>, locale: string) =>
  Object.entries(paquets)
    .filter(([c]) => c.endsWith(`.${locale}.json`))
    .reduce((acc, [, p]) => fusion(acc, p), base)
const FR = avecPaquets(fr, 'fr')
const EN = avecPaquets(en, 'en')

describe('extraction des clés vocales', () => {
  it('reconnaît props, objets, haut-parleurs, annonces et gabarits de langue, sans les commentaires', () => {
    const source = `
      // <Bouton voix="commentaire.ignore">
      /* voix="bloc.ignore" */
      export function A({ ok }) {
        notifier({ type: 'succes', titre: t('x.y'), voix: 'message.enregistre' })
        annoncer('paiement.recu')
        return (
          <>
            <Bouton icone={<Plus />} voix="caisse.encaisser">ok</Bouton>
            <BoutonIcone libelle="x" voix={ok ? 'equipe.desactiver' : 'equipe.reactiver'} />
            <HautParleur cle="caisse.titre" />
            <HautParleur cle={\`langue.\${code}\`} langue={code} />
            <Segment options={[{ valeur: 'a', voix: 'periodes.aujourdhui' }]} />
            <Champ cle="pas.une.voix" />
          </>
        )
      }`
    const cles = occurrencesFichier('ecrans/Caisse.tsx', source).map((o) => o.cle)
    expect(cles).toEqual([
      'message.enregistre',
      'paiement.recu',
      'caisse.encaisser',
      'equipe.desactiver',
      'equipe.reactiver',
      'caisse.titre',
      'langue.wo',
      'langue.srr',
      'langue.ff',
      'langue.dyo',
      'langue.fr',
      'langue.en',
      'periodes.aujourdhui',
    ])
    const types = occurrencesFichier('ecrans/Caisse.tsx', source)
    expect(types.find((o) => o.cle === 'message.enregistre')?.type).toBe('Message')
    expect(types.find((o) => o.cle === 'paiement.recu')?.type).toBe('Annonce automatique')
    expect(types.find((o) => o.cle === 'caisse.encaisser')?.type).toBe('Bouton')
  })

  it("respecte l'ordre d'apparition (langue → accueil → connexion → caisse → paiement → succès) et marque les essentielles", () => {
    const { registre } = construireRegistre(
      [
        { chemin: 'ecrans/Ventes.tsx', contenu: '<Bouton voix="ventes.exporter" />' },
        { chemin: 'ecrans/paiement/Succes.tsx', contenu: '<Bouton voix="succes.nouvelleVente" />' },
        { chemin: 'ecrans/Caisse.tsx', contenu: '<Bouton voix="caisse.encaisser" />' },
        { chemin: 'ecrans/Langue.tsx', contenu: '<HautParleur cle="langue.titre" />' },
      ],
      FR,
      EN,
    )
    expect(registre.map((e) => [e.cle, e.essentielle])).toEqual([
      ['langue.titre', true],
      ['caisse.encaisser', true],
      ['succes.nouvelleVente', true],
      ['ventes.exporter', false],
    ])
    expect(registre[1]).toMatchObject({ ecran: 'caisse', texte_fr: fr.caisse.encaisser, texte_en: en.caisse.encaisser })
  })

  it('signale une clé vocale sans texte et un bouton sans clé vocale', () => {
    const fichiersTest = [{ chemin: 'ecrans/X.tsx', contenu: '<Bouton voix="cle.inexistante" /> <BoutonIcone libelle="a" icone={<X />} /> <Bouton {...reste} />' }]
    expect(construireRegistre(fichiersTest, FR, EN).manquantes.map((m) => m.cle)).toEqual(['cle.inexistante'])
    expect(boutonsSansVoix(fichiersTest)).toEqual([{ fichier: 'ecrans/X.tsx', ligne: 1, composant: 'BoutonIcone' }])
  })
})

describe('registre réel de l’application', () => {
  const { registre, manquantes } = construireRegistre(fichiers, FR, EN)

  it('chaque clé vocale du code a un texte FR et EN', () => {
    expect(manquantes).toEqual([])
  })

  it('chaque bouton, lien-bouton, bouton icône et onglet porte une clé vocale', () => {
    expect(boutonsSansVoix(fichiers)).toEqual([])
  })

  it('src/voix/cles-vocales.json est à jour (npm run cles-vocales)', () => {
    expect(serialiser(registre)).toBe(serialiser(registreGenere))
  })

  it('le parcours d’encaissement et le choix de la langue viennent en tête, marqués essentiels', () => {
    expect(registre[0]?.cle).toBe('langue.titre')
    const premiereNonEssentielle = registre.findIndex((e) => !e.essentielle)
    expect(registre.slice(premiereNonEssentielle).every((e) => !e.essentielle)).toBe(true)
    for (const cle of ['caisse.encaisser', 'paiement.recu', 'paiement.expire', 'succes.nouvelleVente', 'langue.wo']) {
      expect(registre.find((e) => e.cle === cle)?.essentielle, cle).toBe(true)
    }
  })
})
