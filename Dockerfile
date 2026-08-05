# syntax=docker/dockerfile:1

# =============================================================================
# Drukair NDI demo — production image.
#
# Three stages so the final image carries only what it needs to serve: no
# toolchain, no dev dependencies, no source.
#
# This app requires a LONG-RUNNING process. Credential issuance is started after
# the webhook response is sent, and the session/record stores are in memory, so
# it must not be deployed to a serverless runtime and must run as exactly ONE
# instance. See README.md.
# =============================================================================

# Pinned to the Node 22 line, matching local development.
ARG NODE_VERSION=22-alpine

# --- deps: install node_modules from the lockfile only -----------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` installs exactly the lockfile. Kept in its own stage so this layer is
# cached and only reinstalls when the lockfile actually changes.
RUN npm ci

# --- builder: compile the Next.js standalone output -------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js phones home during build unless told not to.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runner: the shipped image ----------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Bind to all interfaces; the platform routes to this container.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Run unprivileged. `node` (uid 1000) already exists in the base image.
USER node

# public/ holds the 37 MB hero video, so it must be copied explicitly —
# standalone output does not bundle static assets.
COPY --from=builder --chown=node:node /app/public ./public
# server.js plus the traced subset of node_modules needed to run it.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

EXPOSE 3000

# standalone emits its own server; `next start` is not used here.
CMD ["node", "server.js"]
