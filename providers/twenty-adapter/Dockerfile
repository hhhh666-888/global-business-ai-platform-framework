FROM node:24.19.0-alpine
WORKDIR /app
COPY server.mjs ./server.mjs
COPY extended.mjs ./extended.mjs
COPY rate-limit-transport.mjs ./rate-limit-transport.mjs
COPY bootstrap.mjs ./bootstrap.mjs
COPY stage35-advanced.mjs ./stage35-advanced.mjs
COPY stage35-entry.mjs ./stage35-entry.mjs
EXPOSE 8091
CMD ["node", "stage35-entry.mjs"]
