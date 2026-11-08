# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# SatsPoint — image API (FrankenPHP = Caddy + PHP 8.3) + front compilé.
#   target dev  : PHP + extensions + Composer, le code est monté (docker-compose.dev.yml)
#   target prod : code copié, dépendances installées, front compilé servi par Caddy
#                 (docker-compose.yml : un conteneur par rôle, Redis, passerelle à part)
#   target all  : « tout-en-un » pour l'hébergement gratuit (Render) — prod + supervisord + Node 22
#                 + passerelle Lightning compilée ; Caddy écoute $PORT, le reste sur 127.0.0.1.
#                 C'est la DERNIÈRE étape : un `docker build` sans --target (cas de Render, qui
#                 ne permet pas de choisir la cible) produit cette image.
# ---------------------------------------------------------------------------

# ---------- Front (PWA) ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build \
 && mkdir -p /cles-i18n \
 && (cp src/voix/cles-vocales.json /cles-i18n/ 2>/dev/null || echo "cles-vocales.json absent : jeu essentiel seedé au démarrage")

# ---------- Passerelle Lightning (compilée, dépendances de production seulement) ----------
FROM node:22-alpine AS gateway
WORKDIR /gw
COPY lightning-gateway/package.json lightning-gateway/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY lightning-gateway/tsconfig.json ./
COPY lightning-gateway/src ./src
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund \
 && npm cache clean --force

# ---------- Base PHP ----------
FROM dunglas/frankenphp:1-php8.3-alpine AS base
RUN install-php-extensions pdo_pgsql pcntl redis intl bcmath opcache zip gd \
 && apk add --no-cache ffmpeg bash tzdata \
 && rm -rf /var/cache/apk/*
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY infra/php.ini /usr/local/etc/php/conf.d/zz-satspoint.ini
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY infra/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV COMPOSER_ALLOW_SUPERUSER=1 \
    TZ=Africa/Dakar \
    SERVER_NAME=:8000 \
    PHP_OPCACHE_MEMORY=128
WORKDIR /app/api
EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]

# ---------- Développement ----------
FROM base AS dev
ENV APP_ENV=local
CMD ["frankenphp", "run", "--config", "/etc/caddy/Caddyfile"]

# ---------- Production ----------
FROM base AS prod
COPY api/composer.json api/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction --no-progress
COPY api/ ./
RUN composer dump-autoload --optimize --no-dev --classmap-authoritative \
 && mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache \
 && chown -R www-data:www-data storage bootstrap/cache
COPY --from=web /web/dist /app/web-dist
# Registre des clés vocales produit par le build du front (lu par `audio:synchroniser` au démarrage).
COPY --from=web /cles-i18n/ /app/cles-i18n/
ENV APP_ENV=production
CMD ["frankenphp", "run", "--config", "/etc/caddy/Caddyfile"]

# ---------- Tout-en-un (Render, offre gratuite : 512 Mo, un seul port) ----------
FROM prod AS all
# supervisord (5 processus) ; Node 22 = binaire officiel copié de node:22-alpine (musl, comme l'image PHP).
RUN apk add --no-cache supervisor libstdc++ libgcc \
 && rm -rf /var/cache/apk/*
COPY --from=node:22-alpine /usr/local/bin/node /usr/local/bin/node
COPY --from=gateway /gw/package.json /app/lightning-gateway/package.json
COPY --from=gateway /gw/node_modules /app/lightning-gateway/node_modules
COPY --from=gateway /gw/dist /app/lightning-gateway/dist
COPY infra/supervisord.conf /etc/supervisor/supervisord.conf
# Utilisateur non-root (www-data) : stockage, cache Laravel et dossiers de Caddy (XDG /config, /data).
RUN mkdir -p /config/caddy /data/caddy \
 && chown -R www-data:www-data /config/caddy /data/caddy /app/api/storage /app/api/bootstrap/cache
# Valeurs du conteneur unique (toutes surchargeables par l'environnement) : sans Redis,
# Reverb et passerelle joignables sur 127.0.0.1 seulement, Caddy sur $PORT (Render : 10000).
ENV SATSPOINT_ROLE=all \
    APP_NAME=SatsPoint \
    PORT=10000 \
    DB_CONNECTION=pgsql \
    CACHE_STORE=database \
    QUEUE_CONNECTION=database \
    SESSION_DRIVER=database \
    DB_QUEUE_RETRY_AFTER=180 \
    BROADCAST_CONNECTION=reverb \
    REVERB_APP_ID=satspoint \
    REVERB_HOST=127.0.0.1 \
    REVERB_PORT=8080 \
    REVERB_SCHEME=http \
    REVERB_UPSTREAM=127.0.0.1:8080 \
    LIGHTNING_GATEWAY_URL=http://127.0.0.1:3011 \
    LOG_CHANNEL=stderr \
    FRANKENPHP_CONFIG="num_threads 4" \
    PHP_OPCACHE_MEMORY=64 \
    PHP_OPCACHE_CLI=1 \
    PHP_OPCACHE_FILE_CACHE=/tmp/opcache
USER www-data
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/up" >/dev/null || exit 1
# L'entrypoint lance supervisord dès que SATSPOINT_ROLE=all (cette commande n'est qu'indicative).
CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]
