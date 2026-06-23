#!/bin/sh
# Render runtime config.js from env vars at container start.
# This runs before nginx starts, so config.js is ready when the first request hits.
set -e

if [ -n "${CHAIN_CONFIGS:-}" ]; then
  envsubst < /docker-templates/config.js.template > /usr/share/nginx/html/config.js
else
  echo "WARNING: CHAIN_CONFIGS env not set. /config.js will be empty."
  echo 'window.__APP_CONFIG__ = {}' > /usr/share/nginx/html/config.js
fi

node /docker-templates/render-chain-proxies.js /etc/nginx/conf.d/chain-proxies.conf

echo "Rendered /usr/share/nginx/html/config.js:"
cat /usr/share/nginx/html/config.js
