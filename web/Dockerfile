# ===== Build stage =====
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ===== Runtime stage =====
FROM nginx:1.27-alpine

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
