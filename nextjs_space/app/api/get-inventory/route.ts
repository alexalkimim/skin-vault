import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function extractSteamID64(tradeUrl: string): string | null {
  try {
    const url = new URL(tradeUrl);
    const partner = url?.searchParams?.get('partner');
    if (!partner) return null;

    const partnerId = parseInt(partner);
    if (isNaN(partnerId)) return null;

    const steamId64 = (BigInt(partnerId) + BigInt('76561197960265728')).toString();
    return steamId64;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tradeUrl = body?.tradeUrl;

    if (!tradeUrl) {
      return NextResponse.json(
        { success: false, error: 'Trade URL não fornecida' },
        { status: 400 }
      );
    }

    const steamId64 = extractSteamID64(tradeUrl);
    if (!steamId64) {
      return NextResponse.json(
        { success: false, error: 'Trade URL inválida' },
        { status: 400 }
      );
    }

    console.log('Steam ID64:', steamId64);

    // Buscar inventário via Steam Community API
    const inventoryUrl = `https://steamcommunity.com/inventory/${steamId64}/730/2?l=english&count=2000`;

    console.log('Fetching inventory from:', inventoryUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const inventoryResponse = await fetch(inventoryUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `https://steamcommunity.com/profiles/${steamId64}/inventory/`,
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
    });

    clearTimeout(timeoutId);

    console.log('Inventory response status:', inventoryResponse.status);

    const responseText = await inventoryResponse.text();
    console.log('Response length:', responseText.length);
    console.log('Response preview:', responseText.substring(0, 200));

    if (!inventoryResponse.ok) {
      if (inventoryResponse.status === 403) {
        return NextResponse.json(
          { success: false, error: 'Inventário privado. O usuário precisa tornar o inventário público nas configurações da Steam.' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { success: false, error: `Erro ao buscar inventário. Status: ${inventoryResponse.status}` },
        { status: inventoryResponse.status }
      );
    }

    if (!responseText || responseText === 'null' || responseText.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Inventário não encontrado ou privado.' },
        { status: 404 }
      );
    }

    let inventoryData: any;
    try {
      inventoryData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Parse error:', parseError);
      return NextResponse.json(
        { success: false, error: 'Erro ao processar resposta da Steam' },
        { status: 500 }
      );
    }

    if (!inventoryData || inventoryData.success !== 1) {
      return NextResponse.json(
        { success: false, error: inventoryData?.error || 'Inventário não encontrado ou privado' },
        { status: 404 }
      );
    }

    const assets = inventoryData?.assets ?? [];
    const descriptions = inventoryData?.descriptions ?? [];

    // ═══════════════════════════════════════════════════════════════
    // DETECÇÃO DE ITENS OCULTOS
    // A Steam reporta total_inventory_count mas pode retornar menos
    // assets. A diferença são itens ocultos (equipados, storage unit,
    // faca padrão, etc.)
    // ═══════════════════════════════════════════════════════════════
    const totalInventoryCount = inventoryData?.total_inventory_count ?? assets.length;
    const hiddenItemsCount = Math.max(0, totalInventoryCount - assets.length);

    console.log(`Total reportado pela Steam: ${totalInventoryCount}, Assets recebidos: ${assets.length}, Ocultos: ${hiddenItemsCount}`);

    if (assets.length === 0) {
      return NextResponse.json({
        success: true,
        items: [],
        total: 0,
        currency: 'USD',
        totalInventoryCount,
        hiddenItemsCount,
      });
    }

    // Mapear itens
    const mappedItems = assets.map((asset: any) => {
      const description = descriptions.find(
        (desc: any) =>
          desc?.classid === asset?.classid &&
          desc?.instanceid === asset?.instanceid
      );

      const marketHashName = description?.market_hash_name ?? '';
      const iconUrl = description?.icon_url ?? '';
      const marketable = description?.marketable === 1;
      const tradable = description?.tradable === 1;

      const STEAM_CDN = ['https:/', '/community.cloudflare.steamstatic.com', '/economy/image/'].join('');
      const fullImageUrl = iconUrl ? (STEAM_CDN + iconUrl) : '';

      return {
        name: description?.market_name ?? description?.name ?? 'Unknown Item',
        image: fullImageUrl,
        price: 0,
        currency: 'USD',
        marketplace: marketable ? 'N/A' : 'Não vendável',
        market_hash_name: marketHashName,
        marketable: marketable,
        tradable: tradable,
      };
    });

    // Filtrar apenas itens vendáveis no mercado
    const marketableItems = mappedItems.filter((item: any) => item.marketable);

    return NextResponse.json({
      success: true,
      items: marketableItems,
      allItems: mappedItems,
      totalItems: mappedItems.length,
      marketableCount: marketableItems.length,
      nonMarketableCount: mappedItems.length - marketableItems.length,
      total: 0,
      currency: 'USD',
      // ══ Info de itens ocultos ══
      totalInventoryCount,
      hiddenItemsCount,
    });
  } catch (error: any) {
    console.error('Erro ao processar inventário:', error);

    if (error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Timeout ao buscar inventário. Tente novamente.' },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { success: false, error: error?.message ?? 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
