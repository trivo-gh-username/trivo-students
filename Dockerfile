# syntax=docker/dockerfile:1

# ── CSS build stage ──────────────────────────────────────────────────
# Compiles css/tailwind.src.css -> css/tailwind.css using the Tailwind
# CLI (devDependency). This stage's node_modules never ships in the
# final image — only the compiled, static CSS file does.
FROM node:22-alpine AS css-builder
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY css ./css
COPY admin ./admin
COPY *.html ./
RUN npm run build:css

# ── Runtime image ───────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server ./server
COPY admin ./admin
COPY css ./css
COPY js ./js
COPY data ./data
COPY *.html ./
COPY --from=css-builder /app/css/tailwind.css ./css/tailwind.css

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]
