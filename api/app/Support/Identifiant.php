<?php

namespace App\Support;

/**
 * Normalisation d'un identifiant de connexion : e-mail OU numéro de téléphone (E.164).
 *
 * Téléphones acceptés : sénégalais (7X XXX XX XX, 33 XXX XX XX, avec ou sans +221 / 00221 / 221)
 * ou tout numéro international déjà au format +[indicatif][numéro].
 */
final class Identifiant
{
    public const EMAIL = 'email';

    public const TELEPHONE = 'telephone';

    /**
     * @return array{type: string, valeur: string}|null null si l'identifiant est invalide
     */
    public static function normaliser(?string $brut): ?array
    {
        $brut = trim((string) $brut);

        if ($brut === '' || mb_strlen($brut) > 190) {
            return null;
        }

        if (str_contains($brut, '@')) {
            $email = mb_strtolower($brut);

            if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
                return null;
            }

            return ['type' => self::EMAIL, 'valeur' => $email];
        }

        $telephone = self::normaliserTelephone($brut);

        return $telephone === null ? null : ['type' => self::TELEPHONE, 'valeur' => $telephone];
    }

    public static function normaliserTelephone(string $brut): ?string
    {
        $chiffres = preg_replace('/[\s\.\-\(\)]/', '', $brut);

        if ($chiffres === null || ! preg_match('/^\+?\d{8,16}$/', $chiffres)) {
            return null;
        }

        $international = str_starts_with($chiffres, '+');
        $chiffres = ltrim($chiffres, '+');

        if (! $international && str_starts_with($chiffres, '00')) {
            $chiffres = substr($chiffres, 2);
            $international = true;
        }

        // Sénégal : 9 chiffres locaux (mobiles 7X, fixes 3X)
        if (! $international && preg_match('/^[37]\d{8}$/', $chiffres)) {
            return '+221'.$chiffres;
        }

        if (preg_match('/^221([37]\d{8})$/', $chiffres, $m)) {
            return '+221'.$m[1];
        }

        if ($international && preg_match('/^[1-9]\d{7,14}$/', $chiffres)) {
            return '+'.$chiffres;
        }

        return null;
    }

    /** Colonne de la table users correspondant au type. */
    public static function colonne(string $type): string
    {
        return $type === self::EMAIL ? 'email' : 'telephone';
    }

    /** Masque un identifiant pour l'affichage ou le journal (jamais la valeur complète). */
    public static function masquer(?string $valeur): ?string
    {
        if ($valeur === null || $valeur === '') {
            return null;
        }

        if (str_contains($valeur, '@')) {
            [$local, $domaine] = explode('@', $valeur, 2);

            return mb_substr($local, 0, 2).'***@'.$domaine;
        }

        return substr($valeur, 0, 4).'*****'.substr($valeur, -2);
    }
}
