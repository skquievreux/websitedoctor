# Layer order matters for build-cache reuse: dependencies (rarely change)
# before source code (changes every commit) so `docker build` only
# re-runs `pnpm install` when package.json/pnpm-lock.yaml actually change.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

# ── Dependencies layer (cached unless lockfile changes) ────────────
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# ── Source layer (changes every deploy, cheap on top of cached deps) ─
COPY . .

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "server.js"]
