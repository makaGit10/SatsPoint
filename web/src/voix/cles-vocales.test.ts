import { describe, expect, it } from 'vitest'
import { boutonsSansVoix, construireRegistre, elementsBrutsSansVoix, EXCEPTIONS_ELEMENTS_BRUTS, occurrencesFichier, serialiser } from '../../scripts/cles-vocales-lib.mjs'
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

describe('garde-fou : un haut-parleur sur chaque élément actionnable', () => {
  const verifier = (contenu: string, chemin = 'ecrans/X.tsx') => elementsBrutsSansVoix([{ chemin, contenu }]).map((e) => e.element)

  it('accepte un haut-parleur dans l’élément, juste après lui (même avec une alternative), ou une prop voix', () => {
    expect(verifier('<button onClick={f}>Ok<HautParleur cle="a.b" dansBouton /></button>')).toEqual([])
    expect(verifier('<Link to="/x">Lien</Link>{\' \'}\n  <HautParleur cle="a.b" />')).toEqual([])
    expect(verifier('<li><button>Ok</button><span className="absolute"><HautParleur cle="a.b" /></span></li>')).toEqual([])
    expect(verifier('{lien ? (<a href={lien}>A</a>) : (<button>B</button>)}<span><HautParleur cle="a.b" /></span>')).toEqual([])
    expect(verifier('<NavLink to="/" voix="nav.caisse">Caisse</NavLink>')).toEqual([])
  })

  it('signale un bouton, un lien, un résumé ou une ancre bruts sans haut-parleur', () => {
    expect(verifier('<button onClick={f}>Ok</button><a href="#x">Ancre</a><summary>Question</summary><Link to="/x" />')).toEqual(['button', 'a', 'summary', 'Link'])
    // Un haut-parleur plus loin (pas un frère immédiat) ne compte pas.
    expect(verifier('<button>Ok</button><p>texte</p><HautParleur cle="a.b" />')).toEqual(['button'])
    // `<aside>` n'est pas un lien.
    expect(verifier('<aside>Encart</aside>')).toEqual([])
  })

  it('respecte les exceptions justifiées, seulement pour leurs fichiers ; le bouton « écouter l’article » compte comme haut-parleur', () => {
    expect(verifier('<button>Riz</button><EcouterArticle article={a} />', 'ecrans/caisse/Articles.tsx')).toEqual([])
    expect(verifier('<button>1</button>', 'ecrans/caisse/Pave.tsx')).toEqual([])
    expect(verifier('<button>1</button>', 'ecrans/articles/Nouveau.tsx')).toEqual(['button'])
    expect(verifier('<button>1</button>', 'ecrans/caisse/Autre.tsx')).toEqual(['button'])
    expect(verifier('<Link to="/"><Marque /></Link>', 'coquille/EnTete.tsx')).toEqual([])
    expect(verifier('<Link to="/">Accueil</Link>', 'coquille/EnTete.tsx')).toEqual(['Link'])
    for (const e of EXCEPTIONS_ELEMENTS_BRUTS) expect(e.raison.length, e.fichier).toBeGreaterThan(30)
    expect(EXCEPTIONS_ELEMENTS_BRUTS.length).toBeLessThanOrEqual(12)
  })

  it('exige la clé vocale sur les champs, listes, interrupteurs et fenêtres (au premier niveau des attributs)', () => {
    const composants = (contenu: string) => boutonsSansVoix([{ chemin: 'ecrans/X.tsx', contenu }]).map((b) => b.composant)
    expect(composants('<Champ libelle="Nom" /><Selection libelle="Pays" options={o} /><Interrupteur coche libelle="Voix" />')).toEqual(['Champ', 'Selection', 'Interrupteur'])
    expect(composants('<Champ libelle="Nom" voix="a.b" /><ChampMotDePasse {...props} />')).toEqual([])
    // Le <Bouton voix> du pied ne vaut pas pour la fenêtre ; un titre masqué ou qui porte son haut-parleur est accepté.
    expect(composants('<Dialogue titre="T" pied={<Bouton voix="a.b">Ok</Bouton>} />')).toEqual(['Dialogue'])
    expect(composants('<Dialogue titre="T" titreMasque /><Dialogue titre={<span>T<HautParleur cle="a.b" /></span>} />')).toEqual([])
  })
})

