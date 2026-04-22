const STEAMWEBAPI_KEY = "AUPR1LPO9RL9FWXM"; 

async function testarSteamWebAPI() {
  const itemName = "AK-47 | Redline (Field-Tested)";
  console.log(`🔍 Testando a SteamWebAPI para o item: ${itemName}...`);
  
  // Endpoint oficial da SteamWebAPI para buscar um item específico
  const encodedName = encodeURIComponent(itemName);
  const url = `https://www.steamwebapi.com/steam/api/item?key=${STEAMWEBAPI_KEY}&market_hash_name=${encodedName}`;
  
  try {
    console.log(`🌐 Acessando URL: ${url}`);
    const response = await fetch(url);
    const data = await response.json();
    
    console.log("\n📦 RESPOSTA BRUTA DA API:");
    console.log(JSON.stringify(data, null, 2));

    if (data && data.prices) {
      console.log("\n🎯 RESULTADO DA YOUPIN:");
      console.log(`Preço Youpin: ${data.prices.youpin ? `$${data.prices.youpin}` : 'Não encontrado'}`);
    }

  } catch (error) {
    console.error("❌ Erro ao conectar com a API:", error);
  }
}

testarSteamWebAPI();