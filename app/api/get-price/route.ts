import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface SkinPriceRecord {
  marketHashName: string;
  priceYoupin: number | null;
  priceBuff: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const names: string[] = body?.market_hash_names || [];

    if (names.length === 0) return NextResponse.json({ success: false, prices: [] });

    const cachedItems = (await prisma.skinPrice.findMany({
      where: { marketHashName: { in: names } },
    })) as unknown as SkinPriceRecord[];

    const cacheMap = new Map<string, SkinPriceRecord>(
      cachedItems.map((item) => [item.marketHashName, item])
    );
    
    const orderedResults = names.map((name) => {
      const cached = cacheMap.get(name);
      return {
        market_hash_name: name,
        priceYoupin: cached?.priceYoupin || 0,
        priceBuff: cached?.priceBuff || 0,
      };
    });

    return NextResponse.json({ success: true, prices: orderedResults });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Erro interno" });
  }
}