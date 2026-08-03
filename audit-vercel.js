#!/usr/bin/env node

/**
 * Audit all public Vercel projects with Sitechecker
 */

const urls = [
  'https://ai2go.runitfast.xyz',
  'https://dreamedit.runitfast.xyz',
  'https://transkriptor.runitfast.xyz',
  'https://shader.runitfast.xyz',
  'https://voicestage.runitfast.xyz',
  'https://svg.runitfast.xyz',
  'https://techeroes-quiz.vercel.app',
  'https://osteoconnect.runitfast.xyz',
  'https://leadmagnet-question-nmzt.vercel.app',
  'https://ki-vergleich.org',
  'https://epdf.runitfast.xyz',
  'https://techeroes.runitfast.xyz',
  'https://cover.runitfast.xyz',
  'https://healing.unlock-your-song.de',
  'https://waldessenz.runitfast.xyz',
  'https://videoedidshare.vercel.app',
  'https://videoedidshare-n2ds.vercel.app',
  'https://runninggame.runitfast.xyz',
  'https://leadmagnet-question.vercel.app',
  'https://numerorologie.vercel.app',
  'https://leadmagnet-quiz-mitochondrien.vercel.app',
  'https://heldenquiz.runitfast.xyz',
  'https://simplehosting.vercel.app',
  'https://vibecode-workshop-lovat.vercel.app',
  'https://gallery-ten-opal.vercel.app',
  'https://apps-six-pied.vercel.app'
];

const BASE_URL = 'http://localhost:3001';

async function checkUrl(url) {
  try {
    const response = await fetch(`${BASE_URL}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    return data;
  } catch (err) {
    console.error(`✗ ${url}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log(`\n📊 Starting Sitechecker Audit für ${urls.length} öffentliche Vercel-Projekte`);
  console.log(`🔗 Server: ${BASE_URL}\n`);

  const runIds = [];

  // Queue all audits
  for (const url of urls) {
    const result = await checkUrl(url);
    if (result?.id) {
      runIds.push({ url, id: result.id });
      console.log(`✓ Queued: ${url} (ID: ${result.id})`);
    }
  }

  console.log(`\n⏳ Alle ${runIds.length} Audits queued. Warte auf Completion...\n`);

  // Wait for all to complete
  let completed = 0;
  const interval = setInterval(async () => {
    for (let i = runIds.length - 1; i >= 0; i--) {
      const { url, id } = runIds[i];
      try {
        const res = await fetch(`${BASE_URL}/status/${id}`);
        const status = await res.json();

        if (status.status === 'done' || status.status === 'error') {
          console.log(`✓ ${status.status.toUpperCase()}: ${url}`);
          runIds.splice(i, 1);
          completed++;
        }
      } catch (err) {
        // ignore
      }
    }

    if (runIds.length === 0) {
      clearInterval(interval);
      console.log(`\n✅ Audit abgeschlossen! ${completed}/${urls.length} Reports verfügbar.`);
      console.log(`📈 Öffne: http://localhost:3001 zum Anschauen der Reports`);
      process.exit(0);
    }
  }, 5000);
}

main();
