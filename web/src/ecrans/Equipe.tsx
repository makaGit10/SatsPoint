import { useMutation } from '@tanstack/react-query'
import { Copy, Mail, MessageCircle, ShieldCheck, UserCheck, UserPlus, Users, UserX, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ErreurApi } from '@/api/client'
import { annulerInvitation, CLE_EQUIPE, inviter, modifierMembre, retirerMembre, useEquipe } from '@/api/equipe'
import type { Invitation, Membre, RoleBoutique } from '@/api/types'
import { roleBoutique, useAuth } from '@/auth/store'
import { Bouton } from '@/composants/Bouton'
import { BoutonIcone } from '@/composants/BoutonIcone'
import { Champ } from '@/composants/Champ'
import { Dialogue } from '@/composants/Dialogue'
import { EnTetePage } from '@/composants/EnTetePage'
import { EtatVide } from '@/composants/EtatVide'
import { Pastille, type TonPastille } from '@/composants/Pastille'
import { Selection } from '@/composants/Selection'
import { SqueletteListe } from '@/composants/Squelette'
import { notifier } from '@/composants/toastStore'
import { Avatar } from '@/coquille/MenuUtilisateur'
import { ErreurFormulaire } from '@/ecrans/auth/communs'
import { useMessageErreur } from '@/ecrans/auth/useMessageErreur'
import { cn } from '@/lib/cn'
import { copier, lienWhatsApp } from '@/lib/retours'
import { queryClient } from '@/lib/queryClient'
import { tempsRelatif } from '@/lib/temps'
import { useDonneesEnDirect } from '@/temps-reel/useDonneesEnDirect'
import { useSaisieEnCours } from '@/temps-reel/useSaisieEnCours'

const TON_ROLE: Record<RoleBoutique, TonPastille> = { proprietaire: 'accent', gerant: 'mm', caissier: 'neutre' }
const ROLES: RoleBoutique[] = ['proprietaire', 'gerant', 'caissier']
const DESCRIPTION_ROLE: Record<RoleBoutique, string> = { proprietaire: 'equipe.roleProprietaire', gerant: 'equipe.roleGerant', caissier: 'equipe.roleCaissier' }

