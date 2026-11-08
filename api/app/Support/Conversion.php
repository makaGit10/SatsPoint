<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * Conversions monétaires (CAHIER § 7.1). Tout est ENTIER : FCFA, sats, millisats. Aucun flottant pour l'argent.
 */
final class Conversion
{
    public const SATS_PAR_BTC = 100_000_000;

    public const MSATS_PAR_SAT = 1_000;

    /** Parité fixe 1 EUR = 655,957 XOF (exprimée en millièmes pour rester en entiers). */
    public const XOF_PAR_EUR_MILLIEMES = 655_957;

    /**
     * FCFA → sats, arrondi au sat SUPÉRIEUR : le commerçant reçoit toujours au moins le prix affiché.
     * sats = ⌈ xof × 100 000 000 / btc_xof ⌉, calculé en entiers (pas de dérive flottante).
     */
    public static function xofVersSats(int $xof, int $btcXof): int
    {
        if ($xof < 0) {
            throw new InvalidArgumentException('Le montant en FCFA doit être positif.');
        }
        if ($btcXof <= 0) {
            throw new InvalidArgumentException('Le cours BTC/XOF doit être strictement positif.');
        }
        if ($xof === 0) {
            return 0;
        }

        // Produit en entiers (jusqu'à 2 000 000 × 1e8 = 2e14, très loin de PHP_INT_MAX) puis division entière plafonnée.
        $numerateur = $xof * self::SATS_PAR_BTC;

        return intdiv($numerateur, $btcXof) + ($numerateur % $btcXof === 0 ? 0 : 1);
    }

    /** sats → FCFA, arrondi au FCFA le plus proche (affichage du solde, des transactions). */
    public static function satsVersXof(int $sats, int $btcXof): int
    {
        if ($btcXof <= 0) {
            throw new InvalidArgumentException('Le cours BTC/XOF doit être strictement positif.');
        }

        return (int) round($sats * $btcXof / self::SATS_PAR_BTC);
    }

    public static function satsVersMsats(int $sats): int
    {
        return $sats * self::MSATS_PAR_SAT;
    }

    /** msats → sats, arrondi à l'inférieur (un reste de millisats ne fait pas un sat). */
    public static function msatsVersSats(int $msats): int
    {
        return intdiv($msats, self::MSATS_PAR_SAT);
    }

    /** BTC/EUR (flottant venant d'une source) → BTC/XOF entier par la parité fixe. */
    public static function eurVersXof(float $btcEur): int
    {
        return (int) round($btcEur * self::XOF_PAR_EUR_MILLIEMES / 1000);
    }
}
