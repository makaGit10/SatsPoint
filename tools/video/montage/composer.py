"""
Montage final d'une version de la vidéo (fr ou en) à partir du tournage (out/tournage/scenes.json + images),
des cartes (out/cartes/<langue>/cNN.png), de la voix off (voix/ ou voix-en/) et des voix wolof de l'application
(sons-wo/). Titres de scène et sous-titres anglais incrustés (ASS) ; quand une voix wolof de l'application parle,
sa traduction s'affiche en sous-titre. Sortie : out/SatsPoint-FR.mp4 | out/SatsPoint-EN.mp4 (1080p, 30 i/s).

Usage : python -I tools/video/montage/composer.py fr|en
"""
import json
import os
import re
import shutil
import subprocess
import sys
import wave

import imageio_ffmpeg
import numpy as np

FF = imageio_ffmpeg.get_ffmpeg_exe()
ICI = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.dirname(ICI)
RACINE = os.path.dirname(os.path.dirname(VIDEO))
L = (sys.argv[1:] or ["fr"])[0]
OUT = os.path.join(VIDEO, "out")
TRAVAIL = os.path.join(OUT, f"montage-{L}")
CARTES = os.path.join(OUT, "cartes")
SCENES = json.load(open(os.path.join(OUT, "tournage", "scenes.json"), encoding="utf-8"))
SCENES = {s["nom"]: s for s in SCENES}
IPS, TAUX = 30, 48000
TEL = dict(x=1236, y=70, w=434, h=940)
PC = dict(x=312, y=140, w=1296, h=810)

# Durées de voix off : celle de la langue (pour le son), et le max des deux (le rythme des images, commun).
def lignes(dossier):
    return {e["numero"]: e for e in json.load(open(os.path.join(VIDEO, dossier, "timeline.json"), encoding="utf-8"))}
VO = lignes("voix" if L == "fr" else "voix-en")
VO_EN = lignes("voix-en")
VO_AUTRE = lignes("voix-en" if L == "fr" else "voix")
DMAX = {n: max(VO[n]["duree_s"], VO_AUTRE[n]["duree_s"]) for n in VO}

REGISTRE = {e["cle"]: e for e in json.load(open(os.path.join(RACINE, "web", "src", "voix", "cles-vocales.json"), encoding="utf-8"))}

SEGMENTS = [
    ("carte", 1), ("carte", 2), ("carte", 3),
    ("tel", "langue"), ("tel", "connexion"), ("tel", "article"), ("tel", "caisse"),
    ("carte", 13), ("tel", "vert"), ("carte", 16), ("tel", "patron"),
    ("pc", "langue-ajout"), ("pc", "studio"), ("tel", "mali"),
    ("carte", 23), ("carte", 24), ("carte", 25),
]
TITRES = {
    "langue": (("Première ouverture", "Sa langue, à voix haute"), ("First launch", "Her language, out loud")),
    "connexion": (("Connexion", "Sa caisse, en un geste"), ("Log in", "Her till, in one tap")),
    "article": (("Ajouter un produit", "Sans rien écrire"), ("Add a product", "No typing needed")),
    "caisse": (("À la caisse", "Chaque produit parle"), ("At the till", "Every product speaks")),
    "vert": (("Paiement reçu", "Vérifié par le serveur"), ("Payment received", "Verified by the server")),
    "patron": (("Le patron", "Tout, en direct"), ("The owner", "Everything, live")),
    "langue-ajout": (("Console", "Ajouter une langue en quelques secondes"), ("Console", "Add a language in seconds")),
    "studio": (("Studio audio", "Au micro, nettoyé automatiquement"), ("Audio studio", "Recorded by mic, cleaned automatically")),
    "mali": (("Au Mali", "La nouvelle langue, aussitôt"), ("In Mali", "The new language, instantly")),
}
BADGE_WOLOF = "VOIX WOLOF ENREGISTRÉE" if L == "fr" else "RECORDED WOLOF VOICE"
BADGE_NOM = "LE NOM ENREGISTRÉ DE L'ARTICLE" if L == "fr" else "THE ITEM'S RECORDED NAME"


def ff(*args, cwd=None):
    subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error", *args], check=True, cwd=cwd)