/** Équipe : membres, rôles, activation, invitations (72 h). */
export default function Equipe() {
  const { t, i18n } = useTranslation()
  void i18n.language
  const utilisateur = useAuth((s) => s.utilisateur)
  const monRole = roleBoutique(utilisateur)
  const proprietaire = monRole === 'proprietaire'
  const messageErreur = useMessageErreur()
  const { data, isPending } = useEquipe()
  useDonneesEnDirect(['equipe'], () => void queryClient.invalidateQueries({ queryKey: CLE_EQUIPE }))
  const invalider = () => void queryClient.invalidateQueries({ queryKey: CLE_EQUIPE })

  const [inviterOuvert, setInviterOuvert] = useState(false)
  const [roleCible, setRoleCible] = useState<Membre | null>(null)
  const [desactiverCible, setDesactiverCible] = useState<Membre | null>(null)
  const [retirerCible, setRetirerCible] = useState<Membre | null>(null)

  const erreurToast = (e: unknown) => notifier({ type: 'erreur', titre: messageErreur(e) })
  const activation = useMutation({
    mutationFn: ({ ulid, actif }: { ulid: string; actif: boolean }) => modifierMembre(ulid, { actif }),
    onSuccess: () => {
      setDesactiverCible(null)
      invalider()
    },
    onError: erreurToast,
  })
  const retrait = useMutation({
    mutationFn: (ulid: string) => retirerMembre(ulid),
    onSuccess: () => {
      setRetirerCible(null)
      invalider()
    },
    onError: erreurToast,
  })
  const annulation = useMutation({ mutationFn: (ulid: string) => annulerInvitation(ulid), onSuccess: invalider, onError: erreurToast })

  const membres = data?.membres ?? []
  const invitations = data?.invitations ?? []
  const vide = !isPending && membres.length <= 1 && invitations.length === 0
  const peutAgirSur = (m: Membre) => !m.est_moi && (proprietaire || m.role !== 'proprietaire')

  return (
    <div className="anim-apparition flex flex-col" data-ecran="equipe">
      <EnTetePage
        titre={t('equipe.titre')}
        voix="equipe.titre"
        actions={
          <Bouton icone={<UserPlus />} voix="equipe.inviter" taille="sm" onClick={() => setInviterOuvert(true)}>
            {t('equipe.inviter')}
          </Bouton>
        }
      />

      {isPending && (
        <div data-chargement="equipe" aria-busy="true">
          <SqueletteListe lignes={3} />
        </div>
      )}

      {vide && (
        <EtatVide
          ton="mm"
          icone={<Users />}
          titre={t('equipe.vide.titre')}
          texte={t('equipe.vide.texte')}
          className="mb-3"
          action={
            <Bouton icone={<UserPlus />} voix="equipe.inviter" onClick={() => setInviterOuvert(true)}>
              {t('equipe.inviter')}
            </Bouton>
          }
        />
      )}

      {membres.length > 0 && (
        <section aria-label={t('equipe.membres')}>
          <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('equipe.membres')}</h2>
          <ul className="divide-y divide-bordure rounded-lg border border-bordure bg-surface">
            {membres.map((m) => (
              <LigneMembre
                key={m.ulid}
                membre={m}
                actions={peutAgirSur(m)}
                onRole={() => setRoleCible(m)}
                onActivation={() => (m.actif ? setDesactiverCible(m) : activation.mutate({ ulid: m.ulid, actif: true }))}
                onRetirer={() => setRetirerCible(m)}
              />
            ))}
          </ul>
        </section>
      )}

      {invitations.length > 0 && (
        <section aria-label={t('equipe.invitations')} className="mt-4">
          <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-texte-3 uppercase">{t('equipe.invitations')}</h2>
          <ul className="divide-y divide-bordure rounded-lg border border-dashed border-bordure-forte bg-surface">
            {invitations.map((inv) => (
              <LigneInvitation key={inv.ulid} invitation={inv} onAnnuler={() => annulation.mutate(inv.ulid)} />
            ))}
          </ul>
        </section>
      )}

      <DialogueInviter ouvert={inviterOuvert} onFermer={() => setInviterOuvert(false)} proprietaire={proprietaire} />

      {roleCible && <DialogueRole membre={roleCible} proprietaire={proprietaire} onFermer={() => setRoleCible(null)} />}

      <Dialogue
        ouvert={Boolean(desactiverCible)}
        onOuvertChange={(o) => !o && setDesactiverCible(null)}
        titre={t('equipe.desactiverTitre', { nom: desactiverCible?.nom ?? '' })}
        description={t('equipe.desactiverTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setDesactiverCible(null)}>
              {t('commun.annuler')}
            </Bouton>
            <Bouton variante="danger" icone={<UserX />} voix="equipe.desactiver" chargement={activation.isPending} onClick={() => desactiverCible && activation.mutate({ ulid: desactiverCible.ulid, actif: false })}>
              {t('equipe.desactiver')}
            </Bouton>
          </>
        }
      />

      <Dialogue
        ouvert={Boolean(retirerCible)}
        onOuvertChange={(o) => !o && setRetirerCible(null)}
        titre={t('equipe.retirerTitre', { nom: retirerCible?.nom ?? '' })}
        description={t('equipe.retirerTexte')}
        taille="sm"
        pied={
          <>
            <Bouton variante="secondaire" voix="commun.annuler" onClick={() => setRetirerCible(null)}>
              {t('commun.annuler')}
            </Bouton>
            <Bouton variante="danger" icone={<UserX />} voix="equipe.retirer" chargement={retrait.isPending} onClick={() => retirerCible && retrait.mutate(retirerCible.ulid)}>
              {t('equipe.retirer')}
            </Bouton>
          </>
        }
      />
    </div>
  )
}

