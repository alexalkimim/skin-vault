import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resultado do fetch: "success" | "no_price" | "error"
type FetchResult = {
  price: number;
  marketplace: string;
  status: "success" | "no_price" | "error";
};

async function fetchFromSteam(
  marketHashName: string,
  maxRetries = 5
): Promise<FetchResult> {
  const encoded = encodeURIComponent(marketHashName);
  const url = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${encoded}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://steamcommunity.com/market/",
        },
      });

      if (res.status === 429) {
        console.log(`  ⏳ Rate limit "${marketHashName}", tentativa ${attempt}/${maxRetries}`);
        await delay(8000 * attempt);
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.lowest_price) {
          const priceStr = data.lowest_price
            .replace(/[^0-9.,]/g, "")
            .replace(",", ".");
          return {
            price: parseFloat(priceStr) || 0,
            marketplace: "Steam Market",
            status: "success",
          };
        }
        // Item existe mas não tem preço (normal pra alguns itens)
        return { price: 0, marketplace: "Sem listagem", status: "no_price" };
      }

      await delay(3000 * attempt);
    } catch {
      await delay(3000 * attempt);
    }
  }

  // Falha total - NÃO salvar no banco
  return { price: 0, marketplace: "Erro", status: "error" };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Lista ORIGINAL com todos os itens (incluindo repetidos, ex: 50 caixas)
    const names: string[] =
      body?.market_hash_names ||
      (body?.market_hash_name ? [body.market_hash_name] : []);

    if (names.length === 0) {
      return NextResponse.json(
        { success: false, prices: [] },
        { status: 400 }
      );
    }

    // 🔥 OTIMIZAÇÃO 1: Cria uma lista limpa, sem itens repetidos
    const uniqueNames = Array.from(new Set(names));

    const now = new Date();
    const cacheThreshold = new Date(now.getTime() - CACHE_TTL_MS);

    // PASSO 1: Buscar TODOS do banco em UMA query (usando a lista única para poupar o banco)
    const cachedItems = await prisma.skinPrice.findMany({
      where: { marketHashName: { in: uniqueNames } },
    });

    const cacheMap = new Map(
      cachedItems.map((item) => [item.marketHashName, item])
    );

    // PASSO 2: Separar hits vs misses
    const results: Array<{
      market_hash_name: string;
      price: number;
      marketplace: string;
      source: "cache" | "api";
    }> = [];

    const missedNames: string[] = [];

    // 🔥 OTIMIZAÇÃO 2: Faz o loop apenas nos itens únicos
    for (const name of uniqueNames) {
      const cached = cacheMap.get(name);

      if (cached && cached.updatedAt >= cacheThreshold) {
        results.push({
          market_hash_name: name,
          price: cached.priceUsd,
          marketplace: cached.marketplace,
          source: "cache",
        });
      } else {
        missedNames.push(name);
      }
    }

    // PASSO 3: Buscar na Steam APENAS os misses (agora vai buscar 1 caixa só, em vez de 50)
    if (missedNames.length > 0) {
      console.log(
        `[Cache] ${results.length} hits, ${missedNames.length} misses únicos. Buscando na Steam...`
      );

      for (let i = 0; i < missedNames.length; i++) {
        const name = missedNames[i];
        const steamData = await fetchFromSteam(name);

        results.push({
          market_hash_name: name,
          price: steamData.price,
          marketplace: steamData.marketplace,
          source: "api",
        });

        // SÓ salva no banco se NÃO foi erro (evita poluir o cache)
        if (steamData.status !== "error") {
          await prisma.skinPrice
            .upsert({
              where: { marketHashName: name },
              update: {
                priceUsd: steamData.price,
                marketplace: steamData.marketplace,
              },
              create: {
                marketHashName: name,
                priceUsd: steamData.price,
                marketplace: steamData.marketplace,
              },
            })
            .catch((err) =>
              console.error(`[Cache] Erro ao salvar "${name}":`, err)
            );
        }

        // Delay entre chamadas Steam (2s pra evitar rate limit)
        if (i < missedNames.length - 1) {
          await delay(2000);
        }
      }
    } else {
      console.log(`[Cache] 100% cache hit! ${results.length} itens únicos do banco.`);
    }

    // PASSO 4: Reordenar e "multiplicar" na ordem original pedida pelo Front-end
    const resultMap = new Map(
      results.map((r) => [r.market_hash_name, r])
    );
    
    // Aqui ele usa a lista 'names' original (com repetidos) e clona o preço para todos
    const orderedResults = names.map(
      (name) =>
        resultMap.get(name) || {
          market_hash_name: name,
          price: 0,
          marketplace: "Erro",
          source: "api" as const,
        }
    );

    // Compatibilidade com item único
    if (body?.market_hash_name && !body?.market_hash_names) {
      const single = orderedResults[0];
      return NextResponse.json({
        success: true,
        price: single.price,
        marketplace: single.marketplace,
        source: single.source,
      });
    }

    const cacheHits = orderedResults.filter((r) => r.source === "cache").length;
    const apiCalls = orderedResults.filter((r) => r.source === "api").length;

    return NextResponse.json({
      success: true,
      prices: orderedResults,
      stats: {
        total: orderedResults.length, // Vai mostrar o total real (ex: 50 itens)
        itens_unicos_processados: uniqueNames.length, // Mostra quantos ele realmente calculou
        cacheHits,
        apiCalls,
        cacheHitRate: `${((cacheHits / orderedResults.length) * 100).toFixed(1)}%`,
      },
    });
  } catch (error) {
    console.error("Price fetch error:", error);
    return NextResponse.json({
      success: false,
      prices: [],
      error: "Erro interno",
    });
  }
}