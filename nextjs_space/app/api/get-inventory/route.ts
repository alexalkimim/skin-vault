import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inputUrl = (body.tradeUrl || "").trim();
    if (!inputUrl) return NextResponse.json({ success: false, error: "Link não fornecido." });

    let steamId64 = "";

    // Extração do SteamID64 (suporta perfil numérico ou customizado)
    const profileMatch = inputUrl.match(/profiles\/(\d+)/);
    const idMatch = inputUrl.match(/id\/([^/?]+)/);
    const partnerMatch = inputUrl.match(/partner=(\d+)/);

    if (profileMatch) {
      steamId64 = profileMatch[1];
    } else if (partnerMatch) {
      steamId64 = (76561197960265728n + BigInt(partnerMatch[1])).toString();
    } else if (idMatch) {
      const vanityName = idMatch[1];
      const xmlRes = await fetch(`https://steamcommunity.com/id/${vanityName}/?xml=1`);
      const xmlText = await xmlRes.text();
      const vanityIdMatch = xmlText.match(/<steamID64>(\d+)<\/steamID64>/);
      if (vanityIdMatch) steamId64 = vanityIdMatch[1];
    }

    if (!steamId64) return NextResponse.json({ success: false, error: "Link da Steam inválido." });

    // Chamada à API Pública da Steam (Sem necessidade de Cookies)
    const invUrl = `https://steamcommunity.com/inventory/${steamId64}/730/2?l=portuguese&count=2000`;
    const invRes = await fetch(invUrl, { headers: { "User-Agent": "Mozilla/5.0" } });

    if (!invRes.ok) {
      if (invRes.status === 403) return NextResponse.json({ success: false, error: "O inventário deste perfil é privado." });
      if (invRes.status === 429) return NextResponse.json({ success: false, error: "A Steam bloqueou o pedido temporariamente (Rate Limit)." });
      return NextResponse.json({ success: false, error: "Erro ao acessar inventário." });
    }

    const invData = await invRes.json();
    const items: any[] = [];

    if (invData.assets && invData.descriptions) {
      const descMap = new Map();
      invData.descriptions.forEach((d: any) => descMap.set(`${d.classid}_${d.instanceid}`, d));

      invData.assets.forEach((asset: any) => {
        const desc = descMap.get(`${asset.classid}_${asset.instanceid}`);
        if (desc?.marketable) {
          items.push({
            name: desc.name,
            market_hash_name: desc.market_hash_name,
            image: `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}`,
          });
        }
      });
    }

    return NextResponse.json({ success: true, items, totalItems: items.length });

  } catch (error) {
    console.error("Erro no servidor:", error);
    return NextResponse.json({ success: false, error: "Erro interno." });
  }
}