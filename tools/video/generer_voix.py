"""
Voix off de la vidéo SatsPoint : une phrase = un fichier audio, pour la caler sur l'image.

Lit le tableau de SCRIPT.md (colonne « Voix off »), synthétise chaque phrase avec
edge-tts (voix Azure fr-FR-VivienneMultilingualNeural, secours fr-FR-DeniseNeural),
coupe les silences de début et de fin, égalise le volume (EBU R128), et écrit
voix/NN.wav (48 kHz mono) + timeline.json (durée de chaque phrase).

Usage :  python -I tools/video/generer_voix.py            # tout
         python -I tools/video/generer_voix.py 7 11       # seulement les phrases 7 et 11
Dépendances : pip install edge-tts imageio-ffmpeg
"""
import asyncio
import json
import os
import re
import subprocess
import sys
import wave

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "SCRIPT.md")
OUT = os.path.join(HERE, "voix")
VOIX = ["fr-FR-VivienneMultilingualNeural", "fr-FR-DeniseNeural"]
VITESSE = "+0%"  # « -5% » si le débit paraît pressé


def ffmpeg() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return "ffmpeg"


FF = ffmpeg()


def lire_phrases() -> list[tuple[int, str]]:
    """Extrait (numéro, phrase) des lignes du tableau de SCRIPT.md."""
    phrases = []
    for ligne in open(SCRIPT, encoding="utf-8"):
        m = re.match(r"^\|\s*(\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|", ligne)
        if m:
            phrases.append((int(m.group(1)), m.group(4).strip()))
    return phrases


def duree_wav(chemin: str) -> float:
    with wave.open(chemin) as w:
        return w.getnframes() / w.getframerate()


async def synthese(texte: str, mp3: str) -> str:
    """Essaie chaque voix, avec reprises : le service limite parfois le débit."""
    derniere = None
    for voix in VOIX:
        for essai in range(5):
            try:
                await edge_tts.Communicate(texte, voix, rate=VITESSE).save(mp3)
                await asyncio.sleep(1.2)
                return voix
            except Exception as e:  # noqa: BLE001
                derniere = e
                await asyncio.sleep(2.5 * (essai + 1))
    raise RuntimeError(f"synthèse impossible : {derniere}")


def nettoyer(mp3: str, wav: str) -> None:
    # Coupe le silence de début, puis (par retournement) celui de fin — jamais une
    # pause intérieure — puis égalise le volume entre les phrases.
    filtre = (
        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,"
        "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse,"
        "loudnorm=I=-16:TP=-1.5:LRA=11"
    )
    subprocess.run(
        [FF, "-y", "-hide_banner", "-loglevel", "error", "-i", mp3, "-af", filtre, "-ar", "48000", "-ac", "1", wav],
        check=True,
    )


async def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    voulus = {int(a) for a in sys.argv[1:]} or None
    timeline = []
    for numero, texte in lire_phrases():
        if voulus and numero not in voulus:
            continue
        mp3 = os.path.join(OUT, f"{numero:02d}.mp3")
        wav = os.path.join(OUT, f"{numero:02d}.wav")
        voix = await synthese(texte, mp3)
        nettoyer(mp3, wav)
        os.remove(mp3)
        d = duree_wav(wav)
        timeline.append({"numero": numero, "texte": texte, "fichier": os.path.basename(wav), "duree_s": round(d, 2), "voix": voix})
        print(f"{numero:02d}  {d:5.1f} s  {texte[:70]}")
    chemin = os.path.join(OUT, "timeline.json")
    existant = []
    if voulus and os.path.exists(chemin):
        existant = [e for e in json.load(open(chemin, encoding="utf-8")) if e["numero"] not in voulus]
    json.dump(sorted(existant + timeline, key=lambda e: e["numero"]), open(chemin, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    total = sum(e["duree_s"] for e in existant + timeline)
    print(f"\nvoix totale : {total:.0f} s (cible ≤ 150 s pour laisser respirer les images)")


if __name__ == "__main__":
    asyncio.run(main())
