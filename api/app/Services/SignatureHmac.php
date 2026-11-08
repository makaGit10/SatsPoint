<?php

namespace App\Services;

/**
 * Signature HMAC du contrat API ↔ passerelle (docs/CONTRAT_PASSERELLE.md § 1).
 *
 * message = timestamp . "." . nonce . "." . METHODE . "." . chemin_avec_query . "." . sha256hex(corps)
 * signature = hex( HMAC-SHA256( secret, message ) )
 */
final class SignatureHmac
{
    public const EN_TETE_HORODATAGE = 'X-SP-Timestamp';

    public const EN_TETE_NONCE = 'X-SP-Nonce';

    public const EN_TETE_SIGNATURE = 'X-SP-Signature';

    public function __construct(private readonly string $secret) {}

    public function secretConfigure(): bool
    {
        return $this->secret !== '';
    }

    public function message(int|string $horodatage, string $nonce, string $methode, string $cheminAvecQuery, string $corps): string
    {
        return $horodatage.'.'.$nonce.'.'.strtoupper($methode).'.'.$cheminAvecQuery.'.'.hash('sha256', $corps);
    }

    public function signer(int|string $horodatage, string $nonce, string $methode, string $cheminAvecQuery, string $corps): string
    {
        return hash_hmac('sha256', $this->message($horodatage, $nonce, $methode, $cheminAvecQuery, $corps), $this->secret);
    }

    public function verifier(string $signature, int|string $horodatage, string $nonce, string $methode, string $cheminAvecQuery, string $corps): bool
    {
        if (! $this->secretConfigure() || ! preg_match('/^[a-f0-9]{64}$/i', $signature)) {
            return false;
        }

        return hash_equals($this->signer($horodatage, $nonce, $methode, $cheminAvecQuery, $corps), strtolower($signature));
    }

    public static function nonce(): string
    {
        return bin2hex(random_bytes(16));
    }

    public static function nonceValide(string $nonce): bool
    {
        return (bool) preg_match('/^[a-f0-9]{32,128}$/i', $nonce);
    }

    /** @return array<string, string> en-têtes à joindre à une requête sortante */
    public function enTetes(string $methode, string $cheminAvecQuery, string $corps): array
    {
        $horodatage = (string) time();
        $nonce = self::nonce();

        return [
            self::EN_TETE_HORODATAGE => $horodatage,
            self::EN_TETE_NONCE => $nonce,
            self::EN_TETE_SIGNATURE => $this->signer($horodatage, $nonce, $methode, $cheminAvecQuery, $corps),
        ];
    }
}
