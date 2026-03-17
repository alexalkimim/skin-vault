'use client';

import { useState } from 'react';
import Image from 'next/image';

interface InventoryItem {
  name: string;
  image: string;
  price: number;
  price_brl: number;
  currency: string;
  marketplace: string;
  market_hash_name: string;
}

const USD_TO_BRL = 5.25;

export default function Home() {
  const [tradeUrl, setTradeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalBRL, setTotalBRL] = useState(0);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [itemStats, setItemStats] = useState({ total: 0, marketable: 0, nonMarketable: 0 });
  const [hiddenItems, setHiddenItems] = useState(0);
  const [totalInventoryCount, setTotalInventoryCount] = useState(0);

  // NOVO ESTADO: Controla se a lista em formato de texto está visível ou não
  const [showTextList, setShowTextList] = useState(false);

  const fetchPrice = async (marketHashName: string): Promise<{ price: number; marketplace: string }> => {
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
    setHiddenItems(0);
    setTotalInventoryCount(0);
    setShowTextList(false); // Esconde a lista de texto ao buscar novamente
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
        setError('Inventário vazio ou sem itens precificáveis.');
        setLoading(false);
        return;
      }

      setHiddenItems(data.hiddenItemsCount || 0);
      setTotalInventoryCount(data.totalInventoryCount || data.items.length);

      setItemStats({
        total: data.totalItems || data.items.length,
        marketable: data.marketableCount || data.items.length,
        nonMarketable: data.nonMarketableCount || 0,
      });

      const nonMarketableMsg = data.nonMarketableCount > 0
        ? ` (${data.nonMarketableCount} itens padrão/insígnias ignorados)`
        : '';
      setProgress(`Encontrados ${data.items.length} itens precificáveis${nonMarketableMsg}. Carregando preços...`);
      setItems(data.items);
      setLoading(false);
      setLoadingPrices(true);

      let totalValueUSD = 0;
      let totalValueBRL = 0;
      const updatedItems = [...data.items];

      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        if (item.market_hash_name) {
          setProgress(`Buscando preço ${i + 1}/${data.items.length}: ${item.name.substring(0, 30)}...`);

          const priceData = await fetchPrice(item.market_hash_name);
          const priceBRL = priceData.price * USD_TO_BRL;

          updatedItems[i] = {
            ...item,
            price: priceData.price,
            price_brl: priceBRL,
            marketplace: priceData.marketplace,
          };

          totalValueUSD += priceData.price;
          totalValueBRL += priceBRL;

          setItems([...updatedItems]);
          setTotal(totalValueUSD);
          setTotalBRL(totalValueBRL);

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

          {hiddenItems > 0 && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-300 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-semibold text-amber-800">
                    {hiddenItems} {hiddenItems === 1 ? 'item não pôde ser carregado' : 'itens não puderam ser carregados'}
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    A Steam reportou <strong>{totalInventoryCount} itens</strong>, mas só retornou <strong>{totalInventoryCount - hiddenItems}</strong>.
                  </p>
                  <ul className="text-sm text-amber-700 mt-2 list-disc list-inside space-y-1">
                    <li>
                      <strong>Delay de Trade Lock:</strong> Itens que liberaram o Trade Lock hoje podem levar até 3 dias extras para ficarem visíveis na API da Steam.
                    </li>
                    <li><strong>Itens em Unidade de Armazenamento:</strong> Itens guardados em containers não são visíveis.</li>
                    <li><strong>Itens à venda:</strong> Se estiverem no Mercado Steam, não aparecem no inventário.</li>
                  </ul>
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
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Inventário CS2 ({items.length} itens precificados)
              </h2>

              <p className="text-sm text-gray-500 mb-4">
                📦 {totalInventoryCount} itens no inventário total
                {itemStats.nonMarketable > 0 && ` · 🚫 ${itemStats.nonMarketable} ignorados (armas padrão/medalhas)`}
                {hiddenItems > 0 && ` · 👻 ${hiddenItems} ocultos pela Steam`}
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                <p className="text-lg text-blue-800 font-semibold mb-1">Valor aproximado dos seus itens:</p>
                <p className="text-4xl font-bold text-blue-700">R$ {totalBRL.toFixed(2)}</p>
                <p className="text-sm text-blue-600 mt-2">(${total.toFixed(2)} USD)</p>
              </div>
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
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

                  <div className="text-right flex-shrink-0">
                    <p className={`font-semibold text-lg ${item.price > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                      {item.price > 0 ? `R$ ${item.price_brl?.toFixed(2) || '0.00'}` : loadingPrices ? '...' : 'N/A'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Rodapé com o Novo Botão de Listagem em Texto */}
            <div className="mt-6 pt-6 border-t border-gray-200 text-center flex flex-col items-center">
              <span className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Total Geral</span>
              <p className="text-3xl font-bold text-gray-800 mb-4">R$ {totalBRL.toFixed(2)}</p>

              <button
                onClick={() => setShowTextList(!showTextList)}
                className="px-6 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition-colors text-sm font-medium shadow-sm"
              >
                {showTextList ? 'Fechar listagem de itens' : 'Abrir listagem de itens (Texto)'}
              </button>
            </div>

            {/* Listagem de Texto Expandível */}
            {showTextList && (
              <div className="mt-6 p-4 bg-gray-900 text-green-400 border border-gray-700 rounded-lg font-mono text-sm max-h-[400px] overflow-y-auto">
                <div className="mb-3 pb-2 border-b border-gray-700 text-gray-400">
                  <p>Listagem de itens e valores ({items.length} itens):</p>
                </div>
                <div className="space-y-1">
                  {items.map((item, index) => (
                    <div key={index} className="hover:bg-gray-800 px-1 rounded transition-colors duration-150">
                      {item.name} — R$ {item.price_brl?.toFixed(2) || '0.00'}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </main>
  );
}