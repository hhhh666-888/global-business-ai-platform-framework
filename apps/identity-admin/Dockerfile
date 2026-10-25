FROM node:24.19.0-alpine
WORKDIR /app
COPY apps/identity-admin/server.mjs /app/apps/identity-admin/server.mjs
COPY apps/observability/observability.mjs /app/apps/observability/observability.mjs
CMD ["node", "/app/apps/identity-admin/server.mjs"]
