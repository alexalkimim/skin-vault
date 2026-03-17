import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════
// CRON JOB: Atualiza o "Saco de Preços" a cada 12 horas
// ═══════════════════════════════════════════════════════════════════════════
// Execução: npx tsx scripts/cron-prices.ts
// Agendar com cron do sistema: 0 */12 * * * cd /path/to/project && npx tsx scripts/cron-prices.ts
// ═══════════════════════════════════════════════════════════════════════════

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STEAM_API_URL =
  "https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=";

// Busca preço de um item na Steam
async function fetchSteamPrice(
  marketHashName: string,
  maxRetries = 4
): Promise<number> {
  const encoded = encodeURIComponent(marketHashName);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${STEAM_API_URL}${encoded}`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://steamcommunity.com/market/",
        },
      });

      if (res.status === 429) {
        console.log(
          `  ⏳ Rate limit em "${marketHashName}", tentativa ${attempt}/${maxRetries}...`
        );
        await delay(5000 * attempt);
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.lowest_price) {
          const priceStr = data.lowest_price
            .replace(/[^0-9.,]/g, "")
            .replace(",", ".");
          return parseFloat(priceStr) || 0;
        }
        return 0;
      }

      await delay(2000 * attempt);
    } catch (err) {
      console.error(`  ❌ Erro ao buscar "${marketHashName}":`, err);
      await delay(2000 * attempt);
    }
  }

  return -1; // -1 = falha total, não atualizar o banco
}

async function runPriceUpdate() {
  const startTime = Date.now();
  console.log("═══════════════════════════════════════════════════");
  console.log(`🚀 Iniciando atualização de preços: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════");

  // 1. Buscar todos os itens que já temos no banco
  const existingItems = await prisma.skinPrice.findMany({
    select: { marketHashName: true },
    orderBy: { updatedAt: "asc" }, // Mais antigos primeiro
  });

  if (existingItems.length === 0) {
    console.log("📭 Nenhum item no banco para atualizar.");
    console.log("   Itens serão adicionados conforme os usuários consultarem inventários.");
    await prisma.$disconnect();
    return;
  }

  console.log(`📦 ${existingItems.length} itens para atualizar.
`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < existingItems.length; i++) {
    const { marketHashName } = existingItems[i];

    const progress = `[${i + 1}/${existingItems.length}]`;
    process.stdout.write(`${progress} ${marketHashName.substring(0, 50).padEnd(50)} `);

    const price = await fetchSteamPrice(marketHashName);

    if (price === -1) {
      // Falha total - não mexer no registro
      console.log("❌ FALHOU");
      failed++;
    } else if (price === 0) {
      // Item sem preço no mercado - atualizar timestamp mas manter preço 0
      await prisma.skinPrice.update({
        where: { marketHashName },
        data: { priceUsd: 0, marketplace: "Sem preço" },
      });
      console.log("⚪ $0.00");
      skipped++;
    } else {
      // Sucesso!
      await prisma.skinPrice.update({
        where: { marketHashName },
        data: { priceUsd: price, marketplace: "Steam Market" },
      });
      console.log(`✅ $${price.toFixed(2)}`);
      updated++;
    }

    // Delay entre requisições: 1.5s
    if (i < existingItems.length - 1) {
      await delay(1500);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log("\n═══════════════════════════════════════════════════");
  console.log(`✅ Atualização concluída em ${elapsed} minutos`);
  console.log(`   Atualizados: ${updated} | Sem preço: ${skipped} | Falhas: ${failed}`);
  console.log("═══════════════════════════════════════════════════");

  await prisma.$disconnect();
}

// Executar
runPriceUpdate().catch((err) => {
  console.error("💥 Erro fatal no cron:", err);
  prisma.$disconnect();
  process.exit(1);
});
