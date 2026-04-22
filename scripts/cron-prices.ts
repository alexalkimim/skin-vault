import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export {}; 

function calculateRealPrice(pureUsdPrice: number): number {
  if (pureUsdPrice <= 0.50) return pureUsdPrice * 0.65;
  else if (pureUsdPrice > 0.50 && pureUsdPrice <= 3.00) return pureUsdPrice * 0.82;
  else if (pureUsdPrice > 3.00 && pureUsdPrice <= 15.00) return pureUsdPrice * 0.89;
  else if (pureUsdPrice > 15.00 && pureUsdPrice <= 100.00) return pureUsdPrice * 0.95;
  else return pureUsdPrice * 1.00;
}

async function updateAllPrices() {
  console.log("🚀 Iniciando Sincronização: VALORES REAIS (Youpin vs Buff)...");
  try {
    const resDolar = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL');
    const dataDolar: any = await resDolar.json();
    const brlRate = parseFloat(dataDolar.USDBRL.ask);

    const [youpinRes, buffRes] = await Promise.all([
      fetch('https://prices.csgotrader.app/latest/youpin.json'),
      fetch('https://prices.csgotrader.app/latest/buff163.json')
    ]);

    const youpinData: Record<string, any> = await youpinRes.json();
    const buffData: Record<string, any> = await buffRes.json();

    const allNames = Array.from(new Set([...Object.keys(youpinData), ...Object.keys(buffData)]));
    
    const chunkSize = 500;
    for (let i = 0; i < allNames.length; i += chunkSize) {
      const chunk = allNames.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(async (name) => {
        const yItem = youpinData[name];
        const bItem = buffData[name];

        const pYouUsd = yItem?.starting_at?.price || yItem?.min_price || 0;
        const pBuffUsd = bItem?.starting_at?.price || bItem?.min_price || 0;

        // REMOVIDO O FALLBACK: Agora Youpin é Youpin e Buff é Buff.
        // Se um deles for zero, ele será salvo como NULL no banco.
        if (pYouUsd > 0 || pBuffUsd > 0) {
          await prisma.skinPrice.upsert({
            where: { marketHashName: name },
            update: {
              priceYoupin: pYouUsd > 0 ? calculateRealPrice(pYouUsd) * brlRate : null,
              priceBuff: pBuffUsd > 0 ? calculateRealPrice(pBuffUsd) * brlRate : null,
            },
            create: {
              marketHashName: name,
              priceYoupin: pYouUsd > 0 ? calculateRealPrice(pYouUsd) * brlRate : null,
              priceBuff: pBuffUsd > 0 ? calculateRealPrice(pBuffUsd) * brlRate : null,
            }
          });
        }
      }));
      console.log(`✅ Progresso: ${i + chunk.length}/${allNames.length}`);
    }
    console.log("🎉 Banco de dados atualizado com valores independentes!");
  } catch (e) { console.error(e); } finally { await prisma.$disconnect(); }
}

updateAllPrices();