function LigneMembre({ membre: m, actions, onRole, onActivation, onRetirer }: { membre: Membre; actions: boolean; onRole: () => void; onActivation: () => void; onRetirer: () => void }) {
  const { t } = useTranslation()
  const connexion = m.derniere_connexion_le ? tempsRelatif(m.derniere_connexion_le) : null
  return (
    <li className={cn('flex items-center gap-3 px-3 py-2', !m.actif && 'opacity-60')}>
      <Avatar nom={m.nom} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-texte">
          <span className="truncate">{m.nom}</span>
          {m.est_moi && <span className="text-xs font-normal text-texte-3">({t('equipe.moi')})</span>}
          <Pastille ton={TON_ROLE[m.role]}>{t(`roles.${m.role}`)}</Pastille>
          {!m.actif && <Pastille ton="danger">{t('equipe.inactif')}</Pastille>}
        </p>
        <p className="truncate text-xs text-texte-3">
          {m.contact}
          {' · '}
          {connexion ? t('equipe.derniereConnexion', { quand: t(connexion.cle, { count: connexion.count }) }) : t('equipe.jamaisConnecte')}
        </p>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-0.5">
          <BoutonIcone taille="sm" libelle={t('equipe.changerRole')} icone={<ShieldCheck />} voix="equipe.changerRole" onClick={onRole} />
          <BoutonIcone
            taille="sm"
            libelle={m.actif ? t('equipe.desactiver') : t('equipe.reactiver')}
            icone={m.actif ? <UserX /> : <UserCheck />}
            voix={m.actif ? 'equipe.desactiver' : 'equipe.reactiver'}
            onClick={onActivation}
          />
          <BoutonIcone taille="sm" libelle={t('equipe.retirer')} icone={<X />} voix="equipe.retirer" variante="danger" onClick={onRetirer} />
        </div>
      )}
    </li>
  )
}

function LigneInvitation({ invitation: inv, onAnnuler }: { invitation: Invitation; onAnnuler: () => void }) {
  const { t } = useTranslation()
  const expire = tempsRelatif(inv.expire_le)
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-texte-3" aria-hidden="true">
        <Mail size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-medium text-texte">
          <span className="truncate">{inv.contact}</span>
          <Pastille ton={TON_ROLE[inv.role]}>{t(`roles.${inv.role}`)}</Pastille>
        </p>
        <p className="text-xs text-texte-3">{t('equipe.expireLe', { quand: t(expire.cle, { count: expire.count }) })}</p>
      </div>
      <BoutonIcone taille="sm" libelle={t('equipe.annulerInvitation')} icone={<X />} voix="equipe.annulerInvitation" onClick={onAnnuler} />
    </li>
  )
}

function DescriptionsRoles({ roles }: { roles: RoleBoutique[] }) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-col gap-1 rounded-md bg-surface-2 px-3 py-2 text-xs text-texte-2">
      {roles.map((r) => (
        <li key={r}>
          <span className="font-medium text-texte">{t(`roles.${r}`)}</span> — {t(DESCRIPTION_ROLE[r])}
        </li>
      ))}
    </ul>
  )
}

