<?php

namespace Database\Seeders;

use App\Models\CleAudio;
use Illuminate\Database\Seeder;

/**
 * Clés vocales ESSENTIELLES du parcours d'encaissement (CAHIER § 6.13 « priorité de couverture »).
 *
 * Idempotent : utilisé tant que le front n'a pas produit `cles-vocales.json` (la commande
 * `audio:synchroniser` prend ensuite le relais et devient la source de vérité). Les clés déjà présentes
 * gardent leur ordre et leurs textes s'ils ont été synchronisés depuis le code.
 */
class CleAudioSeeder extends Seeder
{
    /** @return list<array{cle: string, ecran: string, contexte: string, texte_fr: string, texte_en: string}> */
    public static function essentielles(): array
    {
        return [
            ['cle' => 'langue.titre', 'ecran' => 'langue', 'contexte' => 'Titre de l\'écran de choix de la langue', 'texte_fr' => 'Choisissez votre langue', 'texte_en' => 'Choose your language'],
            ['cle' => 'langue.wo', 'ecran' => 'langue', 'contexte' => 'Tuile de langue : dit « Wolof » en wolof', 'texte_fr' => 'Wolof', 'texte_en' => 'Wolof'],
            ['cle' => 'langue.srr', 'ecran' => 'langue', 'contexte' => 'Tuile de langue : dit « Seereer » en sérère', 'texte_fr' => 'Sérère', 'texte_en' => 'Serer'],
            ['cle' => 'langue.ff', 'ecran' => 'langue', 'contexte' => 'Tuile de langue : dit « Pulaar » en pulaar', 'texte_fr' => 'Pulaar', 'texte_en' => 'Pulaar'],
            ['cle' => 'langue.dyo', 'ecran' => 'langue', 'contexte' => 'Tuile de langue : dit « Joola » en diola', 'texte_fr' => 'Diola', 'texte_en' => 'Jola'],
            ['cle' => 'langue.fr', 'ecran' => 'langue', 'contexte' => 'Tuile de langue : dit « Français »', 'texte_fr' => 'Français', 'texte_en' => 'French'],
            ['cle' => 'langue.en', 'ecran' => 'langue', 'contexte' => 'Tuile de langue : dit « English »', 'texte_fr' => 'Anglais', 'texte_en' => 'English'],
            ['cle' => 'accueil.creer_boutique', 'ecran' => 'accueil', 'contexte' => 'Bouton principal de l\'accueil', 'texte_fr' => 'Créer ma boutique', 'texte_en' => 'Create my shop'],
            ['cle' => 'accueil.me_connecter', 'ecran' => 'accueil', 'contexte' => 'Bouton secondaire de l\'accueil', 'texte_fr' => 'Me connecter', 'texte_en' => 'Sign in'],
            ['cle' => 'auth.connexion.valider', 'ecran' => 'connexion', 'contexte' => 'Bouton de validation du formulaire de connexion', 'texte_fr' => 'Me connecter', 'texte_en' => 'Sign in'],
            ['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'contexte' => 'Bouton principal : lance la demande de paiement', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge'],
            ['cle' => 'caisse.effacer', 'ecran' => 'caisse', 'contexte' => 'Pavé numérique : efface le montant saisi', 'texte_fr' => 'Effacer', 'texte_en' => 'Clear'],
            ['cle' => 'caisse.note', 'ecran' => 'caisse', 'contexte' => 'Champ facultatif : note sur la vente', 'texte_fr' => 'Note', 'texte_en' => 'Note'],
            ['cle' => 'paiement.lightning', 'ecran' => 'paiement', 'contexte' => 'Choix du moyen : bitcoin Lightning', 'texte_fr' => 'Payer en bitcoin', 'texte_en' => 'Pay with bitcoin'],
            ['cle' => 'paiement.mobile_money', 'ecran' => 'paiement', 'contexte' => 'Choix du moyen : Wave, Orange Money, Free Money', 'texte_fr' => 'Payer par mobile money', 'texte_en' => 'Pay with mobile money'],
            ['cle' => 'paiement.copier', 'ecran' => 'paiement', 'contexte' => 'Copie la facture ou le lien de paiement', 'texte_fr' => 'Copier', 'texte_en' => 'Copy'],
            ['cle' => 'paiement.partager', 'ecran' => 'paiement', 'contexte' => 'Partage la facture ou le lien de paiement', 'texte_fr' => 'Partager', 'texte_en' => 'Share'],
            ['cle' => 'paiement.annuler', 'ecran' => 'paiement', 'contexte' => 'Annule la vente en attente', 'texte_fr' => 'Annuler', 'texte_en' => 'Cancel'],
            ['cle' => 'paiement.nouvelle_demande', 'ecran' => 'paiement', 'contexte' => 'Relance une demande (facture expirée, autre moyen)', 'texte_fr' => 'Nouvelle demande', 'texte_en' => 'New request'],
            ['cle' => 'paiement.verifier', 'ecran' => 'paiement', 'contexte' => 'Force la vérification du paiement auprès du portefeuille', 'texte_fr' => 'Vérifier le paiement', 'texte_en' => 'Check payment'],
            ['cle' => 'paiement.recu', 'ecran' => 'paiement', 'contexte' => 'Annonce automatique : paiement reçu', 'texte_fr' => 'Paiement reçu', 'texte_en' => 'Payment received'],
            ['cle' => 'paiement.expire', 'ecran' => 'paiement', 'contexte' => 'Annonce automatique : facture expirée', 'texte_fr' => 'Facture expirée', 'texte_en' => 'Invoice expired'],
            ['cle' => 'paiement.annule', 'ecran' => 'paiement', 'contexte' => 'Annonce automatique : paiement annulé', 'texte_fr' => 'Paiement annulé', 'texte_en' => 'Payment cancelled'],
            ['cle' => 'succes.envoyer_recu', 'ecran' => 'succes', 'contexte' => 'Écran de succès : partage le reçu au client', 'texte_fr' => 'Envoyer le reçu', 'texte_en' => 'Send receipt'],
            ['cle' => 'succes.nouvelle_vente', 'ecran' => 'succes', 'contexte' => 'Écran de succès : retour à la caisse', 'texte_fr' => 'Nouvelle vente', 'texte_en' => 'New sale'],
            ['cle' => 'nav.caisse', 'ecran' => 'navigation', 'contexte' => 'Onglet de navigation', 'texte_fr' => 'Caisse', 'texte_en' => 'Checkout'],
            ['cle' => 'nav.ventes', 'ecran' => 'navigation', 'contexte' => 'Onglet de navigation', 'texte_fr' => 'Ventes', 'texte_en' => 'Sales'],
            ['cle' => 'nav.tableau_de_bord', 'ecran' => 'navigation', 'contexte' => 'Onglet de navigation', 'texte_fr' => 'Tableau de bord', 'texte_en' => 'Dashboard'],
            ['cle' => 'nav.portefeuille', 'ecran' => 'navigation', 'contexte' => 'Onglet de navigation', 'texte_fr' => 'Portefeuille', 'texte_en' => 'Wallet'],
            ['cle' => 'nav.plus', 'ecran' => 'navigation', 'contexte' => 'Onglet de navigation : autres rubriques', 'texte_fr' => 'Plus', 'texte_en' => 'More'],
            ['cle' => 'ventes.recu', 'ecran' => 'ventes', 'contexte' => 'Détail d\'une vente : ouvre le reçu', 'texte_fr' => 'Reçu', 'texte_en' => 'Receipt'],
            ['cle' => 'ventes.annuler', 'ecran' => 'ventes', 'contexte' => 'Détail d\'une vente : annule la vente en attente', 'texte_fr' => 'Annuler la vente', 'texte_en' => 'Cancel sale'],
            ['cle' => 'wallet.recevoir', 'ecran' => 'portefeuille', 'contexte' => 'Crée une facture pour recevoir des sats', 'texte_fr' => 'Recevoir', 'texte_en' => 'Receive'],
            ['cle' => 'wallet.envoyer', 'ecran' => 'portefeuille', 'contexte' => 'Envoie des sats (propriétaire)', 'texte_fr' => 'Envoyer', 'texte_en' => 'Send'],
            ['cle' => 'commun.annuler', 'ecran' => 'commun', 'contexte' => 'Bouton générique', 'texte_fr' => 'Annuler', 'texte_en' => 'Cancel'],
            ['cle' => 'commun.confirmer', 'ecran' => 'commun', 'contexte' => 'Bouton générique', 'texte_fr' => 'Confirmer', 'texte_en' => 'Confirm'],
            ['cle' => 'commun.retour', 'ecran' => 'commun', 'contexte' => 'Bouton générique', 'texte_fr' => 'Retour', 'texte_en' => 'Back'],
        ];
    }

    public function run(): void
    {
        $ordre = 0;

        foreach (self::essentielles() as $donnees) {
            $ordre++;
            $existante = CleAudio::query()->where('cle', $donnees['cle'])->first();

            if ($existante === null) {
                CleAudio::create($donnees + ['essentielle' => true, 'ordre' => $ordre, 'presente_dans_code' => true]);

                continue;
            }

            // Déjà synchronisée depuis le code : on ne touche qu'au marquage « essentielle ».
            if (! $existante->essentielle) {
                $existante->forceFill(['essentielle' => true])->save();
            }
        }
    }
}
