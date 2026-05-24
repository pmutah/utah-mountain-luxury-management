FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --workspace api --workspace web 2>/dev/null || npm install --workspace api --workspace web
COPY api api
COPY web web
RUN npm run build -w web && npm run build -w api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/api/dist api/dist
COPY --from=builder /app/api/package.json api/
COPY --from=builder /app/api/node_modules api/node_modules
COPY --from=builder /app/web/dist web/dist
WORKDIR /app/api
EXPOSE 8080
CMD ["node", "dist/src/main.js"]
