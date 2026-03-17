'use client';

import { useState } from 'react';
import Image from 'next/image';

interface InventoryItem {
  name: string;
  image: string;
  price: number;
  price_brl: number;
  price_china: number;
  currency: string;
  marketplace: string;
  market_hash_name: string;
  marketable?: boolean;
  tradable?: boolean;
}

// Cotação USD/BRL
const USD_TO_BRL = 5.25;

// ═══════════════════════════════════════════════════════════════════════════
// FÓRMULA DE CONVERSÃO STEAM → CHINA (Buff163/Youpin) v2.0
// ═══════════════════════════════════════════════════════════════════════════
const calculateChinaPrice = (steamPriceBRL: number): number => {
  if (steamPriceBRL <= 0) return 0;

  let factor: number;
  if (steamPriceBRL >= 1000) {
    factor = 0.755;
  } else if (steamPriceBRL >= 500) {
    factor = 0.75;
  } else if (steamPriceBRL >= 200) {
    factor = 0.735;
  } else if (steamPriceBRL >= 50) {
    factor = 0.72;
  } else if (steamPriceBRL >= 10) {
    factor = 0.70;
  } else {
    factor = 0.68;
  }

  return steamPriceBRL * factor;
};

const calculateSavings = (steamPrice: number, chinaPrice: number): number => {
  if (steamPrice <= 0) return 0;
  return ((steamPrice - chinaPrice) / steamPrice) * 100;
};

