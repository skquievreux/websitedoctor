# Layer order matters for build-cache reuse: dependencies (rarely change)
# before source code (changes every commit) so `docker build` only
# re-runs `pnpm install`/`pip install` when their lockfiles actually change.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

# ── Node dependencies layer (cached unless lockfile changes) ───────
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# ── Python/Scrapling layer for the bot-block fallback (scripts/stealth_fetch.py) ─
# Camoufox is a separate patched-Firefox build fetched by `camoufox fetch`,
# not something pip/apt ships — that's why it's its own step, and why this
# image is noticeably bigger than the plain Playwright-Chromium one.
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt \
    && python3 -m playwright install-deps firefox \
    && python3 -m camoufox fetch

# ── Source layer (changes every deploy, cheap on top of cached deps) ─
COPY . .

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "server.js"]
