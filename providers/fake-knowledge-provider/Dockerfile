FROM node:24.19.0-alpine
WORKDIR /app
COPY providers/fake-knowledge-provider ./providers/fake-knowledge-provider
EXPOSE 8093
CMD ["node", "providers/fake-knowledge-provider/server.mjs"]
