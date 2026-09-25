FROM node:22-bookworm-slim AS runtime

WORKDIR /app

COPY package*.json ./

RUN npm ci --include=dev && chown -R node:node /app/node_modules

COPY --chown=node:node . .

RUN npm run build:ui

RUN mkdir -p /app/.data && chown -R node:node /app/.data /app/gen

ENV PORT=4004

USER node

EXPOSE 4004

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4004/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

FROM runtime AS development

ENV NODE_ENV=development

CMD ["npm", "run", "dev:docker"]

FROM runtime AS production

ENV NODE_ENV=production

CMD ["npm", "start"]
