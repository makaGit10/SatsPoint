// Génère docs/AUDIOS_ESSENTIELS.md depuis src/voix/cles-vocales.json : les phrases essentielles à enregistrer
// dans chaque langue, classées par priorité (parcours de vente d'abord). Usage : npm run audios-essentiels
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const registre = JSON.parse(await readFile(resolve(racine, 'src/voix/cles-vocales.json'), 'utf8'))
const essentielles = registre.filter((e) => e.essentielle)

// Priorité 1 : ce qu'un commerçant entend en vendant (langue, caisse, paiement, paiement reçu) + l'accueil.
const P1 = new Set(['langue', 'caisse', 'paiement', 'succes'])
const P1_CLES = new Set(['guide.landing', 'guide.connexion', 'guide.inscription', 'guide.aideProche', 'landing.hero.creer', 'landing.hero.connexion'])
const priorite = (e) => (P1.has(e.ecran) || P1_CLES.has(e.cle) ? 1 : e.cle.startsWith('guide.') ? 2 : 3)

const groupes = [
  [1, 'Priorité 1 — vendre (à faire en premier)', 'Choix de la langue, caisse, paiement, paiement reçu, et l’accueil. Avec ces phrases, un commerçant qui ne lit pas peut déjà encaisser seul.'],
  [2, 'Priorité 2 — les guides des autres écrans', 'Une explication par écran, lue automatiquement à l’arrivée (ventes, tableau de bord, portefeuille, articles, équipe, réglages…).'],
  [3, 'Priorité 3 — le reste des boutons essentiels', 'Libellés de la page de présentation et des écrans du parcours.'],
]

const ligne = (n, e) => `| ${n} | ${e.ecran} | ${e.texte_fr.replace(/\|/g, '\\|').replace(/\n/g, ' ')} | \`${e.cle}\` |`
let n = 0
const sections = groupes.map(([p, titre, texte]) => {
  const liste = essentielles.filter((e) => priorite(e) === p)
  const lignes = liste.map((e) => ligne(++n, e))
  return `## ${titre} (${liste.length})\n\n${texte}\n\n| N° | Écran | Phrase (français) | Code |\n|---|---|---|---|\n${lignes.join('\n')}\n`
})

const doc = `# Les ${essentielles.length} phrases essentielles à enregistrer

> Généré par \`npm run audios-essentiels\` (web/) depuis le registre des clés vocales — ne pas modifier à la main.
> Toutes les autres phrases (${registre.length - essentielles.length}) ont aussi un haut-parleur : tant qu'elles ne sont pas enregistrées, l'application les dit en français.

À enregistrer dans chaque langue : **wolof, seereer, pulaar, joola** au Sénégal, et dans **chaque langue ajoutée depuis la console** (onglet « Langues »). Une phrase = un fichier de **15 secondes maximum**. Les blancs du début et de la fin (le « 3, 2, 1 ») sont coupés automatiquement.

**Où** : se connecter en super-admin → **Studio audio** → choisir la langue → filtre « Essentielles » → **Mode rafale** (micro, parler, valider, suivante). Ou « Déposer un fichier » (mp3, m4a, wav, ogg, opus, note vocale WhatsApp…). Quand une langue est finie : **Publier les brouillons**.

**Sur quel site** : enregistrer directement sur le site **en ligne** une fois la nouvelle version déployée (les enregistrements y restent). Jamais en mode démo, qui ne garde rien.

${sections.join('\n')}`
await writeFile(resolve(racine, '../docs/AUDIOS_ESSENTIELS.md'), doc)
console.log(`${essentielles.length} phrases essentielles → docs/AUDIOS_ESSENTIELS.md (${groupes.map(([p]) => essentielles.filter((e) => priorite(e) === p).length).join(' / ')})`)
