#!/usr/bin/env bash
# Start the validator API on a loopback-only port and nginx on the
# externally-exposed APP_PORT. nginx serves the admin SPA and proxies
# every API path to either the local fastify or the upstream relayer/RPC.
set -euo pipefail

: "${APP_PORT:=3001}"
: "${INTERNAL_VALIDATOR_PORT:=3010}"

# Pull resolvers from /etc/resolv.conf so Docker-internal names
# (host.docker.internal, *.docker.internal, container-network names)
# resolve through the same DNS as `getent` / `wget` inside the
# container. Append 8.8.8.8 / 1.1.1.1 as a fallback for environments
# where /etc/resolv.conf is empty.
SYSTEM_RESOLVERS=$(awk '/^nameserver/ { print $2 }' /etc/resolv.conf | tr '\n' ' ')
NGINX_RESOLVERS="${SYSTEM_RESOLVERS}8.8.8.8 1.1.1.1"
export APP_PORT INTERNAL_VALIDATOR_PORT NGINX_RESOLVERS

# Render runtime SPA config. When CHAIN_CONFIGS is unset we still emit an
# empty config so the SPA's /config.js fetch returns 200 instead of 404.
if [ -n "${CHAIN_CONFIGS:-}" ]; then
  envsubst < /docker-templates/config.js.template > /usr/share/nginx/html/config.js
else
  echo 'window.__APP_CONFIG__ = {}' > /usr/share/nginx/html/config.js
fi

# Generate the basic_auth htpasswd guarding /admin/* and the SPA root.
# Username is hardcoded `admin`; password comes from env and is required
# so a misconfigured container fails loud rather than serving the SPA
# unauthenticated. bcrypt (-B) for forward secrecy if the file leaks.
: "${ADMIN_BASIC_AUTH_PASSWORD:?ADMIN_BASIC_AUTH_PASSWORD must be set}"
htpasswd -bcB /etc/nginx/.htpasswd admin "${ADMIN_BASIC_AUTH_PASSWORD}"
NGINX_WORKER_USER=$(nginx -T 2>/dev/null | awk '$1 == "user" { gsub(";", "", $2); print $2; exit }')
NGINX_WORKER_USER="${NGINX_WORKER_USER:-nginx}"
chown "root:${NGINX_WORKER_USER}" /etc/nginx/.htpasswd
chmod 640 /etc/nginx/.htpasswd

# Render nginx config — only explicit template vars are substituted so
# nginx's own $request_uri / $proxy_host / etc. survive.
mkdir -p /etc/nginx/http.d
envsubst '${APP_PORT} ${INTERNAL_VALIDATOR_PORT} ${NGINX_RESOLVERS}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/http.d/default.conf

# Suppress nginx's stock default server (some Alpine packages ship one
# that also binds :80, which would conflict with our APP_PORT=80 case).
rm -f /etc/nginx/conf.d/default.conf

# Start fastify on the loopback-only internal port.
APP_HOST=127.0.0.1 APP_PORT="${INTERNAL_VALIDATOR_PORT}" \
  node /app/dist/cli/index.js serve --log-level "${LOG_LEVEL:-info}" &
VALIDATOR_PID=$!

# Start nginx in the foreground.
nginx -g 'daemon off;' &
NGINX_PID=$!

# Forward termination signals to both children so docker stop is clean.
trap 'kill -TERM "${VALIDATOR_PID}" "${NGINX_PID}" 2>/dev/null || true' TERM INT

# Exit when either process dies so the container restarts (no partial
# half-up state where the SPA loads but the API is gone, or vice versa).
wait -n
EXIT=$?
kill -TERM "${VALIDATOR_PID}" "${NGINX_PID}" 2>/dev/null || true
wait
exit "${EXIT}"
