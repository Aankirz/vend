# Fallback for CreateOS `--runtime dockerfile` (see docs/phases/deploy-owner.md).
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]
