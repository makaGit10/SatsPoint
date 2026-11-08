#!/usr/bin/env bash
# SatsPoint — point d'entrée des conteneurs API (web, reverb, queue, scheduler, tout-en-un).
set -euo pipefail

cd /app/api

export PHP_OPCACHE_VALIDATE_TIMESTAMPS="${PHP_OPCACHE_VALIDATE_TIMESTAMPS:-$([ "${APP_ENV:-production}" = "production" ] && echo 0 || echo 1)}"

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
fi

mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache storage/app/public

# --- Dépendances absentes (code monté en dev sans vendor) ---
if [ ! -f vendor/autoload.php ]; then
  echo "[satspoint] vendor/ absent : composer install…"
  composer install --no-interaction --prefer-dist --no-progress
fi

# --- Attente de la base ---
until php -r 'try { new PDO(sprintf("pgsql:host=%s;port=%s;dbname=%s", getenv("DB_HOST"), getenv("DB_PORT"), getenv("DB_DATABASE")), getenv("DB_USERNAME"), getenv("DB_PASSWORD")); exit(0);} catch (Throwable $e) { exit(1);} ' >/dev/null 2>&1; do
  echo "[satspoint] base de données indisponible, nouvelle tentative…"; sleep 2
done

ROLE="${SATSPOINT_ROLE:-web}"

if [ "$ROLE" = "web" ] || [ "$ROLE" = "all" ]; then
  php artisan storage:link --force >/dev/null 2>&1 || true
  php artisan migrate --force --no-interaction
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
  exec supervisord -c /etc/supervisor/supervisord.conf
fi

exec "$@"
