import {
  ArrowRight,
  ChartColumn,
  Check,
  ChevronDown,
  CircleCheck,
  Code,
  KeyRound,
  Lock,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  Volume2,
  Wallet,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { SelecteurLangue, SelecteurTheme } from '@/coquille/Selecteurs'
/** Logo unique de l'appli (public/logo.svg). */
const logo = '/logo.svg'
import './landing.css'

const DEPOT = 'https://github.com/makaGit10/SatsPoint'

/** Fait apparaître les blocs `.reveler` quand ils entrent à l'écran (désactivé si l'utilisateur réduit les animations). */
function useApparition() {
  const racine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = racine.current
    if (!el) return
    const blocs = [...el.querySelectorAll<HTMLElement>('.reveler')]
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      blocs.forEach((b) => b.classList.add('visible'))
      return
    }
    const obs = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            obs.unobserve(e.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    blocs.forEach((b) => obs.observe(b))
    return () => obs.disconnect()
  }, [])
  return racine
}

function Titre({ id, surTitre, titre, titreOr, texte }: { id: string; surTitre: string; titre: string; titreOr: string; texte?: string }) {
  return (
    <div className="reveler">
      <p className="sur-titre">{surTitre}</p>
      <h2 id={id}>
        {titre} <span className="degrade">{titreOr}</span>
      </h2>
      {texte && <p className="lead">{texte}</p>}
    </div>
  )
}

function Tuile({ icone, titre, texte, className, children }: { icone: ReactNode; titre: string; texte: string; className?: string; children?: ReactNode }) {
  return (
    <article className={`tuile reveler ${className ?? ''}`}>
      <span className="tuile-icone" aria-hidden="true">
        {icone}
      </span>
      <h3>{titre}</h3>
      <p>{texte}</p>
      {children}
    </article>
  )
}

