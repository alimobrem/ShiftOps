# Lightweight mock K8s API server using Node.js
FROM node:22-alpine
WORKDIR /app
COPY mock-k8s-server.mjs .
EXPOSE 8001
CMD ["node", "mock-k8s-server.mjs"]
