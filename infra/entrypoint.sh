#!/usr/bin/env bash
# SatsPoint — point d'entrée des conteneurs API (web, reverb, queue, scheduler, tout-en-un).
#   SATSPOINT_ROLE=web|reverb|queue|scheduler : docker-compose.yml (un conteneur par rôle) → exécute la commande.
#   SATSPOINT_ROLE=all : image « all » (Render) → supervisord lance Caddy+PHP, Reverb, file, planificateur, passerelle.
set -euo pipefail

cd /app/api

ROLE="${SATSPOINT_ROLE:-web}"

export PHP_OPCACHE_VALIDATE_TIMESTAMPS="${PHP_OPCACHE_VALIDATE_TIMESTAMPS:-$([ "${APP_ENV:-production}" = "production" ] && echo 0 || echo 1)}"
export PHP_OPCACHE_MEMORY="${PHP_OPCACHE_MEMORY:-128}"
# OPcache en ligne de commande (image « all » : 1) avec cache sur fichier partagé entre les processus PHP.
export PHP_OPCACHE_CLI="${PHP_OPCACHE_CLI:-0}"
export PHP_OPCACHE_FILE_CACHE="${PHP_OPCACHE_FILE_CACHE:-}"
if [ -n "$PHP_OPCACHE_FILE_CACHE" ]; then mkdir -p "$PHP_OPCACHE_FILE_CACHE" 2>/dev/null || true; fi

