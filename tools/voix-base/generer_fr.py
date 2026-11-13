"""
Voix française de base de SatsPoint : un fichier MP3 par clé du registre vocal, pour qu'aucun haut-parleur ne soit
muet avant les enregistrements de la propriétaire. Chaque enregistrement fait au studio remplace ensuite celui-ci
(l'ancien passe en archive).

Lit web/src/voix/cles-vocales.json (texte_fr), synthétise avec edge-tts (voix neuronale fr-FR), coupe les blancs du
début et de la fin, égalise le volume (EBU R128), encode en MP3 mono, puis écrit le dossier attendu par
`php artisan audio:importer` : fr/{cle}.mp3 + manifeste.json (empreintes SHA-256).

Usage :  python -I tools/voix-base/generer_fr.py              # clés manquantes seulement
         python -I tools/voix-base/generer_fr.py --tout       # tout régénérer
Import :  docker compose cp tools/voix-base/sortie api:/tmp/voix-base
          docker compose exec api php artisan audio:importer /tmp/voix-base
Dépendances : pip install edge-tts imageio-ffmpeg
"""
import asyncio
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

import edge_tts

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.normpath(os.path.join(ICI, "..", ".."))
REGISTRE = os.path.join(RACINE, "web", "src", "voix", "cles-vocales.json")
SORTIE = os.path.join(ICI, "sortie")
VOIX = ["fr-FR-VivienneMultilingualNeural", "fr-FR-DeniseNeural"]
VITESSE = "-4%"  # débit posé : des personnes qui découvrent l'application
DUREE_MAX_S = 14.5  # limite serveur 15 s (config satspoint.audio.duree_max_ms)
EN_PARALLELE = 6

# Textes à variables : version parlée neutre (la voix ne peut pas dire le nom ou le montant du moment).
TEXTES_PARLES = {
    "paiement.confirmerTitre": "Confirmer la réception de ce montant ?",
    "import.lancer": "Importer les lignes",
    "equipe.desactiverTitre": "Désactiver cette personne ?",
    "equipe.retirerTitre": "Retirer cette personne de l'équipe ?",
    "invitation.bienvenue": "Bienvenue dans la boutique",
    "studio.toutFait": "Tout est enregistré dans cette langue",
    "admin.boutiques.suspendreTitre": "Suspendre cette boutique ?",
    "admin.boutiques.reactiverTitre": "Réactiver cette boutique ?",
    "admin.langues.supprimerTitre": "Supprimer cette langue ?",
    "admin.langues.modifierTitre": "Modifier la langue",
    "admin.moyens.supprimerTitre": "Supprimer ce moyen de paiement ?",
    "admin.moyens.modifierTitre": "Modifier le moyen de paiement",
}


def ffmpeg() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return "ffmpeg"


FF = ffmpeg()


def texte_parle(entree: dict) -> str:
    texte = TEXTES_PARLES.get(entree["cle"], entree["texte_fr"])
    texte = re.sub(r"\{\{[^}]+\}\}", "", texte)
    texte = texte.replace("«", "").replace("»", "").replace("…", ".")
    texte = re.sub(r"\s+", " ", texte).strip()
    # SatsPoint se prononce « Sats Point ».
    return texte.replace("SatsPoint", "Sats Point")


def duree(chemin: str) -> float:
    sortie = subprocess.run([FF, "-i", chemin, "-f", "null", "-"], capture_output=True, text=True).stderr
    temps = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", sortie)
    if not temps:
        return 0.0
    h, m, s = temps[-1]
    return int(h) * 3600 + int(m) * 60 + float(s)


def traiter(brut: str, cible: str, tempo: float) -> None:
    # Blancs coupés au début (areverse pour la fin), volume égalisé, mono 24 kHz, MP3 64 kb/s.
    filtre = (
        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,"
        "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,"
        + (f"atempo={tempo}," if tempo != 1.0 else "")
        + "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=24000"
    )
    subprocess.run(
        [FF, "-y", "-loglevel", "error", "-i", brut, "-af", filtre, "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "64k", cible],
        check=True,
    )


async def synthetiser(texte: str, chemin: str) -> None:
    derniere = None
    for voix in VOIX:
        for _ in range(3):
            try:
                await edge_tts.Communicate(texte, voix, rate=VITESSE).save(chemin)
                if os.path.getsize(chemin) > 0:
                    return
            except Exception as e:  # noqa: BLE001
                derniere = e
                await asyncio.sleep(1.5)
    raise RuntimeError(f"synthèse impossible : {derniere}")


async def produire(entree: dict, dossier: str, tout: bool, verrou: asyncio.Semaphore, rapport: list) -> None:
    cle = entree["cle"]
    cible = os.path.join(dossier, f"{cle}.mp3")
    if not tout and os.path.isfile(cible) and os.path.getsize(cible) > 0:
        return
    texte = texte_parle(entree)
    async with verrou:
        with tempfile.TemporaryDirectory() as tmp:
            brut = os.path.join(tmp, "brut.mp3")
            await synthetiser(texte, brut)
            await asyncio.to_thread(traiter, brut, cible, 1.0)
            d = await asyncio.to_thread(duree, cible)
            if d > DUREE_MAX_S:
                tempo = min(1.35, d / (DUREE_MAX_S - 0.3))
                await asyncio.to_thread(traiter, brut, cible, round(tempo, 3))
                d = await asyncio.to_thread(duree, cible)
                rapport.append(f"accéléré x{tempo:.2f} : {cle} ({d:.1f} s)")
            if d > DUREE_MAX_S:
                os.remove(cible)
                rapport.append(f"TROP LONG, ignoré : {cle} ({d:.1f} s)")
    print(f"  {cle}", flush=True)


def ecrire_manifeste(entrees: list) -> int:
    audios = []
    for e in entrees:
        relatif = f"fr/{e['cle']}.mp3"
        chemin = os.path.join(SORTIE, "fr", f"{e['cle']}.mp3")
        if not os.path.isfile(chemin):
            continue
        with open(chemin, "rb") as f:
            empreinte = hashlib.sha256(f.read()).hexdigest()
        audios.append({"cle": e["cle"], "langue": "fr", "fichier": relatif, "empreinte": empreinte})
    with open(os.path.join(SORTIE, "manifeste.json"), "w", encoding="utf-8") as f:
        json.dump({"format": "satspoint-audio", "version": 1, "source": "voix-base edge-tts", "audios": audios}, f, ensure_ascii=False, indent=1)
    return len(audios)


async def principal() -> None:
    tout = "--tout" in sys.argv
    with open(REGISTRE, encoding="utf-8") as f:
        entrees = json.load(f)
    dossier = os.path.join(SORTIE, "fr")
    os.makedirs(dossier, exist_ok=True)
    verrou = asyncio.Semaphore(EN_PARALLELE)
    rapport: list = []
    await asyncio.gather(*(produire(e, dossier, tout, verrou, rapport) for e in entrees))
    # Fichiers de clés retirées du registre : supprimés.
    connues = {e["cle"] for e in entrees}
    for nom in os.listdir(dossier):
        if nom.endswith(".mp3") and nom[:-4] not in connues:
            os.remove(os.path.join(dossier, nom))
    n = ecrire_manifeste(entrees)
    for ligne in rapport:
        print(ligne)
    print(f"{n} fichier(s) dans {SORTIE}")


if __name__ == "__main__":
    asyncio.run(principal())
