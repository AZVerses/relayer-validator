# Single-image deployment: serves the admin SPA and the validator API on
# one port. Internally, nginx fronts a localhost-only fastify process;
# the SPA, validator API (/sign, /validator, /health, /admin/*), the
# relayer proxy (/api/chain/{chainId}/*) and the RPC proxy
# (/rpc/chain/...) all share APP_PORT. The SPA calls /validator and
# /admin/* directly on this same origin.

# ===== Stage 1: build the admin SPA =====
FROM node:20-alpine AS web-builder
WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ===== Stage 2: build the validator service =====
FROM node:20-alpine AS svc-builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ===== Stage 3: runtime — nginx + node together =====
FROM node:20-alpine

# bash for `wait -n` in the entrypoint; nginx + gettext (envsubst) for
# the proxy template; apache2-utils for htpasswd (admin basic_auth);
# tini as PID 1 so signals reach both children.
RUN apk add --no-cache bash nginx gettext apache2-utils tini

WORKDIR /app

# Production deps only for the validator service runtime.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=svc-builder /app/dist ./dist
COPY --from=web-builder /web/dist /usr/share/nginx/html

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/config.js.template /docker-templates/config.js.template
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && mkdir -p /etc/nginx/http.d /run/nginx /var/lib/nginx/tmp /var/log/nginx \
    && chown -R node:node /etc/nginx /run/nginx /var/lib/nginx /var/log/nginx /usr/share/nginx/html

# APP_PORT is the externally-exposed port (SPA + API share it).
# INTERNAL_VALIDATOR_PORT is the loopback-only fastify bind; nginx is
# the only thing that talks to it.
ENV APP_PORT=3001
ENV INTERNAL_VALIDATOR_PORT=3010
ENV LOG_LEVEL=info

EXPOSE 3001

USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/entrypoint.sh"]
