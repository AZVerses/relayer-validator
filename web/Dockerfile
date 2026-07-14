# ===== Build stage =====
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ===== Runtime stage =====
FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

RUN apk add --no-cache nodejs

# Built SPA
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config template (proxy targets envsubst'd at start)
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

# Runtime config rendering — generates /usr/share/nginx/html/config.js from CHAIN_CONFIGS env
COPY docker/config.js.template /docker-templates/config.js.template
COPY docker/render-chain-proxies.js /docker-templates/render-chain-proxies.js
COPY docker/30-render-config.sh /docker-entrypoint.d/30-render-config.sh
RUN chmod +x /docker-entrypoint.d/30-render-config.sh

EXPOSE 80
