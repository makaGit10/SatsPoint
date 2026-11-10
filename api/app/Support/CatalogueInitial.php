<?php

namespace App\Support;

/**
 * Graines du catalogue pays / langues / moyens de paiement (CONTRAT_API § 14.2).
 *
 * Insérées par la migration 2026_11_10_000010 (idempotent) et modifiables ensuite par le super-admin.
 * Périmètre : zone franc CFA XOF (UEMOA) — une seule devise. Les autres devises (GNF, XAF…) sont hors périmètre.
 */
final class CatalogueInitial
{
    /** @return list<array{code: string, nom_fr: string, nom_en: string, indicatif: string, ordre: int}> */
    public static function pays(): array
    {
        return [
            ['code' => 'SN', 'nom_fr' => 'Sénégal', 'nom_en' => 'Senegal', 'indicatif' => '+221', 'ordre' => 1],
            ['code' => 'BJ', 'nom_fr' => 'Bénin', 'nom_en' => 'Benin', 'indicatif' => '+229', 'ordre' => 2],
            ['code' => 'BF', 'nom_fr' => 'Burkina Faso', 'nom_en' => 'Burkina Faso', 'indicatif' => '+226', 'ordre' => 3],
            ['code' => 'CI', 'nom_fr' => 'Côte d\'Ivoire', 'nom_en' => 'Côte d\'Ivoire', 'indicatif' => '+225', 'ordre' => 4],
            ['code' => 'GW', 'nom_fr' => 'Guinée-Bissau', 'nom_en' => 'Guinea-Bissau', 'indicatif' => '+245', 'ordre' => 5],
            ['code' => 'ML', 'nom_fr' => 'Mali', 'nom_en' => 'Mali', 'indicatif' => '+223', 'ordre' => 6],
            ['code' => 'NE', 'nom_fr' => 'Niger', 'nom_en' => 'Niger', 'indicatif' => '+227', 'ordre' => 7],
            ['code' => 'TG', 'nom_fr' => 'Togo', 'nom_en' => 'Togo', 'indicatif' => '+228', 'ordre' => 8],
        ];
    }

    /**
     * Langues de départ : comportement actuel strictement identique pour le Sénégal.
     * `nom_fr` reprend le nom affiché jusqu'ici (config satspoint.langues_audio).
     *
     * @return list<array{code: string, nom_local: string, nom_fr: string, nom_en: string, pays: list<string>, ordre: int}>
     */
    public static function langues(): array
    {
        return [
            ['code' => 'wo', 'nom_local' => 'Wolof', 'nom_fr' => 'Wolof', 'nom_en' => 'Wolof', 'pays' => ['SN'], 'ordre' => 1],
            ['code' => 'srr', 'nom_local' => 'Seereer', 'nom_fr' => 'Sérère', 'nom_en' => 'Serer', 'pays' => ['SN'], 'ordre' => 2],
            ['code' => 'ff', 'nom_local' => 'Pulaar', 'nom_fr' => 'Pulaar', 'nom_en' => 'Pulaar', 'pays' => ['SN'], 'ordre' => 3],
            ['code' => 'dyo', 'nom_local' => 'Joola', 'nom_fr' => 'Diola', 'nom_en' => 'Jola', 'pays' => ['SN'], 'ordre' => 4],
            ['code' => 'fr', 'nom_local' => 'Français', 'nom_fr' => 'Français', 'nom_en' => 'French', 'pays' => [], 'ordre' => 100],
        ];
    }

    /**
     * Moyens de paiement indicatifs par pays (aucun pour SN : PayTech et le Wave direct suffisent).
     *
     * @return list<array{pays: string, nom: string, type: string, couleur: string, ordre: int, instructions_fr: string, instructions_en: string}>
     */
    public static function moyens(): array
    {
        $liste = [
            'CI' => ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money'],
            'ML' => ['Orange Money', 'Moov Money', 'Wave'],
            'BF' => ['Orange Money', 'Moov Money'],
            'NE' => ['Airtel Money', 'Moov Money'],
            'TG' => ['Mixx by Yas', 'Flooz'],
            'BJ' => ['MTN MoMo', 'Moov Money'],
            'GW' => ['Orange Money', 'MTN MoMo'],
        ];

        $moyens = [];

        foreach ($liste as $pays => $noms) {
            foreach ($noms as $i => $nom) {
                $type = $nom === 'Wave' ? 'lien' : 'numero';
                $moyens[] = [
                    'pays' => $pays,
                    'nom' => $nom,
                    'type' => $type,
                    'couleur' => self::couleur($nom),
                    'ordre' => $i + 1,
                    'instructions_fr' => $type === 'lien'
                        ? "Scannez le QR avec l'application {$nom}, puis montrez la confirmation."
                        : "Payez avec {$nom} au numéro affiché, puis montrez le message de confirmation.",
                    'instructions_en' => $type === 'lien'
                        ? "Scan the QR code with the {$nom} app, then show the confirmation."
                        : "Pay with {$nom} to the number shown, then show the confirmation message.",
                ];
            }
        }

        return $moyens;
    }

    private static function couleur(string $nom): string
    {
        return match ($nom) {
            'Wave' => 'ciel',
            'Orange Money' => 'orange',
            'MTN MoMo', 'Mixx by Yas' => 'jaune',
            'Moov Money' => 'bleu',
            'Airtel Money' => 'rouge',
            'Flooz' => 'vert',
            default => 'gris',
        };
    }
}
