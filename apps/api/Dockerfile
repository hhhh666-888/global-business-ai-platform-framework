FROM node:24.19.0-alpine
WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=1536"
COPY apps/api ./apps/api
COPY apps/observability ./apps/observability
EXPOSE 8081
CMD ["node", "apps/api/bootstrap.mjs"]
