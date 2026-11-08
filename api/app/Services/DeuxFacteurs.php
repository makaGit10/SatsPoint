<?php

namespace App\Services;

use App\Exceptions\ErreurMetier;
use App\Models\User;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use PragmaRX\Google2FA\Google2FA;

/**
 * Double authentification TOTP (RFC 6238) — CAHIER § 6.1, § 13 (super-admin : obligatoire).
 *
 * - secret chiffré en base (cast Chiffre, clé dédiée), jamais renvoyé après l'initialisation ;
 * - 8 codes de secours à usage unique, HACHÉS en base, renvoyés une seule fois à l'activation ;
 * - anti-rejeu : un même code TOTP ne peut servir qu'une fois (horodatage du dernier code accepté) ;
 * - la session mémorise la validation (`deux_fa_validee`), remise à zéro à chaque connexion.
 */
class DeuxFacteurs
{
    public const CLE_SESSION = 'deux_fa_validee';

    public const NB_CODES_SECOURS = 8;

    private const FENETRE = 1; // ± 30 s

    public function __construct(private readonly Google2FA $totp) {}

    /** Génère un secret (non activé) et le QR code SVG à scanner. */
    public function initialiser(User $utilisateur): array
    {
        if ($utilisateur->deuxFaActive()) {
            throw new ErreurMetier('DEUX_FA_DEJA_ACTIVE', 'La double authentification est déjà active. Désactivez-la d\'abord.', 409);
        }

        $secret = $this->totp->generateSecretKey(32);

        $utilisateur->forceFill(['two_factor_secret' => $secret, 'two_factor_confirmed_at' => null, 'two_factor_recovery_codes' => null])->save();

        $url = $this->totp->getQRCodeUrl(config('app.name', 'SatsPoint'), $utilisateur->identifiantPrincipal() ?? $utilisateur->ulid, $secret);

        return ['secret' => $secret, 'otpauth_url' => $url, 'qr_svg' => $this->svg($url)];
    }

    /**
     * Confirme le secret avec un premier code valide, génère les codes de secours (renvoyés une seule fois).
     *
     * @return list<string>
     */
    public function activer(User $utilisateur, string $code): array
    {
        if ($utilisateur->deuxFaActive()) {
            throw new ErreurMetier('DEUX_FA_DEJA_ACTIVE', 'La double authentification est déjà active.', 409);
        }

        if (blank($utilisateur->two_factor_secret)) {
            throw new ErreurMetier('DEUX_FA_NON_INITIALISEE', 'Commencez par scanner le QR code (initialisation).', 409);
        }

        if (! $this->verifierTotp($utilisateur, $code)) {
            throw new ErreurMetier('CODE_INVALIDE', 'Code incorrect. Vérifiez l\'heure de votre téléphone et réessayez.', 422);
        }

        $codes = $this->genererCodesSecours();

        $utilisateur->forceFill([
            'two_factor_confirmed_at' => now(),
            // Hachage de la forme normalisée (sans tiret, majuscules) : la saisie est normalisée de la même façon.
            'two_factor_recovery_codes' => json_encode(array_map(fn (string $c) => Hash::make(self::nettoyerCode($c)), $codes)),
        ])->save();

        return $codes;
    }

    /** Vérifie un code TOTP ou un code de secours (consommé) et marque la session. */
    public function verifier(User $utilisateur, string $code, ?Request $requete = null): string
    {
        if (! $utilisateur->deuxFaActive()) {
            throw new ErreurMetier('DEUX_FA_INACTIVE', 'La double authentification n\'est pas active sur ce compte.', 409);
        }

        $code = self::nettoyerCode($code);

        if ($this->verifierTotp($utilisateur, $code)) {
            $methode = 'totp';
        } elseif ($this->consommerCodeSecours($utilisateur, $code)) {
            $methode = 'secours';
        } else {
            throw new ErreurMetier('CODE_INVALIDE', 'Code incorrect.', 422);
        }

        if ($requete?->hasSession()) {
            $requete->session()->put(self::CLE_SESSION, now()->toIso8601String());
        }

        return $methode;
    }