export default function Home() {
  const [tradeUrl, setTradeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalBRL, setTotalBRL] = useState(0);
  const [totalChina, setTotalChina] = useState(0);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [itemStats, setItemStats] = useState({ total: 0, marketable: 0, nonMarketable: 0 });
  const [hiddenItems, setHiddenItems] = useState(0);
  const [totalInventoryCount, setTotalInventoryCount] = useState(0);

  const fetchPrice = async (marketHashName: string): Promise<{price: number; marketplace: string}> => {
    try {
      const response = await fetch('/api/get-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_hash_name: marketHashName }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          price: data.price || 0,
          marketplace: data.marketplace || 'N/A',
        };
      }
    } catch (e) {
      console.log('Price fetch error:', e);
    }
    return { price: 0, marketplace: 'N/A' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setItems([]);
    setTotal(0);
    setTotalBRL(0);
    setTotalChina(0);
    setHiddenItems(0);
    setTotalInventoryCount(0);
    setProgress('Buscando inventário...');

    try {
      const response = await fetch('/api/get-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeUrl }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Erro ao buscar inventário');
        setLoading(false);
        return;
      }

      if (data.items.length === 0) {
        setError('Inventário vazio ou sem itens vendáveis no mercado.');
        setLoading(false);
        return;
      }

      // Salvar info de itens ocultos
      setHiddenItems(data.hiddenItemsCount || 0);
      setTotalInventoryCount(data.totalInventoryCount || data.items.length);

      // Estatísticas dos itens
      setItemStats({
        total: data.totalItems || data.items.length,
        marketable: data.marketableCount || data.items.length,
        nonMarketable: data.nonMarketableCount || 0,
      });

      const nonMarketableMsg = data.nonMarketableCount > 0 
        ? ` (${data.nonMarketableCount} itens não vendáveis ignorados)` 
        : '';
      setProgress(`Encontrados ${data.items.length} itens vendáveis${nonMarketableMsg}. Carregando preços...`);
      setItems(data.items);
      setLoading(false);
      setLoadingPrices(true);

      // Buscar preços para cada item
      let totalValueUSD = 0;
      let totalValueBRL = 0;
      let totalValueChina = 0;
      const updatedItems = [...data.items];

      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        if (item.market_hash_name) {
          setProgress(`Buscando preço ${i + 1}/${data.items.length}: ${item.name.substring(0, 30)}...`);

          const priceData = await fetchPrice(item.market_hash_name);
          const priceBRL = priceData.price * USD_TO_BRL;
          const priceChina = calculateChinaPrice(priceBRL);

          updatedItems[i] = {
            ...item,
            price: priceData.price,
            price_brl: priceBRL,
            price_china: priceChina,
            marketplace: priceData.marketplace,
          };

          totalValueUSD += priceData.price;
          totalValueBRL += priceBRL;
          totalValueChina += priceChina;

          setItems([...updatedItems]);
          setTotal(totalValueUSD);
          setTotalBRL(totalValueBRL);
          setTotalChina(totalValueChina);

          if (i < data.items.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        }
      }

      setProgress('');
      setLoadingPrices(false);

    } catch (err: any) {
      setError(err?.message ?? 'Erro ao buscar inventário');
      setLoading(false);
      setLoadingPrices(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">
          CS2 Inventory Pricer
        </h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cole sua Trade URL da Steam:
            </label>
            <input
              type="text"
              value={tradeUrl}
              onChange={(e) => setTradeUrl(e.target.value)}
              placeholder="https://steamcommunity.com/tradeoffer/new/?partner=XXXXX&token=YYYYY"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4 text-gray-900"
              required
            />
            <button
              type="submit"
              disabled={loading || loadingPrices}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Buscando Inventário...' : loadingPrices ? 'Buscando Preços...' : 'Consultar Preços'}
            </button>
          </form>

          {progress && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-blue-700 text-sm">{progress}</p>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              AVISO DE ITENS OCULTOS
              Aparece quando a Steam reporta mais itens do que retorna
              ═══════════════════════════════════════════════════════════ */}
          {hiddenItems > 0 && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-300 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-semibold text-amber-800">
                    {hiddenItems} {hiddenItems === 1 ? 'item não pôde ser carregado' : 'itens não puderam ser carregados'}
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    A Steam reportou <strong>{totalInventoryCount} itens</strong> no inventário, 
                    mas só retornou <strong>{totalInventoryCount - hiddenItems}</strong>. 
                    Os {hiddenItems} itens restantes podem ser:
                  </p>
                  <ul className="text-sm text-amber-700 mt-2 list-disc list-inside space-y-1">
                    <li><strong>Faca padrão (Default Knife)</strong> — a Steam não lista via API</li>
                    <li><strong>Itens equipados no loadout</strong> — podem ficar ocultos</li>
                    <li><strong>Itens em Storage Unit</strong> — não aparecem na API pública</li>
                    <li><strong>Itens com trade/market lock</strong> — podem ser omitidos</li>
                  </ul>
                  <p className="text-sm text-amber-800 mt-2 font-medium">
                    💡 Peça ao dono do inventário para torná-lo <strong>público</strong> nas 
                    configurações de privacidade da Steam para maximizar os itens visíveis.
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-md">
              <p className="text-red-700">{error}</p>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            {/* Header com totais */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Inventário CS2 ({items.length} itens)
              </h2>

              {/* Resumo de contagem */}
              <p className="text-sm text-gray-500 mb-4">
                📦 {totalInventoryCount} itens no inventário total
                {itemStats.nonMarketable > 0 && ` · 🚫 ${itemStats.nonMarketable} não vendáveis`}
                {hiddenItems > 0 && ` · 👻 ${hiddenItems} ocultos pela Steam`}
                {' · '} ✅ {items.length} precificáveis
              </p>

              {/* Cards de preço */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Steam Market */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-600 font-medium">💰 Steam Market</p>
                  <p className="text-xl font-bold text-blue-700">${total.toFixed(2)} USD</p>
                  <p className="text-sm text-blue-600">R$ {totalBRL.toFixed(2)}</p>
                </div>

                {/* Preço Estimado China */}
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="text-sm text-orange-600 font-medium">🇨🇳 Buff163/Youpin (Est.)</p>
                  <p className="text-xl font-bold text-orange-700">R$ {totalChina.toFixed(2)}</p>
                  <p className="text-sm text-orange-600">~{totalBRL > 0 ? ((totalChina / totalBRL) * 100).toFixed(1) : '0'}% do Steam</p>
                </div>

                {/* Economia */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-600 font-medium">💵 Você Economiza</p>
                  <p className="text-xl font-bold text-green-700">R$ {(totalBRL - totalChina).toFixed(2)}</p>
                  <p className="text-sm text-green-600">-{calculateSavings(totalBRL, totalChina).toFixed(1)}% comprando na China</p>
                </div>
              </div>
            </div>

            {/* Legenda */}
            <div className="bg-gray-100 rounded-lg p-3 mb-4 text-sm text-gray-600">
              <p className="mb-1">⚠️ <strong>Nota:</strong> Preços Buff163/Youpin são <em>estimativas</em> baseadas em 200+ itens analisados.</p>
              <p className="text-xs text-gray-500">
                &gt;R$1000: 75.5% | R$500-1000: 75% | R$200-500: 73.5% | R$50-200: 72% | R$10-50: 70% | &lt;R$10: 68%
              </p>
            </div>

            {/* Lista de itens */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  {item.image && (
                    <div className="relative w-16 h-12 flex-shrink-0">
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.marketplace}
                    </p>
                  </div>

                  {/* Preços lado a lado */}
                  <div className="flex gap-4 flex-shrink-0">
                    {/* Steam */}
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Steam</p>
                      <p className={`font-semibold ${item.price > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                        {item.price > 0 ? `R$ ${item.price_brl?.toFixed(2) || '0.00'}` : loadingPrices ? '...' : 'N/A'}
                      </p>
                    </div>

                    {/* China Estimado */}
                    <div className="text-right">
                      <p className="text-xs text-gray-400">China (Est.)</p>
                      <p className={`font-semibold ${item.price > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                        {item.price > 0 ? `R$ ${item.price_china?.toFixed(2) || '0.00'}` : loadingPrices ? '...' : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Rodapé com totais */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <span className="text-sm text-gray-500">Steam Market</span>
                  <p className="text-lg font-bold text-blue-600">R$ {totalBRL.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">China (Est.)</span>
                  <p className="text-lg font-bold text-orange-600">R$ {totalChina.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Economia</span>
                  <p className="text-lg font-bold text-green-600">R$ {(totalBRL - totalChina).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
