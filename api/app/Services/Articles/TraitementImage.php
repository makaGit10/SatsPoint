<?php

namespace App\Services\Articles;

use App\Exceptions\ErreurMetier;

/**
 * Photo d'article : vérification du TYPE RÉEL (signature binaire, jamais l'extension ni le type annoncé),
 * dimensions bornées AVANT décodage (anti-bombe de décompression), puis RÉ-ENCODAGE systématique par GD :
 * redressement selon l'orientation EXIF, réduction à 512 px de côté au plus, WebP qualité 80.
 * Le fichier produit est entièrement neuf : aucune métadonnée d'origine (EXIF, GPS, profil, commentaire)
 * ni aucun octet du fichier reçu n'est conservé.
 */
class TraitementImage
{
    public function __construct(
        private readonly int $pixelsMax = 25_000_000,
        private readonly int $cote = 512,
        private readonly int $qualite = 80,
    ) {}

    /**
     * @return array{contenu: string, largeur: int, hauteur: int, mime: string}
     *
     * @throws ErreurMetier PHOTO_TYPE_INVALIDE | PHOTO_ILLISIBLE | PHOTO_TROP_GRANDE
     */
    public function convertir(string $chemin): array
    {
        $format = $this->formatParSignature($chemin)
            ?? throw new ErreurMetier('PHOTO_TYPE_INVALIDE', 'Le fichier n\'est pas une photo reconnue (JPEG, PNG ou WebP).', 422);

        $infos = @getimagesize($chemin);
        $attendu = ['jpeg' => IMAGETYPE_JPEG, 'png' => IMAGETYPE_PNG, 'webp' => IMAGETYPE_WEBP][$format];

        if ($infos === false || ($infos[2] ?? null) !== $attendu) {
            throw new ErreurMetier('PHOTO_ILLISIBLE', 'La photo est illisible : reprenez-la.', 422);
        }

        [$largeur, $hauteur] = [(int) $infos[0], (int) $infos[1]];

        if ($largeur < 16 || $hauteur < 16) {
            throw new ErreurMetier('PHOTO_ILLISIBLE', 'La photo est trop petite : reprenez-la.', 422);
        }

        if ($largeur > 12_000 || $hauteur > 12_000 || $largeur * $hauteur > $this->pixelsMax) {
            throw new ErreurMetier('PHOTO_TROP_GRANDE', 'La photo est trop grande : reprenez-la avec moins de détails.', 422);
        }

        $source = match ($format) {
            'jpeg' => @imagecreatefromjpeg($chemin),
            'png' => @imagecreatefrompng($chemin),
            'webp' => @imagecreatefromwebp($chemin),
        };

        if (! $source instanceof \GdImage) {
            throw new ErreurMetier('PHOTO_ILLISIBLE', 'La photo est illisible : reprenez-la.', 422);
        }

        try {
            if ($format === 'jpeg') {
                $source = $this->redresser($source, $this->orientationJpeg($chemin));
            }

            return $this->reduireEnWebp($source);
        } finally {
            imagedestroy($source);
        }
    }

    /** Format déduit des premiers octets, ou null. */
    public function formatParSignature(string $chemin): ?string
    {
        $flux = @fopen($chemin, 'rb');

        if ($flux === false) {
            return null;
        }

        $entete = (string) fread($flux, 16);
        fclose($flux);

        return match (true) {
            str_starts_with($entete, "\xFF\xD8\xFF") => 'jpeg',
            str_starts_with($entete, "\x89PNG\r\n\x1A\n") => 'png',
            strlen($entete) >= 12 && str_starts_with($entete, 'RIFF') && substr($entete, 8, 4) === 'WEBP' => 'webp',
            default => null,
        };
    }