def lire_audio(chemin):
    """Fichier audio quelconque → tableau float32 48 kHz mono (cache .wav)."""
    cache = os.path.join(TRAVAIL, "sons", re.sub(r"[^\w.-]", "_", os.path.basename(chemin)) + ".wav")
    if not os.path.exists(cache):
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        ff("-i", chemin, "-ac", "1", "-ar", str(TAUX), "-sample_fmt", "s16", cache)
    with wave.open(cache) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def ass_temps(s):
    s = max(0.0, s)
    h, r = divmod(s, 3600)
    m, r = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{r:05.2f}"


def esc_ass(t):
    return t.replace("{", "(").replace("}", ")").replace("\n", " ")


DUREES_SONS = {}


def duree_son(fichier):
    if fichier not in DUREES_SONS:
        DUREES_SONS[fichier] = len(lire_audio(fichier)) / TAUX
    return DUREES_SONS[fichier]


CHRONO = {}


def chrono(nom):
    """Accélère les temps morts d'une scène (chargements, frappe) : quand ni voix off ni son de l'application ne
    joue, les 0,6 premières et dernières secondes restent en temps réel (le toucher reste visible), le milieu
    passe 4 fois plus vite. Renvoie (W : temps filmé → temps monté, durée montée)."""
    if nom in CHRONO:
        return CHRONO[nom]
    s = SCENES[nom]
    D = s["fin"] - s["debut"]
    occupe = []
    for e in s["evenements"]:
        a = e["t"] - s["debut"]
        d = DMAX[e["n"]] if e["type"] == "voix" else duree_son(e["fichier"])
        occupe.append((a, a + d + 0.1))
    occupe.sort()
    D = max(D, max((b for _, b in occupe), default=0) + 0.3)
    morceaux, curseur, nouveau = [], 0.0, 0.0
    def ajouter(a, b, vitesse):
        nonlocal nouveau
        if b > a:
            morceaux.append((a, b, nouveau, vitesse))
            nouveau += (b - a) / vitesse
    def creux(a, b):
        g = b - a
        if g <= 1.2:
            ajouter(a, b, 1.0)
        else:
            ajouter(a, a + 0.6, 1.0); ajouter(a + 0.6, b - 0.6, 4.0); ajouter(b - 0.6, b, 1.0)
    for a, b in occupe:
        if a > curseur:
            creux(curseur, a)
        if b > curseur:
            ajouter(max(curseur, a), min(b, D), 1.0)
            curseur = max(curseur, b)
    if curseur < D:
        creux(curseur, D)
    def W(t):
        for a, b, n0, v in morceaux:
            if t <= b:
                return n0 + (max(t, a) - a) / v
        return nouveau
    CHRONO[nom] = (W, nouveau)
    return CHRONO[nom]


def video_scene(seg_type, nom, duree, sortie):
    s = SCENES[nom]
    W, _ = chrono(nom)
    dossier = s["dossier"]
    images = sorted((float(f.split("_")[1][:-4]), f) for f in os.listdir(dossier) if f.endswith(".jpg"))
    debut, fin = s["debut"], s["fin"]
    avant = [i for i in images if i[0] <= debut]
    dedans = [i for i in images if debut < i[0] < fin]
    suite = ([avant[-1]] if avant else []) + dedans
    if not suite:
        suite = [images[0]]
    liste = os.path.join(TRAVAIL, f"{nom}.txt")
    with open(liste, "w", encoding="utf-8") as f:
        for k, (ts, nomf) in enumerate(suite):
            t0 = W(max(ts, debut) - debut) if k else 0.0
            t1 = W(suite[k + 1][0] - debut) if k + 1 < len(suite) else duree
            f.write(f"file '{os.path.join(dossier, nomf).replace(os.sep, '/')}'\nduration {max(t1 - t0, 0.001):.4f}\n")
        f.write(f"file '{os.path.join(dossier, suite[-1][1]).replace(os.sep, '/')}'\n")
    if seg_type == "tel":
        g = TEL
        fond, cadre = os.path.join(CARTES, "bg-tel.png"), os.path.join(CARTES, "cadre-tel.png")
        filtre = (f"[0:v]scale={g['w']}:{g['h']}:flags=lanczos,fps={IPS}[e];[1:v][e]overlay={g['x']}:{g['y']}:shortest=1[a];"
                  f"[a][2:v]overlay=0:0,format=yuv420p")
        entrees = ["-f", "concat", "-safe", "0", "-i", liste, "-loop", "1", "-i", fond, "-loop", "1", "-i", cadre]
    else:
        g = PC
        fond = os.path.join(CARTES, "bg-pc.png")
        filtre = f"[0:v]scale={g['w']}:{g['h']}:flags=lanczos,fps={IPS}[e];[1:v][e]overlay={g['x']}:{g['y']}:shortest=1,format=yuv420p"
        entrees = ["-f", "concat", "-safe", "0", "-i", liste, "-loop", "1", "-i", fond]
    ff(*entrees, "-filter_complex", filtre, "-t", f"{duree:.3f}", "-r", str(IPS), "-c:v", "libx264", "-preset", "medium", "-crf", "17", sortie)


