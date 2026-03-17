import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FetchResult = {
  price: number;
  marketplace: string;
  status: "success" | "no_price" | "error";
};

// ═══════════════════════════════════════════════════════════════════════
// NOVA BUSCA VIA API DO CSFLOAT
// ═══════════════════════════════════════════════════════════════════════
async function fetchFromCSFloat(
  marketHashName: string,
  maxRetries = 3
): Promise<FetchResult> {
  const encoded = encodeURIComponent(marketHashName);
  // Endpoint público do CSFloat para buscar a listagem mais barata do item
  const url = `https://csfloat.com/api/v1/listings?market_hash_name=${encoded}&limit=1`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (res.status === 429) {
        // Se bater o limite do CSFloat, espera um pouco mais
        await delay(3000 * attempt);
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        // O CSFloat retorna um array de itens à venda. Pegamos o primeiro (mais barato).
        if (data && data.length > 0 && data[0].price) {
          // O preço no CSFloat vem em centavos de dólar (ex: 1250 = $12.50)
          const priceUsd = data[0].price / 100;
          return {
            price: priceUsd,
            marketplace: "CSFloat",
            status: "success",
          };
        }
        // Item existe mas não tem ninguém vendendo no momento
        return { price: 0, marketplace: "Sem listagem", status: "no_price" };
      }

      await delay(1500 * attempt);
    } catch {
      await delay(1500 * attempt);
    }
  }

  // Falha total após as tentativas
  return { price: 0, marketplace: "Erro", status: "error" };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const names: string[] =
      body?.market_hash_names ||
      (body?.market_hash_name ? [body.market_hash_name] : []);

    if (names.length === 0) {
      return NextResponse.json(
        { success: false, prices: [] },
        { status: 400 }
      );
    }

    const uniqueNames = Array.from(new Set(names));
    const now = new Date();
    const cacheThreshold = new Date(now.getTime() - CACHE_TTL_MS);

    // PASSO 1: Busca no banco de dados
    const cachedItems = await prisma.skinPrice.findMany({
      where: { marketHashName: { in: uniqueNames } },
    });

    const cacheMap = new Map(
      cachedItems.map((item) => [item.marketHashName, item])
    );

    const results: Array<{
      market_hash_name: string;
      price: number;
      marketplace: string;
      source: "cache" | "api";
    }> = [];

    const missedNames: string[] = [];

    // Verifica o que já está no banco e o que precisa buscar
    for (const name of uniqueNames) {
      const cached = cacheMap.get(name);

      if (cached && cached.updatedAt >= cacheThreshold) {
        results.push({
          market_hash_name: name,
          price: cached.priceUsd,
          marketplace: cached.marketplace, // Provavelmente estará como "CSFloat"
          source: "cache",
        });
      } else {
        missedNames.push(name);
      }
    }

    // PASSO 2: Busca na API do CSFloat os que faltaram
    if (missedNames.length > 0) {
      for (let i = 0; i < missedNames.length; i++) {
        const name = missedNames[i];
        const apiData = await fetchFromCSFloat(name);

        results.push({
          market_hash_name: name,
          price: apiData.price,
          marketplace: apiData.marketplace,
          source: "api",
        });

        // Salva no banco apenas se não deu erro crítico
        if (apiData.status !== "error") {
          await prisma.skinPrice
            .upsert({
              where: { marketHashName: name },
              update: {
                priceUsd: apiData.price,
                marketplace: apiData.marketplace,
              },
              create: {
                marketHashName: name,
                priceUsd: apiData.price,
                marketplace: apiData.marketplace,
              },
            })
            .catch(() => {});
        }

        // Delay de 1 segundo entre as chamadas para não sobrecarregar o CSFloat
        if (i < missedNames.length - 1) {
          await delay(1000);
        }
      }
    }

    const resultMap = new Map(results.map((r) => [r.market_hash_name, r]));
    
    const orderedResults = names.map(
      (name) =>
        resultMap.get(name) || {
          market_hash_name: name,
          price: 0,
          marketplace: "Erro",
          source: "api" as const,
        }
    );

    // Compatibilidade com a página (que busca um por um)
    if (body?.market_hash_name && !body?.market_hash_names) {
      const single = orderedResults[0];
      return NextResponse.json({
        success: true,
        price: single.price,
        marketplace: single.marketplace,
        source: single.source,
      });
    }

    return NextResponse.json({
      success: true,
      prices: orderedResults,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      prices: [],
      error: "Erro interno",
    });
  }
}