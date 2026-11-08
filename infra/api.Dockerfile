# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# SatsPoint — image API (FrankenPHP = Caddy + PHP 8.3) + front compilé.
#   target dev  : PHP + extensions + Composer, le code est monté (docker-compose.dev.yml)
#   target prod : code copié, dépendances installées, front compilé servi par Caddy
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
    SERVER_NAME=:8000
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