    /** @return array{contenu: string, largeur: int, hauteur: int, mime: string} */
    private function reduireEnWebp(\GdImage $source): array
    {
        $l = imagesx($source);
        $h = imagesy($source);
        $ratio = min(1, $this->cote / max($l, $h));
        $nl = max(1, (int) round($l * $ratio));
        $nh = max(1, (int) round($h * $ratio));

        $cible = imagecreatetruecolor($nl, $nh);
        if ($cible === false) {
            throw new ErreurMetier('PHOTO_ILLISIBLE', 'La photo est illisible : reprenez-la.', 422);
        }

        try {
            // Transparence conservée (PNG / WebP) ; fond transparent par défaut.
            imagealphablending($cible, false);
            imagesavealpha($cible, true);
            imagefill($cible, 0, 0, imagecolorallocatealpha($cible, 0, 0, 0, 127));
            imagecopyresampled($cible, $source, 0, 0, 0, 0, $nl, $nh, $l, $h);

            ob_start();
            $ok = imagewebp($cible, null, $this->qualite);
            $contenu = (string) ob_get_clean();
        } finally {
            imagedestroy($cible);
        }

        if (! $ok || strlen($contenu) < 32) {
            throw new ErreurMetier('PHOTO_ILLISIBLE', 'La photo est illisible : reprenez-la.', 422);
        }

        return ['contenu' => $contenu, 'largeur' => $nl, 'hauteur' => $nh, 'mime' => 'image/webp'];
    }

    /** Applique l'orientation EXIF (1 à 8) : les photos de téléphone sont souvent enregistrées « couchées ». */
    private function redresser(\GdImage $image, int $orientation): \GdImage
    {
        $tourner = fn (\GdImage $img, int $angle): \GdImage => ($r = imagerotate($img, $angle, 0)) instanceof \GdImage ? $this->remplacer($img, $r) : $img;

        return match ($orientation) {
            2 => $this->retourner($image, IMG_FLIP_HORIZONTAL),
            3 => $tourner($image, 180),
            4 => $this->retourner($image, IMG_FLIP_VERTICAL),
            5 => $this->retourner($tourner($image, 270), IMG_FLIP_HORIZONTAL),
            6 => $tourner($image, 270),
            7 => $this->retourner($tourner($image, 90), IMG_FLIP_HORIZONTAL),
            8 => $tourner($image, 90),
            default => $image,
        };
    }

    private function retourner(\GdImage $image, int $mode): \GdImage
    {
        imageflip($image, $mode);

        return $image;
    }

    private function remplacer(\GdImage $ancienne, \GdImage $nouvelle): \GdImage
    {
        imagedestroy($ancienne);

        return $nouvelle;
    }

    /**
     * Orientation EXIF d'un JPEG (balise 0x0112 de l'IFD0), lue sans l'extension exif : segments APP1 seulement,
     * lecture bornée (64 Ko), aucune autre donnée interprétée. 1 (normale) si absente ou illisible.
     */
    public function orientationJpeg(string $chemin): int
    {
        $donnees = (string) @file_get_contents($chemin, false, null, 0, 65_536);
        $n = strlen($donnees);
        $i = 2;

        while ($i + 4 <= $n && $donnees[$i] === "\xFF") {
            $marqueur = ord($donnees[$i + 1]);
            $longueur = unpack('n', substr($donnees, $i + 2, 2))[1];

            if ($marqueur === 0xDA || $longueur < 2) {
                break; // début de l'image compressée : plus d'en-tête à lire
            }

            if ($marqueur === 0xE1 && substr($donnees, $i + 4, 6) === "Exif\0\0") {
                return $this->orientationTiff(substr($donnees, $i + 10, $longueur - 8));
            }

            $i += 2 + $longueur;
        }

        return 1;
    }

    private function orientationTiff(string $tiff): int
    {
        if (strlen($tiff) < 8) {
            return 1;
        }

        $ordre = substr($tiff, 0, 2);
        if ($ordre !== 'II' && $ordre !== 'MM') {
            return 1;
        }

        $court = $ordre === 'II' ? 'v' : 'n';
        $long = $ordre === 'II' ? 'V' : 'N';
        $ifd = unpack($long, substr($tiff, 4, 4))[1];

        if ($ifd + 2 > strlen($tiff)) {
            return 1;
        }

        $entrees = min(unpack($court, substr($tiff, $ifd, 2))[1], 64);

        for ($k = 0; $k < $entrees; $k++) {
            $pos = $ifd + 2 + $k * 12;
            if ($pos + 12 > strlen($tiff)) {
                break;
            }
            if (unpack($court, substr($tiff, $pos, 2))[1] === 0x0112) {
                $valeur = unpack($court, substr($tiff, $pos + 8, 2))[1];

                return ($valeur >= 1 && $valeur <= 8) ? $valeur : 1;
            }
        }

        return 1;
    }
}
