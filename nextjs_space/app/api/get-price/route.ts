import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const names: string[] = body?.market_hash_names || [];

    if (names.length === 0) return NextResponse.json({ success: false, prices: [] }, { status: 400 });

    // ⚡ O SEGREDO DA VELOCIDADE: Busca 100 itens numa única ida à base de dados!
    const cachedItems = await prisma.skinPrice.findMany({
      where: { marketHashName: { in: names } },
    });

    const cacheMap = new Map(cachedItems.map((item) => [item.marketHashName, item]));
    
    // Organiza a resposta para devolver ao site
    const orderedResults = names.map((name) => {
      const cached = cacheMap.get(name);
      return {
        market_hash_name: name,
        price: cached ? cached.priceUsd : 0,
        marketplace: cached ? cached.marketplace : "Sem listagem",
      };
    });

    return NextResponse.json({ success: true, prices: orderedResults });
  } catch (error) {
    return NextResponse.json({ success: false, prices: [], error: "Erro interno" });
  }
}