function DialogueInviter({ ouvert, onFermer, proprietaire }: { ouvert: boolean; onFermer: () => void; proprietaire: boolean }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  useSaisieEnCours(ouvert)
  const [contact, setContact] = useState('')
  const [role, setRole] = useState<RoleBoutique>('caissier')
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreurContact, setErreurContact] = useState<string | undefined>()
  // Invitation par téléphone : aucun SMS n'est envoyé, le lien est affiché pour être transmis (WhatsApp, copie).
  const [lien, setLien] = useState<string | null>(null)
  const roles = proprietaire ? ROLES : ROLES.filter((r) => r !== 'proprietaire')

  const fermer = () => {
    setLien(null)
    onFermer()
  }

  const invitation = useMutation({
    mutationFn: () => inviter(contact.trim(), role),
    onSuccess: ({ invitation: creee }) => {
      notifier({ type: 'succes', titre: t('equipe.invitationEnvoyee'), voix: 'equipe.invitationEnvoyee' })
      void queryClient.invalidateQueries({ queryKey: CLE_EQUIPE })
      setContact('')
      setRole('caissier')
      if (creee.lien) setLien(creee.lien)
      else onFermer()
    },
    onError: (e) => {
      if (e instanceof ErreurApi && e.estValidation && e.champ('contact')) setErreurContact(e.champ('contact'))
      else setErreur(messageErreur(e))
    },
  })

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    setErreurContact(undefined)
    if (!contact.trim()) {
      setErreurContact(t('auth.champRequis'))
      return
    }
    invitation.mutate()
  }

  if (lien) {
    return (
      <Dialogue
        ouvert={ouvert}
        onOuvertChange={(o) => !o && fermer()}
        titre={t('equipe.lienTitre')}
        description={t('equipe.lienTexte')}
        taille="sm"
        pied={
          <Bouton voix="commun.fermer" onClick={fermer}>
            {t('commun.fermer')}
          </Bouton>
        }
      >
        <div className="flex flex-col gap-3 pb-1">
          <Champ libelle={t('equipe.lienInvitation')} value={lien} readOnly onFocus={(e) => e.currentTarget.select()} data-lien-invitation="" />
          <div className="flex flex-wrap gap-2">
            <Bouton
              variante="secondaire"
              icone={<Copy />}
              voix="equipe.copierLien"
              onClick={() => {
                void copier(lien).then((ok) => ok && notifier({ type: 'succes', titre: t('equipe.lienCopie'), voix: 'equipe.lienCopie' }))
              }}
            >
              {t('equipe.copierLien')}
            </Bouton>
            <Bouton variante="secondaire" icone={<MessageCircle />} voix="equipe.envoyerWhatsApp" onClick={() => window.open(lienWhatsApp(lien), '_blank', 'noopener,noreferrer')}>
              {t('equipe.envoyerWhatsApp')}
            </Bouton>
          </div>
        </div>
      </Dialogue>
    )
  }

  return (
    <Dialogue
      ouvert={ouvert}
      onOuvertChange={(o) => !o && onFermer()}
      titre={t('equipe.inviterTitre')}
      description={t('equipe.inviterTexte')}
      taille="sm"
      pied={
        <>
          <Bouton variante="secondaire" voix="commun.annuler" onClick={onFermer}>
            {t('commun.annuler')}
          </Bouton>
          <Bouton type="submit" form="formulaire-inviter" icone={<UserPlus />} voix="equipe.inviter" chargement={invitation.isPending}>
            {t('equipe.inviter')}
          </Bouton>
        </>
      }
    >
      <form id="formulaire-inviter" onSubmit={soumettre} noValidate className="flex flex-col gap-3 pb-1">
        <Champ libelle={t('equipe.contact')} value={contact} onChange={(e) => setContact(e.target.value)} erreur={erreurContact} inputMode="email" autoComplete="off" autoCapitalize="none" icone={<Mail />} autoFocus />
        <Selection libelle={t('equipe.role')} value={role} onChange={(e) => setRole(e.target.value as RoleBoutique)} options={roles.map((r) => ({ valeur: r, libelle: t(`roles.${r}`) }))} />
        <DescriptionsRoles roles={roles} />
        <ErreurFormulaire message={erreur} />
      </form>
    </Dialogue>
  )
}

function DialogueRole({ membre, proprietaire, onFermer }: { membre: Membre; proprietaire: boolean; onFermer: () => void }) {
  const { t } = useTranslation()
  const messageErreur = useMessageErreur()
  const [role, setRole] = useState<RoleBoutique>(membre.role)
  const [erreur, setErreur] = useState<string | null>(null)
  const roles = proprietaire ? ROLES : ROLES.filter((r) => r !== 'proprietaire')

  const modification = useMutation({
    mutationFn: () => modifierMembre(membre.ulid, { role }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLE_EQUIPE })
      onFermer()
    },
    onError: (e) => setErreur(messageErreur(e)),
  })

  return (
    <Dialogue
      ouvert
      onOuvertChange={(o) => !o && onFermer()}
      titre={t('equipe.changerRole')}
      description={membre.nom}
      taille="sm"
      pied={
        <>
          <Bouton variante="secondaire" voix="commun.annuler" onClick={onFermer}>
            {t('commun.annuler')}
          </Bouton>
          <Bouton icone={<ShieldCheck />} voix="commun.enregistrer" chargement={modification.isPending} disabled={role === membre.role} onClick={() => modification.mutate()}>
            {t('commun.enregistrer')}
          </Bouton>
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-1">
        <Selection libelle={t('equipe.role')} value={role} onChange={(e) => setRole(e.target.value as RoleBoutique)} options={roles.map((r) => ({ valeur: r, libelle: t(`roles.${r}`) }))} />
        <DescriptionsRoles roles={roles} />
        <ErreurFormulaire message={erreur} />
      </div>
    </Dialogue>
  )
}
