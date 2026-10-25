FROM node:24.19.0-alpine
WORKDIR /app
COPY providers/ragflow-adapter ./providers/ragflow-adapter
EXPOSE 8092
CMD ["node", "providers/ragflow-adapter/server.mjs"]
