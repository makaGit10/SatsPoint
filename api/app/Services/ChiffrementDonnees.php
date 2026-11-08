<?php

namespace App\Services;

use App\Exceptions\ChiffrementException;

/**
 * Chiffrement des données sensibles en base (secret NWC, clés PayTech, secret 2FA).
 *
 * AES-256-GCM (authentifié) avec une clé DÉDIÉE (DATA_ENCRYPTION_KEY), distincte de APP_KEY :
 * une fuite de la base ou d'APP_KEY ne suffit pas à lire les secrets des commerçants.
 *
 * Format stocké : "v1:" + base64( iv (12 octets) | tag (16 octets) | chiffré ).
 */
final class ChiffrementDonnees
{
    private const VERSION = 'v1';

    private const IV_OCTETS = 12;

    private const TAG_OCTETS = 16;

    private const ALGO = 'aes-256-gcm';

    private readonly string $cle;

    public function __construct(?string $cleEncodee)
    {
        $cleEncodee = (string) $cleEncodee;

        if (str_starts_with($cleEncodee, 'base64:')) {
            $cle = base64_decode(substr($cleEncodee, 7), true);
        } else {
            $cle = $cleEncodee;
        }

        if ($cle === false || strlen($cle) !== 32) {
            throw new ChiffrementException('DATA_ENCRYPTION_KEY absente ou invalide : 32 octets attendus (format "base64:...").');
        }

        $this->cle = $cle;
    }

    /**
     * Chiffre une valeur texte. $contexte (AAD) lie le chiffré à son usage (ex. nom de colonne)
     * pour qu'un chiffré déplacé vers une autre colonne ne puisse pas être déchiffré.
     */
    public function chiffrer(#[\SensitiveParameter] string $clair, string $contexte = ''): string
    {
        $iv = random_bytes(self::IV_OCTETS);
        $tag = '';

        $chiffre = openssl_encrypt($clair, self::ALGO, $this->cle, OPENSSL_RAW_DATA, $iv, $tag, $contexte, self::TAG_OCTETS);

        if ($chiffre === false || strlen($tag) !== self::TAG_OCTETS) {
            throw new ChiffrementException('Échec du chiffrement.');
        }

        return self::VERSION.':'.base64_encode($iv.$tag.$chiffre);
    }

    public function dechiffrer(string $stocke, string $contexte = ''): string
    {
        $parties = explode(':', $stocke, 2);

        if (count($parties) !== 2 || $parties[0] !== self::VERSION) {
            throw new ChiffrementException('Format de donnée chiffrée inconnu.');
        }

        $brut = base64_decode($parties[1], true);

        if ($brut === false || strlen($brut) < self::IV_OCTETS + self::TAG_OCTETS) {
            throw new ChiffrementException('Donnée chiffrée corrompue.');
        }

        $iv = substr($brut, 0, self::IV_OCTETS);
        $tag = substr($brut, self::IV_OCTETS, self::TAG_OCTETS);
        $chiffre = substr($brut, self::IV_OCTETS + self::TAG_OCTETS);

        $clair = openssl_decrypt($chiffre, self::ALGO, $this->cle, OPENSSL_RAW_DATA, $iv, $tag, $contexte);

        if ($clair === false) {
            throw new ChiffrementException('Déchiffrement impossible (clé différente ou donnée altérée).');
        }

        return $clair;
    }

    public static function estChiffre(?string $valeur): bool
    {
        return is_string($valeur) && str_starts_with($valeur, self::VERSION.':');
    }
}
