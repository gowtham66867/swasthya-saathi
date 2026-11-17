FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY dist/server/ ./dist/server/
COPY scripts/dev.mjs ./scripts/dev.mjs
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node","scripts/dev.mjs"]
