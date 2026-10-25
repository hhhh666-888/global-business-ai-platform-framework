FROM node:24.19.0-alpine AS build
WORKDIR /app
COPY package.json ./package.json
RUN npm install --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:24.19.0-alpine
WORKDIR /app
COPY server.mjs ./
COPY --from=build /app/dist ./dist
# Fail image construction if the runtime ESM entry is absent or syntactically invalid.
RUN node --check server.mjs
EXPOSE 8080
CMD ["node", "server.mjs"]
