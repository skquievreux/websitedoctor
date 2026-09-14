# Layer order matters for build-cache reuse: dependencies (rarely change)
# before source code (changes every commit) so `docker build` only
# re-runs `pnpm install`/`pip install` when their lockfiles actually change.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

# ── Node dependencies layer (cached unless lockfile changes) ───────
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# ── Stage-1 bot-bypass (scripts/stealth-node.js): rebrowser-playwright needs
# real Google Chrome (`channel: 'chrome'`, not the base image's Chromium —
# fingerprint checks key on the real Chrome binary) running headed, which
# needs an actual display even in a server container — hence Xvfb, wrapped
# around the CMD below instead of every launch call.
RUN npx playwright install chrome \
    && apt-get update && apt-get install -y --no-install-recommends xvfb \
    && rm -rf /var/lib/apt/lists/*

# ── Python/Scrapling layer for the stage-2 bot-block fallback (scripts/stealth_fetch.py) ─
# Camoufox is a separate patched-Firefox build fetched by `camoufox fetch`,
# not something pip/apt ships — that's why it's its own step, and why this
# image is noticeably bigger than the plain Playwright-Chromium one.
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
# No --break-system-packages: that flag needs pip 23.0.1+ (PEP 668), but
# this base image's apt-installed python3-pip on Ubuntu 22.04/jammy is
# 22.0.2 and doesn't have the "externally managed environment" guard the
# flag opts out of in the first place — passing it is just a hard error here.
RUN pip3 install --no-cache-dir -r requirements.txt \
    && python3 -m playwright install-deps firefox \
    && python3 -m camoufox fetch

# ── Source layer (changes every deploy, cheap on top of cached deps) ─
COPY . .

ENV NODE_ENV=production
EXPOSE 3001

# xvfb-run gives stage-1's headed Chrome a virtual display; server.js itself
# and the plain headless crawl are unaffected — Xvfb just sits there idle
# until stealth-node.js actually launches a headed browser.
CMD ["xvfb-run", "--auto-servernum", "node", "server.js"]