/** Téléphone dessiné en HTML (net à toutes les tailles) avec la caisse et les notifications animées. */
function Maquette() {
  const { t } = useTranslation()
  return (
    <div className="scene" role="img" aria-label={t('landing.maquette.alt')}>
      <div className="telephone" aria-hidden="true">
        <div className="telephone-ecran">
          <div className="m-entete">
            <b>{t('landing.maquette.caisse')}</b>
            <span>AN</span>
          </div>
          <div className="m-montant verre">
            <div className="m-valeur">
              15 000<small>FCFA</small>
            </div>
            <div className="m-sats">{t('landing.maquette.sats')}</div>
          </div>
          <div className="m-pave">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'].map((k) => (
              <span key={k}>{k}</span>
            ))}
          </div>
          <div className="m-bouton">{t('landing.maquette.encaisser')}</div>
        </div>
      </div>
      <div className="flottant verre f1" aria-hidden="true">
        <span className="f-ok">
          <Check strokeWidth={3} />
        </span>
        <div>
          {t('landing.maquette.recu')}
          <small>{t('landing.maquette.recuDetail')}</small>
        </div>
      </div>
      <div className="flottant verre f2" aria-hidden="true">
        <span className="f-ico f-bleu">
          <Smartphone />
        </span>
        <div>
          {t('landing.maquette.wave')}
          <small>{t('landing.maquette.waveDetail')}</small>
        </div>
      </div>
      <div className="flottant verre f3" aria-hidden="true">
        <span className="f-ico f-or">
          <Volume2 />
        </span>
        <div>
          {t('landing.maquette.voix')}
          <small>{t('landing.maquette.voixDetail')}</small>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { t } = useTranslation()
  const racine = useApparition()

  useEffect(() => {
    const avant = document.title
    document.title = `SatsPoint — ${t('landing.hero.titreDebut')} ${t('landing.hero.titreOr')}`
    return () => {
      document.title = avant
    }
  }, [t])

  const questions = [1, 2, 3, 4, 5, 6] as const

  return (
    <div className="landing" ref={racine} data-ecran="landing">
      <div className="halos" aria-hidden="true" />

      <header className="barre">
        <div className="conteneur barre-int">
          <a className="marque" href="#haut" aria-label="SatsPoint">
            <img src={logo} alt="" width={40} height={40} />
            <span>satspoint</span>
          </a>
          <nav aria-label={t('landing.nav.menu')} className="liens">
            <a href="#comment">{t('landing.nav.comment')}</a>
            <a href="#fonctions">{t('landing.nav.fonctions')}</a>
            <a href="#securite">{t('landing.nav.securite')}</a>
            <a href="#faq">{t('landing.nav.faq')}</a>
          </nav>
          <div className="barre-droite">
            <SelecteurTheme className="selecteur" />
            <SelecteurLangue className="selecteur" />
            <Link className="lien-connexion" to="/connexion">
              {t('landing.nav.connexion')}
            </Link>
            <Link className="btn btn-or btn-petit" to="/inscription">
              {t('landing.nav.creer')}
            </Link>
          </div>
        </div>
      </header>

      <main id="haut">
        <section className="conteneur hero" aria-labelledby="titre-hero">
          <div className="hero-texte">
            <p className="pastille verre">
              <b>{t('landing.hero.badge')}</b> {t('landing.hero.badgeTexte')}
            </p>
            <h1 id="titre-hero">
              {t('landing.hero.titreDebut')} <span className="degrade">{t('landing.hero.titreOr')}</span>.
            </h1>
            <p className="lead lead-hero">{t('landing.hero.texte')}</p>
            <div className="actions">
              <Link className="btn btn-or" to="/inscription">
                {t('landing.hero.creer')} <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="btn btn-blanc" to="/connexion">
                {t('landing.hero.connexion')}
              </Link>
            </div>
            <ul className="confiance">
              {(['confiance1', 'confiance2', 'confiance3'] as const).map((c) => (
                <li key={c}>
                  <span aria-hidden="true">
                    <Check strokeWidth={3} />
                  </span>
                  {t(`landing.hero.${c}`)}
                </li>
              ))}
            </ul>
          </div>
          <Maquette />
        </section>

        <div className="conteneur">
          <div className="moyens verre reveler">
            <p>{t('landing.moyens.titre')}</p>
            <ul>
              <li>
                <Zap aria-hidden="true" /> {t('landing.moyens.lightning')}
              </li>
              <li>Wave</li>
              <li>Orange Money</li>
              <li>Free Money</li>
            </ul>
          </div>
        </div>

        <section className="conteneur section" id="comment" aria-labelledby="titre-comment">
          <Titre id="titre-comment" surTitre={t('landing.etapes.surTitre')} titre={t('landing.etapes.titre')} titreOr={t('landing.etapes.titreOr')} />
          <ol className="etapes">
            {([
              [1, <Store key="s" />],
              [2, <ScanLine key="q" />],
              [3, <CircleCheck key="c" />],
            ] as const).map(([n, icone]) => (
              <li key={n} className="etape verre reveler">
                <div className="etape-tete">
                  <span className="etape-num">{n}</span>
                  <span className="etape-ico" aria-hidden="true">
                    {icone}
                  </span>
                </div>
                <h3>{t(`landing.etapes.e${n}Titre`)}</h3>
                <p>{t(`landing.etapes.e${n}Texte`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="conteneur section" id="fonctions" aria-labelledby="titre-fonctions">
          <Titre id="titre-fonctions" surTitre={t('landing.fonctions.surTitre')} titre={t('landing.fonctions.titre')} titreOr={t('landing.fonctions.titreOr')} />
          <div className="bento">
            <Tuile className="noire large" icone={<Volume2 />} titre={t('landing.fonctions.voixTitre')} texte={t('landing.fonctions.voixTexte')}>
              <ul className="langues">
                {['Wolof', 'Seereer', 'Pulaar', 'Joola', 'Français', 'English'].map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <div className="onde" aria-hidden="true">
                {[30, 55, 80, 45, 95, 60, 35, 70, 50, 85, 40, 65, 30, 75, 55].map((h, i) => (
                  <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
            </Tuile>
            <Tuile className="or" icone={<Zap />} titre={t('landing.fonctions.vitesseTitre')} texte={t('landing.fonctions.vitesseTexte')}>
              <p className="gros-chiffre">{t('landing.fonctions.vitesseChiffre')}</p>
            </Tuile>
            <Tuile className="verre" icone={<Wallet />} titre={t('landing.fonctions.fondsTitre')} texte={t('landing.fonctions.fondsTexte')} />
            <Tuile className="verre" icone={<RefreshCw />} titre={t('landing.fonctions.directTitre')} texte={t('landing.fonctions.directTexte')} />
            <Tuile className="verre" icone={<ChartColumn />} titre={t('landing.fonctions.tableauTitre')} texte={t('landing.fonctions.tableauTexte')} />
            <Tuile className="verre" icone={<Users />} titre={t('landing.fonctions.equipeTitre')} texte={t('landing.fonctions.equipeTexte')} />
          </div>
        </section>

        <section className="conteneur section" id="securite" aria-labelledby="titre-securite">
          <div className="securite">
            <Titre id="titre-securite" surTitre={t('landing.securite.surTitre')} titre={t('landing.securite.titre')} titreOr={t('landing.securite.titreOr')} texte={t('landing.securite.texte')} />
            <ul className="securite-liste">
              {([
                [1, <ShieldCheck key="1" />],
                [2, <Lock key="2" />],
                [3, <KeyRound key="3" />],
                [4, <Code key="4" />],
              ] as const).map(([n, icone]) => (
                <li key={n} className="verre reveler">
                  <span aria-hidden="true">{icone}</span>
                  <div>
                    <h3>{t(`landing.securite.s${n}Titre`)}</h3>
                    <p>{t(`landing.securite.s${n}Texte`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="conteneur section" id="impact" aria-labelledby="titre-impact">
          <Titre id="titre-impact" surTitre={t('landing.impact.surTitre')} titre={t('landing.impact.titre')} titreOr={t('landing.impact.titreOr')} texte={t('landing.impact.texte')} />
          <ul className="chiffres">
            {([1, 2, 3] as const).map((n) => (
              <li key={n} className="verre reveler">
                <b>{t(`landing.impact.c${n}`)}</b>
                <span>{t(`landing.impact.c${n}Texte`)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="conteneur section" id="faq" aria-labelledby="titre-faq">
          <Titre id="titre-faq" surTitre={t('landing.faq.surTitre')} titre={t('landing.faq.titre')} titreOr={t('landing.faq.titreOr')} />
          <div className="faq">
            {questions.map((n) => (
              <details key={n} className="verre reveler">
                <summary>
                  {t(`landing.faq.q${n}`)}
                  <ChevronDown aria-hidden="true" />
                </summary>
                <p>{t(`landing.faq.r${n}`)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="conteneur" aria-labelledby="titre-cta">
          <div className="cta reveler">
            <img src={logo} alt="" width={72} height={72} />
            <h2 id="titre-cta">
              {t('landing.cta.titre')} <span className="degrade">{t('landing.cta.titreOr')}</span>.
            </h2>
            <p>{t('landing.cta.texte')}</p>
            <div className="actions">
              <Link className="btn btn-or" to="/inscription">
                {t('landing.cta.creer')} <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="btn btn-sombre" to="/connexion">
                {t('landing.cta.connexion')}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="conteneur pied">
        <a className="marque" href="#haut" aria-label="SatsPoint">
          <img src={logo} alt="" width={32} height={32} />
          <span>satspoint</span>
        </a>
        <p>{t('landing.pied.fait')}</p>
        <div className="pied-liens">
          <a href={DEPOT} target="_blank" rel="noopener noreferrer">
            {t('landing.pied.code')}
          </a>
          <Link to="/connexion">{t('landing.pied.connexion')}</Link>
        </div>
      </footer>
    </div>
  )
}
