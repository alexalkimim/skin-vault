import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { tradeUrl } = await request.json();
    const STEAMWEBAPI_KEY = "AUPR1LPO9RL9FWXM";

    // Extrai o ID da Steam ou Link
    let steamId = tradeUrl;
    if (tradeUrl.includes("shaid=")) {
      steamId = tradeUrl.split("shaid=")[1].split("&")[0];
    } else if (tradeUrl.includes("profiles/")) {
      steamId = tradeUrl.split("profiles/")[1].split("/")[0].split("?")[0];
    }

    console.log(`🔍 Buscando inventário para ID: ${steamId}`);

    const response = await fetch(
      `https://www.steamwebapi.com/steam/api/inventory?key=${STEAMWEBAPI_KEY}&steam_id=${steamId}`
    );

    const data = await response.json();

    // Se a API retornar erro de limite ou de conexão
    if (!response.ok || !data || data.error) {
      console.error("❌ Erro na SteamWebAPI:", data?.error || "Resposta vazia");
      return NextResponse.json({ 
        success: false, 
        error: "Inventário privado, não encontrado ou limite de API atingido." 
      });
    }

    // Filtra apenas itens do CS2 (AppID 730)
    const items = data.map((item: any) => ({
      name: item.markethashname,
      market_hash_name: item.markethashname,
      image: item.image,
    }));

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("❌ Erro fatal no servidor:", error);
    return NextResponse.json({ success: false, error: "Erro ao processar inventário." });
  }
}