# --- Hébergeur (Render) : adresse publique déduite de RENDER_EXTERNAL_URL si elle n'est pas fournie ---
# Front, API et WebSocket sont servis sur la même origine (Caddy), d'où les mêmes valeurs partout.
if [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
  RENDER_HOTE="${RENDER_EXTERNAL_HOSTNAME:-$(printf '%s' "$RENDER_EXTERNAL_URL" | sed -E 's#^https?://##; s#/.*$##')}"
  export APP_URL="${APP_URL:-$RENDER_EXTERNAL_URL}"
  export FRONTEND_URL="${FRONTEND_URL:-$APP_URL}"
  export SANCTUM_STATEFUL_DOMAINS="${SANCTUM_STATEFUL_DOMAINS:-$RENDER_HOTE}"
  export REVERB_PUBLIC_HOST="${REVERB_PUBLIC_HOST:-${RENDER_HOTE%%:*}}"
  export REVERB_PUBLIC_PORT="${REVERB_PUBLIC_PORT:-443}"
  export REVERB_PUBLIC_SCHEME="${REVERB_PUBLIC_SCHEME:-https}"
  export SESSION_SECURE_COOKIE="${SESSION_SECURE_COOKIE:-true}"
fi

# --- Clés : une valeur « generateValue » de Render (base64 de 32 octets, sans préfixe) reçoit le préfixe « base64: » ---
normaliser_cle() {
  local valeur="$1"
  if [ -n "$valeur" ] && [ "${valeur#base64:}" = "$valeur" ] && [ "${#valeur}" -eq 44 ] \
     && [ "$(printf '%s' "$valeur" | base64 -d 2>/dev/null | wc -c)" -eq 32 ]; then
    printf 'base64:%s' "$valeur"
  else
    printf '%s' "$valeur"
  fi
}
if [ -n "${APP_KEY:-}" ]; then export APP_KEY="$(normaliser_cle "$APP_KEY")"; fi
if [ -n "${DATA_ENCRYPTION_KEY:-}" ]; then export DATA_ENCRYPTION_KEY="$(normaliser_cle "$DATA_ENCRYPTION_KEY")"; fi

# --- Clé d'application : générée une fois et conservée dans le volume de stockage si absente ---
if [ -z "${APP_KEY:-}" ]; then
  mkdir -p storage/app
  if [ ! -s storage/app/.app_key ]; then
    echo "base64:$(head -c 32 /dev/urandom | base64 | tr -d '\n')" > storage/app/.app_key
    echo "[satspoint] APP_KEY générée automatiquement (mode démo locale)."
  fi
  export APP_KEY="$(cat storage/app/.app_key)"
fi
if [ -z "${DATA_ENCRYPTION_KEY:-}" ]; then
  mkdir -p storage/app
  if [ ! -s storage/app/.data_key ]; then
    echo "base64:$(head -c 32 /dev/urandom | base64 | tr -d '\n')" > storage/app/.data_key
  fi
  export DATA_ENCRYPTION_KEY="$(cat storage/app/.data_key)"
  if [ "$ROLE" = "all" ]; then
    echo "[satspoint] ATTENTION : DATA_ENCRYPTION_KEY absente — clé temporaire (disque non persistant) : les secrets chiffrés seront illisibles au prochain démarrage."
  fi
fi

mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache storage/app/public storage/app/cache-audio

# --- Dépendances absentes (code monté en dev sans vendor) ---
if [ ! -f vendor/autoload.php ]; then
  echo "[satspoint] vendor/ absent : composer install…"
  composer install --no-interaction --prefer-dist --no-progress
fi

# --- Attente de la base : DATABASE_URL / DB_URL (Neon : postgresql://…?sslmode=require) sinon DB_HOST… ---
attendre_base() {
  php -r '
    $url = getenv("DB_URL") ?: getenv("DATABASE_URL");
    if ($url) {
        $p = parse_url($url);
        if ($p === false || empty($p["host"])) { fwrite(STDERR, "DATABASE_URL illisible\n"); exit(2); }
        parse_str($p["query"] ?? "", $q);
        $dsn = sprintf("pgsql:host=%s;port=%s;dbname=%s", $p["host"], $p["port"] ?? 5432, ltrim($p["path"] ?? "", "/"));
        if (!empty($q["sslmode"])) { $dsn .= ";sslmode=".$q["sslmode"]; }
        $u = isset($p["user"]) ? urldecode($p["user"]) : null;
        $m = isset($p["pass"]) ? urldecode($p["pass"]) : null;
    } else {
        $dsn = sprintf("pgsql:host=%s;port=%s;dbname=%s", getenv("DB_HOST") ?: "127.0.0.1", getenv("DB_PORT") ?: 5432, getenv("DB_DATABASE"));
        if (getenv("DB_SSLMODE")) { $dsn .= ";sslmode=".getenv("DB_SSLMODE"); }
        $u = getenv("DB_USERNAME"); $m = getenv("DB_PASSWORD");
    }
    try { new PDO($dsn, $u, $m, [PDO::ATTR_TIMEOUT => 5]); exit(0); } catch (Throwable $e) { exit(1); }
  ' >/dev/null 2>&1
}
tentatives=0
until attendre_base; do
  tentatives=$((tentatives + 1))
  echo "[satspoint] base de données indisponible (tentative ${tentatives}), nouvelle tentative…"
  sleep 2
done

if [ "$ROLE" = "web" ] || [ "$ROLE" = "all" ]; then
  # Pas de `storage:link` : aucun fichier audio n'est servi directement depuis le disque ;
  # les fichiers publiés passent par GET /audio/{langue}/{fichier}, qui vérifie le statut et lit le contenu EN BASE
  # (audio_fichiers ; storage/app/cache-audio n'est qu'un cache reconstruit à la demande, disque non persistant).
  rm -f public/storage 2>/dev/null || true
  php artisan migrate --force --no-interaction
  # Registre des clés vocales (CAHIER § 6.12) : fichier du front (/app/cles-i18n/cles-vocales.json) s'il existe,
  # sinon jeu essentiel du parcours d'encaissement. Jamais de suppression ; non bloquant.
  if [ -f "${AUDIO_FICHIER_CLES:-/app/cles-i18n/cles-vocales.json}" ]; then
    php artisan audio:synchroniser --sans-signal --no-interaction || echo "[satspoint] synchronisation des clés vocales impossible (non bloquant)."
  else
    php artisan db:seed --class=CleAudioSeeder --force --no-interaction || true
  fi
  # Traitements audio interrompus par le redémarrage (source temporaire perdue) → erreur « à renvoyer ». Non bloquant.
  php artisan audio:nettoyer --sans-signal --no-interaction || echo "[satspoint] nettoyage audio impossible (non bloquant)."
  if [ "${DEMO_SEED:-true}" = "true" ]; then
    php artisan db:seed --class=DemoSeeder --force --no-interaction
  fi
  if [ "${APP_ENV:-production}" = "production" ]; then
    php artisan config:cache && php artisan route:cache && php artisan event:cache && php artisan view:cache
  else
    php artisan optimize:clear >/dev/null 2>&1 || true
  fi
fi

if [ "$ROLE" = "all" ]; then
  # Un seul port public ($PORT, imposé par l'hébergeur) : Caddy y écoute ; Reverb (127.0.0.1:8080) et la
  # passerelle (127.0.0.1:3011) restent internes. supervisord transmet tout cet environnement aux programmes.
  export PORT="${PORT:-10000}"
  export SERVER_NAME=":${PORT}"
  export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:${PORT}}"
  # Premier cours BTC/XOF tout de suite (sinon jusqu'à 1 min de « cours indisponible » après un réveil). Non bloquant.
  timeout 25 php artisan cours:rafraichir --no-interaction >/dev/null 2>&1 || echo "[satspoint] cours non récupéré au démarrage (le planificateur réessaie chaque minute)."
  echo "[satspoint] tout-en-un : Caddy :${PORT}, Reverb 127.0.0.1:8080, passerelle 127.0.0.1:3011 — ${APP_URL:-}"
  exec supervisord -c /etc/supervisor/supervisord.conf
fi

exec "$@"
