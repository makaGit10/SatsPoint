import {
  Apple,
  Baby,
  Beef,
  Broom,
  CakeSlice,
  Candy,
  CanSoda,
  CardSim,
  Carrot,
  Cigarette,
  Coffee,
  ConciergeBell,
  CookingPot,
  createLucideIcon,
  CupSoda,
  Drumstick,
  Egg,
  Fish,
  Gem,
  GlassWater,
  Handbag,
  IceCreamCone,
  Milk,
  NotebookText,
  Package,
  Pill,
  Sandwich,
  Scissors,
  Shirt,
  ShoppingBasket,
  Smartphone,
  SoapDispenserDroplet,
  Sparkles,
  SportShoe,
  Wheat,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { CouleurArticle } from '@/lib/couleursArticles'

/*
 * Pictogrammes d'articles — liste FERMÉE, identique à api/app/Support/Pictogrammes.php (vérifié par un test).
 * Icônes Lucide (traits fins, cohérentes avec le reste de l'application) ; quelques produits du commerce
 * local qui n'existent pas chez Lucide sont dessinés ici dans le même style (24 × 24, trait de 2, bouts ronds) :
 * baguette, bol de riz, sucre en morceaux, bouteille d'huile, théière d'ataya, tissu wax, bonbonne de gaz.
 */

const Baguette = createLucideIcon('baguette', [
  ['path', { d: 'M4.6 19.4c-1.6-1.6-1-4.4 1.5-6.9l6.3-6.3c2.5-2.5 5.3-3.1 6.9-1.5s1 4.4-1.5 6.9l-6.3 6.3c-2.5 2.5-5.3 3.1-6.9 1.5z', key: 'corps' }],
  ['path', { d: 'm7.5 13.5 2 2', key: 'e1' }],
  ['path', { d: 'm10.5 10.5 2 2', key: 'e2' }],
  ['path', { d: 'm13.5 7.5 2 2', key: 'e3' }],
])

const BolDeRiz = createLucideIcon('bol-de-riz', [
  ['path', { d: 'M3 11.5h18', key: 'bord' }],
  ['path', { d: 'M20 11.5a8 8 0 0 1-16 0', key: 'bol' }],
  ['path', { d: 'M9 21h6', key: 'pied' }],
  ['path', { d: 'M6 11.5C6 8.4 8.7 6 12 6s6 2.4 6 5.5', key: 'riz' }],
  ['path', { d: 'M10 9h.01', key: 'g1' }],
  ['path', { d: 'M13 8h.01', key: 'g2' }],
  ['path', { d: 'M14.5 10h.01', key: 'g3' }],
])

const Sucre = createLucideIcon('sucre', [
  ['rect', { x: '3', y: '12', width: '8', height: '8', rx: '1.5', key: 'c1' }],
  ['rect', { x: '13', y: '12', width: '8', height: '8', rx: '1.5', key: 'c2' }],
  ['rect', { x: '8', y: '3.5', width: '8', height: '8', rx: '1.5', key: 'c3' }],
  ['path', { d: 'M6.5 15.5h.01', key: 'p1' }],
  ['path', { d: 'M17.5 16.5h.01', key: 'p2' }],
  ['path', { d: 'M12 7h.01', key: 'p3' }],
])

const Huile = createLucideIcon('huile', [
  ['path', { d: 'M10 2h4', key: 'bouchon' }],
  ['path', { d: 'M10.5 2v3', key: 'col1' }],
  ['path', { d: 'M13.5 2v3', key: 'col2' }],
  ['path', { d: 'M10.5 5 8 8.5V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8.5L13.5 5', key: 'corps' }],
  ['path', { d: 'M12 11.5c-1 1.4-1.6 2.3-1.6 3.1a1.6 1.6 0 0 0 3.2 0c0-.8-.6-1.7-1.6-3.1z', key: 'goutte' }],
])

const Theiere = createLucideIcon('theiere', [
  ['circle', { cx: '10.5', cy: '5.5', r: '1', key: 'bouton' }],
  ['path', { d: 'M7 9.5a3.5 2.5 0 0 1 7 0', key: 'couvercle' }],
  ['path', { d: 'M5 10.5h11l-.7 5.3a4 4 0 0 1-4 3.2h-1.6a4 4 0 0 1-4-3.2z', key: 'corps' }],
  ['path', { d: 'm15.8 12.5 4.2-3 .9 1.1-4.1 4.9', key: 'bec' }],
  ['path', { d: 'M5.2 12H4a2 2 0 0 0 0 4h1.6', key: 'anse' }],
  ['path', { d: 'M8 22h5', key: 'pied' }],
])

const Tissu = createLucideIcon('tissu', [
  ['rect', { x: '3', y: '4.5', width: '18', height: '15', rx: '2', key: 'pile' }],
  ['path', { d: 'M3 9.5h18', key: 'pli1' }],
  ['path', { d: 'M3 14.5h18', key: 'pli2' }],
  ['path', { d: 'm6 12.8 1.5-1.6 1.5 1.6 1.5-1.6 1.5 1.6 1.5-1.6 1.5 1.6 1.5-1.6 1.5 1.6', key: 'motif' }],
  ['path', { d: 'M7.5 7h.01', key: 'd1' }],
  ['path', { d: 'M12 7h.01', key: 'd2' }],
  ['path', { d: 'M16.5 7h.01', key: 'd3' }],
  ['path', { d: 'M9.5 17h.01', key: 'd4' }],
  ['path', { d: 'M14.5 17h.01', key: 'd5' }],
])

const Bonbonne = createLucideIcon('bonbonne', [
  ['path', { d: 'M9 2.5h6', key: 'poignee' }],
  ['path', { d: 'M10 2.5v3', key: 'p1' }],
  ['path', { d: 'M14 2.5v3', key: 'p2' }],
  ['path', { d: 'M6 11.5a6 6 0 0 1 12 0V19a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 19z', key: 'corps' }],
  ['path', { d: 'M6 15h12', key: 'bande' }],
  ['path', { d: 'M9.5 5.5h5', key: 'col' }],
])

export const CATEGORIES_PICTOS = ['alimentation', 'boissons', 'mode', 'maison', 'services'] as const
export type CategoriePicto = (typeof CATEGORIES_PICTOS)[number]

export interface Pictogramme {
  id: string
  icone: LucideIcon
  categorie: CategoriePicto
  /** Couleur de tuile proposée quand on choisit ce pictogramme (le commerçant n'a rien d'autre à faire). */
  couleur: CouleurArticle
}

const p = (id: string, icone: LucideIcon, categorie: CategoriePicto, couleur: CouleurArticle): Pictogramme => ({ id, icone, categorie, couleur })

/** Ordre d'affichage de la galerie (par catégorie, les plus fréquents d'abord). Ne jamais renommer un id. */
export const PICTOGRAMMES: readonly Pictogramme[] = [
  p('pain', Baguette, 'alimentation', 'brun'),
  p('riz', BolDeRiz, 'alimentation', 'jaune'),
  p('sucre', Sucre, 'alimentation', 'gris'),
  p('huile', Huile, 'alimentation', 'jaune'),
  p('farine', Wheat, 'alimentation', 'brun'),
  p('lait', Milk, 'alimentation', 'bleu'),
  p('oeufs', Egg, 'alimentation', 'jaune'),
  p('viande', Beef, 'alimentation', 'rouge'),
  p('poulet', Drumstick, 'alimentation', 'orange'),
  p('poisson', Fish, 'alimentation', 'bleu'),
  p('legumes', Carrot, 'alimentation', 'vert'),
  p('fruits', Apple, 'alimentation', 'rouge'),
  p('plat', CookingPot, 'alimentation', 'orange'),
  p('sandwich', Sandwich, 'alimentation', 'brun'),
  p('gateau', CakeSlice, 'alimentation', 'violet'),
  p('bonbons', Candy, 'alimentation', 'violet'),
  p('glace', IceCreamCone, 'alimentation', 'bleu'),
  p('epicerie', ShoppingBasket, 'alimentation', 'vert'),
  p('eau', GlassWater, 'boissons', 'bleu'),
  p('the', Theiere, 'boissons', 'vert'),
  p('cafe', Coffee, 'boissons', 'brun'),
  p('jus', CupSoda, 'boissons', 'rouge'),
  p('boisson', CanSoda, 'boissons', 'orange'),
  p('tissu', Tissu, 'mode', 'violet'),
  p('vetement', Shirt, 'mode', 'bleu'),
  p('chaussure', SportShoe, 'mode', 'brun'),
  p('sac', Handbag, 'mode', 'brun'),
  p('bijou', Gem, 'mode', 'jaune'),
  p('coiffure', Scissors, 'mode', 'violet'),
  p('beaute', Sparkles, 'mode', 'violet'),
  p('savon', SoapDispenserDroplet, 'maison', 'bleu'),
  p('menage', Broom, 'maison', 'vert'),
  p('bebe', Baby, 'maison', 'jaune'),
  p('gaz', Bonbonne, 'maison', 'rouge'),
  p('electricite', Zap, 'maison', 'jaune'),
  p('credit', CardSim, 'services', 'orange'),
  p('telephone', Smartphone, 'services', 'gris'),
  p('medicament', Pill, 'services', 'vert'),
  p('cigarette', Cigarette, 'services', 'gris'),
  p('fournitures', NotebookText, 'services', 'bleu'),
  p('reparation', Wrench, 'services', 'gris'),
  p('service', ConciergeBell, 'services', 'violet'),
  p('divers', Package, 'services', 'gris'),
]

const PAR_ID = new Map(PICTOGRAMMES.map((x) => [x.id, x]))

export function pictogramme(id: string | null | undefined): Pictogramme | null {
  return id ? (PAR_ID.get(id) ?? null) : null
}

/** Icône d'un pictogramme (ou d'un article sans visuel : carton). */
export function IconePictogramme({ id, className, size, strokeWidth = 1.75 }: { id: string | null | undefined; className?: string; size?: number | string; strokeWidth?: number }) {
  const Icone = pictogramme(id)?.icone ?? Package
  return <Icone className={className} size={size} strokeWidth={strokeWidth} aria-hidden="true" />
}
