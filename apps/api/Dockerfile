FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

FROM dependencies AS build
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN npm run build --workspace @cybervett/contracts && npm run build --workspace @cybervett/api

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY infra/postgres infra/postgres
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=10 \
  CMD wget -q --spider http://127.0.0.1:4000/health/ready || exit 1
CMD ["node", "apps/api/dist/server.js"]
