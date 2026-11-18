"""
Assemble une vidéo de démonstration : une image par plan (out/diapos/<langue>/NN.png), tenue le temps de
la phrase de voix off (voix/NN.wav ou voix-en/NN.wav) + une courte respiration, avec un lent zoom avant ;
fondu d'ouverture et de fermeture. Sortie : out/SatsPoint-FR.mp4 ou out/SatsPoint-EN.mp4 (1080p, 30 i/s).

Usage :  python -I tools/video/montage/assembler.py fr
         python -I tools/video/montage/assembler.py en
Prérequis : node tools/video/montage/diapos.mjs ; voix générées (generer_voix.py, generer_voix.py --en).
"""
import json
import os
import subprocess
import sys
import wave

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
ICI = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.dirname(ICI)
LANGUE = (sys.argv[1:] or ["fr"])[0]
VOIX = os.path.join(VIDEO, "voix" if LANGUE == "fr" else "voix-en")
DIAPOS = os.path.join(VIDEO, "out", "diapos", LANGUE)
TRAVAIL = os.path.join(VIDEO, "out", "travail-" + LANGUE)
SORTIE = os.path.join(VIDEO, "out", f"SatsPoint-{LANGUE.upper()}.mp4")
AVANT, APRES = 0.35, 0.45  # respiration avant / après chaque phrase (s)
IPS = 30


def ff(*args: str) -> None:
    subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error", *args], check=True)


def main() -> None:
    os.makedirs(TRAVAIL, exist_ok=True)
    plans = json.load(open(os.path.join(VOIX, "timeline.json"), encoding="utf-8"))
    segments, morceaux = [], []
    total_plans = len(plans)
    for k, p in enumerate(plans):
        n = p["numero"]
        wav = os.path.join(VOIX, f"{n:02d}.wav")
        with wave.open(wav) as w:
            taux, largeur, canaux = w.getframerate(), w.getsampwidth(), w.getnchannels()
            audio = w.readframes(w.getnframes())
            duree_voix = w.getnframes() / taux
        avant = AVANT + (0.6 if k == 0 else 0)
        apres = APRES + (1.2 if k == total_plans - 1 else 0)
        duree = avant + duree_voix + apres
        images = round(duree * IPS)
        silence = lambda s: b"\x00" * (int(s * taux) * largeur * canaux)  # noqa: E731
        morceaux.append(silence(avant) + audio + silence(duree - avant - duree_voix))
        # Lent zoom avant (1 → 1,04) sur une image sur-échantillonnée (évite les saccades de zoompan).
        fondu = ""
        if k == 0:
            fondu = ",fade=t=in:st=0:d=0.6"
        if k == total_plans - 1:
            fondu += f",fade=t=out:st={duree - 1.0:.2f}:d=1.0"
        seg = os.path.join(TRAVAIL, f"{n:02d}.mp4")
        ff(
            "-loop", "1", "-framerate", str(IPS), "-t", f"{duree:.3f}", "-i", os.path.join(DIAPOS, f"{n:02d}.png"),
            "-vf", f"scale=3840:2160,zoompan=z='1+0.04*on/{images}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={IPS}{fondu},format=yuv420p",
            "-frames:v", str(images), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", str(IPS), seg,
        )
        segments.append(seg)
        print(f"plan {n:02d}  {duree:5.1f} s")
    liste = os.path.join(TRAVAIL, "liste.txt")
    with open(liste, "w", encoding="utf-8") as f:
        f.writelines(f"file '{s.replace(os.sep, '/')}'\n" for s in segments)
    piste = os.path.join(TRAVAIL, "voix.wav")
    with wave.open(piste, "wb") as w:
        w.setnchannels(canaux)
        w.setsampwidth(largeur)
        w.setframerate(taux)
        w.writeframes(b"".join(morceaux))
    ff("-f", "concat", "-safe", "0", "-i", liste, "-i", piste, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
       "-movflags", "+faststart", "-shortest", SORTIE)
    with wave.open(piste) as w:
        print(f"\n{SORTIE}  ({w.getnframes() / w.getframerate():.0f} s)")


if __name__ == "__main__":
    main()
