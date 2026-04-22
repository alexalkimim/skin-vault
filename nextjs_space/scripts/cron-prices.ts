import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// 🧠 A FÓRMULA DE OURO (Calibrada para bater com a China/Buff163)
function calculateRealPrice(pureUsdPrice: number): number {
  if (pureUsdPrice <= 0.50) {
    return pureUsdPrice * 0.65; // Tier 1: 65% (Centavos/Adesivos)
  } else if (pureUsdPrice > 0.50 && pureUsdPrice <= 3.00) {
    return pureUsdPrice * 0.82; // Tier 2: 82% (Skins de entrada/Caixas)
  } else if (pureUsdPrice > 3.00 && pureUsdPrice <= 15.00) {
    return pureUsdPrice * 0.89; // Tier 3: 89% (Play Skins Populares)
  } else if (pureUsdPrice > 15.00 && pureUsdPrice <= 100.00) {
    return pureUsdPrice * 0.95; // Tier 4: 95% (Facas/Luvas de entrada)
  } else {
    return pureUsdPrice * 1.00; // Tier 5: 100% (Luxo absoluto)
  }
}

async function updateAllPrices() {
  console.log("🚀 Iniciando Robô de Preços (Fórmula de Ouro + Anti-Doppler)...");
  try {
    const filePath = path.join(process.cwd(), 'scripts', 'prices.json');
    if (!fs.existsSync(filePath)) {
      console.error("❌ ERRO: Arquivo 'prices.json' não encontrado!");
      return;
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(rawData);
    if (!Array.isArray(data)) return;

    // 🔥 FILTRO ANTI-DOPPLER: Mantém apenas o menor preço para nomes repetidos
    const lowestPriceMap = new Map<string, number>();

    for (const item of data) {
      let pureUsdPrice = item.min_price || item.suggested_price;
      if (pureUsdPrice && pureUsdPrice > 0) {
        const hashName = item.market_hash_name;
        // Se o item já existe, substitui apenas se o novo preço for menor (mata o preço da Sapphire)
        if (!lowestPriceMap.has(hashName) || pureUsdPrice < lowestPriceMap.get(hashName)!) {
          lowestPriceMap.set(hashName, pureUsdPrice);
        }
      }
    }

    const itemsToUpsert: any[] = [];
    lowestPriceMap.forEach((pureUsdPrice, marketHashName) => {
      const finalPriceUsd = calculateRealPrice(pureUsdPrice);
      itemsToUpsert.push({
        marketHashName,
        priceUsd: finalPriceUsd,
        marketplace: "Cotação Dinâmica (Fórmula de Ouro)"
      });
    });

    console.log(`💾 Gravando ${itemsToUpsert.length} itens no banco...`);
    
    // Gravação em lotes para performance
    const chunkSize = 1000;
    for (let i = 0; i < itemsToUpsert.length; i += chunkSize) {
      const chunk = itemsToUpsert.slice(i, i + chunkSize);
      await Promise.all(chunk.map(item => 
        prisma.skinPrice.upsert({
          where: { marketHashName: item.marketHashName },
          update: { priceUsd: item.priceUsd, marketplace: item.marketplace },
          create: { marketHashName: item.marketHashName, priceUsd: item.priceUsd, marketplace: item.marketplace },
        })
      ));
    }

    console.log("🎉 SUCESSO! Preços atualizados e calibrados.");
  } catch (error) {
    console.error("❌ Erro fatal:", error);
  } finally {
    await prisma.$disconnect();
  }
}

updateAllPrices();