describe('guides vocaux des écrans', () => {
  it('reconnaît les chaînes « guide.… », toujours essentielles et rattachées à l’écran du fichier', () => {
    const { registre } = construireRegistre(
      [
        { chemin: 'ecrans/Ventes.tsx', contenu: `useGuideVocal('guide.ventes')\n<Bouton voix="ventes.exporter" />` },
        { chemin: 'ecrans/Demarrage.tsx', contenu: "const G = { boutique: 'guide.demarrage.boutique' }" },
      ],
      FR,
      EN,
    )
    expect(registre.map((e) => [e.cle, e.ecran, e.essentielle])).toEqual([
      ['guide.ventes', 'ventes', true],
      ['guide.demarrage.boutique', 'demarrage', true],
      ['ventes.exporter', 'ventes', false],
    ])
  })
})

describe('registre réel de l’application', () => {
  const { registre, manquantes } = construireRegistre(fichiers, FR, EN)

  it('chaque clé vocale du code a un texte FR et EN', () => {
    expect(manquantes).toEqual([])
  })

  it('chaque bouton, lien-bouton, bouton icône, onglet, champ, liste, interrupteur et fenêtre porte une clé vocale', () => {
    expect(boutonsSansVoix(fichiers)).toEqual([])
  })

  it('aucun élément actionnable brut (button, a, summary, Link, NavLink) sans haut-parleur', () => {
    expect(elementsBrutsSansVoix(fichiers)).toEqual([])
  })

  it('chaque écran a son guide vocal (essentiel, écran correct, texte FR et EN)', () => {
    const attendus: Record<string, string> = {
      'guide.landing': 'landing', 'guide.langue': 'langue', 'guide.accueil': 'accueil', 'guide.inscription': 'compte',
      'guide.connexion': 'connexion', 'guide.verification2fa': 'securite', 'guide.deuxFacteurs': 'securite',
      'guide.demarrage.boutique': 'demarrage', 'guide.demarrage.portefeuille': 'demarrage', 'guide.demarrage.mobileMoney': 'demarrage',
      'guide.demarrage.test': 'demarrage', 'guide.caisse': 'caisse', 'guide.choixMoyen': 'caisse', 'guide.paiement.bitcoin': 'paiement',
      'guide.paiement.mobileMoney': 'paiement', 'guide.paiement.moyenPays': 'paiement', 'guide.paiement.waveDirect': 'paiement',
      'guide.succes': 'succes', 'guide.ventes': 'ventes', 'guide.venteDetail': 'ventes', 'guide.tableau': 'tableau',
      'guide.portefeuille': 'portefeuille', 'guide.equipe': 'equipe', 'guide.reglages': 'reglages', 'guide.recu': 'recu',
      'guide.invitation': 'invitation', 'guide.console': 'admin', 'guide.studio': 'admin', 'guide.aideProche': 'compte',
    }
    for (const [cle, ecran] of Object.entries(attendus)) {
      const entree = registre.find((e) => e.cle === cle)
      expect(entree, cle).toMatchObject({ ecran, essentielle: true })
      expect(entree?.texte_fr.length, cle).toBeGreaterThan(20)
    }
  })

  it('src/voix/cles-vocales.json est à jour (npm run cles-vocales)', () => {
    expect(serialiser(registre)).toBe(serialiser(registreGenere))
  })

  it('le parcours d’encaissement et le choix de la langue viennent en tête, marqués essentiels', () => {
    // Le choix de la langue d'abord : son guide, puis son titre et le nom de chaque langue.
    expect(registre[0]?.ecran).toBe('langue')
    expect(registre.slice(0, 4).map((e) => e.cle)).toContain('langue.titre')
    const premiereNonEssentielle = registre.findIndex((e) => !e.essentielle)
    expect(registre.slice(premiereNonEssentielle).every((e) => !e.essentielle)).toBe(true)
    for (const cle of ['caisse.encaisser', 'paiement.recu', 'paiement.expire', 'succes.nouvelleVente', 'langue.wo']) {
      expect(registre.find((e) => e.cle === cle)?.essentielle, cle).toBe(true)
    }
  })
})
