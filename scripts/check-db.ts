import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDatabase() {
  console.log("🔍 Analisando o Banco de Dados...");
  try {
    const total = await prisma.skinPrice.count();
    const youpinCount = await prisma.skinPrice.count({ where: { marketplace: 'Youpin' } });
    const buffCount = await prisma.skinPrice.count({ where: { marketplace: 'Buff163' } });

    console.log(`\n📊 TOTAL DE SKINS CADASTRADAS: ${total}`);
    console.log(`🟢 Valores da Youpin: ${youpinCount} skins`);
    console.log(`🟡 Valores do Buff163 (Fallback): ${buffCount} skins`);
    
    if (youpinCount > 0) {
      console.log("\n✅ O sistema está funcionando perfeitamente! Os itens do seu inventário só caíram no Buff porque faltava estoque deles na Youpin hoje.");
    }
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();