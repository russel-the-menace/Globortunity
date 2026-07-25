FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY infra/migrations ./infra/migrations
RUN npm run build

FROM build AS production
RUN npm prune --omit=dev

FROM node:22-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=production --chown=node:node /app/node_modules ./node_modules
COPY --from=production --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=production --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=production --chown=node:node /app/packages/domain ./packages/domain
COPY --from=production --chown=node:node /app/packages/database ./packages/database
COPY --from=production --chown=node:node /app/infra/migrations ./infra/migrations
USER node
CMD ["node", "apps/api/dist/index.js"]

FROM api AS worker
COPY --from=build --chown=node:node /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
CMD ["node", "apps/worker/dist/index.js"]

FROM nginx:1.27-alpine AS web
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