    /** Désactive la 2FA (mot de passe revérifié par le contrôleur). */
    public function desactiver(User $utilisateur): void
    {
        $utilisateur->forceFill(['two_factor_secret' => null, 'two_factor_confirmed_at' => null, 'two_factor_recovery_codes' => null])->save();
    }

    public static function sessionValidee(?Request $requete): bool
    {
        return $requete !== null && $requete->hasSession() && is_string($requete->session()->get(self::CLE_SESSION));
    }

    /** État exposé par GET /moi : { active, requise, validee }. */
    public static function etat(User $utilisateur, ?Request $requete): array
    {
        $active = $utilisateur->deuxFaActive();

        return [
            'active' => $active,
            'requise' => $utilisateur->deuxFaRequise(),
            'validee' => $active && self::sessionValidee($requete),
        ];
    }

    // ------------------------------------------------------------------

    private function verifierTotp(User $utilisateur, string $code): bool
    {
        if (preg_match('/^\d{6}$/', $code) !== 1) {
            return false;
        }

        $secret = (string) $utilisateur->two_factor_secret;
        $cleRejeu = 'deux_fa:dernier:'.$utilisateur->id;
        $dernier = (int) Cache::get($cleRejeu, 0);

        try {
            $horodatage = $this->totp->verifyKeyNewer($secret, $code, $dernier, self::FENETRE);
        } catch (\Throwable) {
            return false;
        }

        if ($horodatage === false) {
            return false;
        }

        // Anti-rejeu : le code (et les précédents) ne pourra plus être accepté.
        Cache::put($cleRejeu, (int) $horodatage, 180);

        return true;
    }

    private function consommerCodeSecours(User $utilisateur, string $code): bool
    {
        if (preg_match('/^[A-Z0-9]{8}$/i', $code) !== 1) {
            return false;
        }

        return DB::transaction(function () use ($utilisateur, $code) {
            $frais = User::query()->whereKey($utilisateur->id)->lockForUpdate()->first();
            $haches = json_decode((string) $frais?->two_factor_recovery_codes, true);

            if (! is_array($haches)) {
                return false;
            }

            foreach ($haches as $i => $hache) {
                if (is_string($hache) && Hash::check($code, $hache)) {
                    unset($haches[$i]);
                    $frais->forceFill(['two_factor_recovery_codes' => json_encode(array_values($haches))])->save();
                    $utilisateur->two_factor_recovery_codes = $frais->two_factor_recovery_codes;

                    return true;
                }
            }

            return false;
        });
    }

    /** @return list<string> codes « XXXX-XXXX » (lettres majuscules et chiffres sans ambiguïté). */
    private function genererCodesSecours(): array
    {
        $codes = [];
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

        while (count($codes) < self::NB_CODES_SECOURS) {
            $brut = '';
            for ($i = 0; $i < 8; $i++) {
                $brut .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $codes[] = substr($brut, 0, 4).'-'.substr($brut, 4);
        }

        return array_values(array_unique($codes)) === $codes ? $codes : $this->genererCodesSecours();
    }

    private function svg(string $contenu): string
    {
        $rendu = new ImageRenderer(new RendererStyle(240, 1), new SvgImageBackEnd);

        return (new Writer($rendu))->writeString($contenu);
    }

    /** Codes de secours restants (nombre seulement). */
    public static function codesSecoursRestants(User $utilisateur): int
    {
        $haches = json_decode((string) $utilisateur->two_factor_recovery_codes, true);

        return is_array($haches) ? count($haches) : 0;
    }

    public static function nettoyerCode(string $code): string
    {
        return Str::upper(preg_replace('/[\s-]+/', '', $code) ?? '');
    }
}
