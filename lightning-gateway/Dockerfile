# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
EXPOSE 3011
CMD ["npm", "run", "dev"]

FROM dev AS build
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS prod
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER app
EXPOSE 3011
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:3011/sante >/dev/null || exit 1
CMD ["node", "dist/index.js"]
