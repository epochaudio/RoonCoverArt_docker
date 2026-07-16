# syntax=docker/dockerfile:1

# Roon packages are installed from GitHub, so Git is needed only while resolving
# production dependencies. It is deliberately absent from the runtime image.
FROM node:20-alpine AS dependencies

WORKDIR /app

RUN apk add --no-cache git
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Keep the runtime stage small and copy only the application allowlist below.
# In particular, local backups, pairing data, images, tests and docs never enter it.
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# entrypoint.sh starts as root only to repair mounted-file permissions and add the
# optional host input group, then su-exec drops privileges to the node user.
RUN apk add --no-cache su-exec

COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY app.js entrypoint.sh healthcheck.js ./
COPY config ./config
COPY public ./public
COPY utils ./utils

RUN chmod +x /app/entrypoint.sh && \
    mkdir -p /app/images && \
    echo '{}' > /app/config.json && \
    chown -R node:node /app/images /app/config.json && \
    chmod 755 /app/images && \
    chmod 644 /app/config.json

EXPOSE 3666

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "healthcheck.js"]

STOPSIGNAL SIGTERM
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "app.js"]