def main():
    shutil.rmtree(TRAVAIL, ignore_errors=True)
    os.makedirs(TRAVAIL)
    t = 0.0
    voix_evts, sons_evts, ass = [], [], []
    clips = []
    for k, (typ, ref) in enumerate(SEGMENTS):
        sortie = os.path.join(TRAVAIL, f"{k:02d}.mp4")
        if typ == "carte":
            n = ref
            avant = 0.6 if k == 0 else 0.25
            duree = avant + DMAX[n] + (1.3 if k == len(SEGMENTS) - 1 else 0.4)
            voix_evts.append((t + avant, n))
            fondu = ",fade=t=in:st=0:d=0.5" if k == 0 else ""
            if k == len(SEGMENTS) - 1:
                fondu += f",fade=t=out:st={duree - 1.0:.2f}:d=1.0"
            ff("-loop", "1", "-framerate", str(IPS), "-t", f"{duree:.3f}", "-i", os.path.join(CARTES, L, f"c{n:02d}.png"),
               "-vf", f"format=yuv420p{fondu}", "-r", str(IPS), "-c:v", "libx264", "-preset", "medium", "-crf", "17", sortie)
        else:
            s = SCENES[ref]
            W, duree = chrono(ref)
            video_scene(typ, ref, duree, sortie)
            (kf, tf), (ke, te) = TITRES[ref]
            kick, titre = (kf, tf) if L == "fr" else (ke, te)
            style = "TitreTel" if typ == "tel" else "TitrePc"
            texte = f"{{\\fs40\\c&H005A8A&}}{esc_ass(kick.upper())}\\N{{\\fs80\\c&H04141C&}}{esc_ass(titre)}" if typ == "tel" else f"{{\\c&H005A8A&}}{esc_ass(kick.upper())}  {{\\c&H04141C&}}{esc_ass(titre)}"
            ass.append((style, t + 0.1, t + duree - 0.1, texte))
            for e in s["evenements"]:
                tt = t + W(e["t"] - s["debut"])
                if e["type"] == "voix":
                    voix_evts.append((tt, e["n"]))
                else:
                    sons_evts.append((tt, e["fichier"]))
        clips.append(sortie)
        print(f"segment {k:02d} {typ:5} {str(ref):13} {duree:5.1f} s")
        t += duree
    total = t

    # Concaténation des images.
    liste = os.path.join(TRAVAIL, "clips.txt")
    with open(liste, "w", encoding="utf-8") as f:
        f.writelines(f"file '{c.replace(os.sep, '/')}'\n" for c in clips)
    base = os.path.join(TRAVAIL, "images.mp4")
    ff("-f", "concat", "-safe", "0", "-i", liste, "-c", "copy", base)

    # Mixage : voix off de la langue + sons de l'application.
    piste = np.zeros(int((total + 1) * TAUX), dtype=np.float32)
    def poser(signal, debut, gain=1.0):
        i = int(debut * TAUX)
        fin = min(len(piste), i + len(signal))
        piste[i:fin] += signal[: fin - i] * gain
    dossier_vo = os.path.join(VIDEO, "voix" if L == "fr" else "voix-en")
    for tt, n in voix_evts:
        poser(lire_audio(os.path.join(dossier_vo, f"{n:02d}.wav")), tt)
        en = VO_EN[n]
        ass.append(("Sous" if True else "", tt, tt + VO[n]["duree_s"] + 0.15, esc_ass(en["texte"])))
    for tt, fichier in sons_evts:
        signal = lire_audio(fichier)
        poser(signal, tt, 1.0)
        nom = os.path.basename(fichier)[:-4]
        fin = tt + len(signal) / TAUX
        if nom.startswith("article."):
            ass.append(("Badge", tt, fin + 0.3, BADGE_NOM))
            ass.append(("Sous", tt, fin + 0.3, "“Café Touba”"))
        else:
            ass.append(("Badge", tt, fin + 0.3, BADGE_WOLOF))
            sens = REGISTRE.get(nom, {}).get("texte_en", "")
            if sens:
                ass.append(("SousWolof", tt, fin + 0.3, "Wolof: “" + esc_ass(sens) + "”"))
    crete = float(np.max(np.abs(piste))) or 1.0
    if crete > 0.98:
        piste *= 0.98 / crete
    audio = os.path.join(TRAVAIL, "audio.wav")
    with wave.open(audio, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(TAUX)
        w.writeframes((np.clip(piste, -1, 1) * 32767).astype(np.int16).tobytes())

    # Sous-titres et titres (ASS), placés selon le type du segment en cours.
    # Type de segment à un instant donné (pour placer les sous-titres).
    bornes, t3 = [], 0.0
    for k, (typ, ref) in enumerate(SEGMENTS):
        if typ == "carte":
            avant = 0.6 if k == 0 else 0.25
            d = avant + DMAX[ref] + (1.3 if k == len(SEGMENTS) - 1 else 0.4)
        else:
            d = chrono(ref)[1]
        bornes.append((t3, t3 + d, typ)); t3 += d
    def type_a(tt):
        for a, b, typ in bornes:
            if a <= tt < b:
                return typ
        return "carte"
    polices = os.path.join(TRAVAIL, "polices"); os.makedirs(polices, exist_ok=True)
    for f in ("segoeui.ttf", "segoeuib.ttf", "seguisb.ttf"):
        shutil.copy(os.path.join("C:/Windows/Fonts", f), polices)
    entete = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: SousCarte,Segoe UI Semibold,40,&H00FFFFFF,&H00FFFFFF,&H30140E04,&H00000000,0,0,0,0,100,100,0,0,3,14,0,2,200,200,46,1
Style: SousTel,Segoe UI Semibold,40,&H00FFFFFF,&H00FFFFFF,&H30140E04,&H00000000,0,0,0,0,100,100,0,0,3,14,0,1,120,880,96,1
Style: SousPc,Segoe UI Semibold,36,&H00FFFFFF,&H00FFFFFF,&H30140E04,&H00000000,0,0,0,0,100,100,0,0,3,12,0,2,200,200,26,1
Style: TitreTel,Segoe UI,80,&H0004141C,&H0004141C,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,4,120,880,0,1
Style: TitrePc,Segoe UI,40,&H0004141C,&H0004141C,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,312,200,40,1
Style: BadgeTel,Segoe UI,34,&H0004141C,&H0004141C,&H002EB0EA,&H00000000,-1,0,0,0,100,100,0,0,3,14,0,7,120,880,250,1
Style: BadgePc,Segoe UI,32,&H0004141C,&H0004141C,&H002EB0EA,&H00000000,-1,0,0,0,100,100,0,0,3,12,0,9,200,330,40,1
Style: BadgeCarte,Segoe UI,34,&H0004141C,&H0004141C,&H002EB0EA,&H00000000,-1,0,0,0,100,100,0,0,3,14,0,8,200,200,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    with open(os.path.join(TRAVAIL, "textes.ass"), "w", encoding="utf-8") as f:
        f.write(entete)
        for style, a, b, texte in sorted(ass, key=lambda x: x[1]):
            typ = type_a(a + 0.05)
            suffixe = {"tel": "Tel", "pc": "Pc"}.get(typ, "Carte")
            if style in ("Sous", "SousWolof"):
                style = "Sous" + suffixe
                if texte.startswith("Wolof: "):
                    texte = "{\\c&H8FDCF6&}" + texte
            elif style == "Badge":
                style = "Badge" + suffixe
            f.write(f"Dialogue: 1,{ass_temps(a)},{ass_temps(b)},{style},,0,0,0,,{texte}\n")

    sortie = os.path.join(OUT, f"SatsPoint-{L.upper()}.mp4")
    ff("-i", "images.mp4", "-i", "audio.wav", "-vf", "ass=textes.ass:fontsdir=polices", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
       "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", sortie, cwd=TRAVAIL)
    print(f"\n{sortie}  ({total:.0f} s)")


if __name__ == "__main__":
    main()
