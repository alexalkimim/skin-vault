'use client';

import { useState, useMemo } from 'react';
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

  const groupedItems = useMemo(() => {
    const map = new Map<string, InventoryItem & { quantity: number; extPrice: number }>();
    items.forEach(item => {
      if (!map.has(item.name)) {
        map.set(item.name, { ...item, quantity: 1, extPrice: item.price_brl });
      } else {
        const existing = map.get(item.name)!;
        existing.quantity += 1;
        existing.extPrice += item.price_brl;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.extPrice - a.extPrice);
  }, [items]);

  const generateCopyText = () => {
    let text = `Name\tQuantity\tExt. price\tStarting at\tQuick sell\tMid price\tInstant Sell\tYour price\n`;
    groupedItems.forEach(item => {
      // 🚀 Mudança: Usando market_hash_name para copiar o nome com o desgaste
      text += `${item.market_hash_name}\t${item.quantity}\t${item.extPrice.toFixed(2)}\t${item.price_brl.toFixed(2)}\t-\t-\t-\t-\n`;
    });
    text += `\nTotal: ${items.length} item(s) selected worth R$ ${totalBRL.toFixed(2)}`;
    return text;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(''); setItems([]); setTotal(0); setTotalBRL(0);
    setHiddenItems(0); setTotalInventoryCount(0);
    setProgress('A ler o inventário da Steam...');

    try {
      const response = await fetch('/api/get-inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeUrl }),
      });

      const data = await response.json();
      if (!data.success) { setError(data.error || 'Erro ao buscar inventário'); setLoading(false); return; }
      if (data.items.length === 0) { setError('Inventário vazio ou sem itens.'); setLoading(false); return; }

      setHiddenItems(data.hiddenItemsCount || 0);
      setTotalInventoryCount(data.totalInventoryCount || data.items.length);
      setItemStats({ total: data.totalItems, marketable: data.marketableCount, nonMarketable: data.nonMarketableCount });

      setProgress(`A calcular o valor de ${data.items.length} skins instantaneamente...`);
      setLoading(false); setLoadingPrices(true);

      const hashNames = data.items.map((i: any) => i.market_hash_name);
      const priceRes = await fetch('/api/get-price', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_hash_names: hashNames }),
      });

      if (priceRes.ok) {
        const priceData = await priceRes.json();
        const priceMap = new Map();
        priceData.prices.forEach((p: any) => priceMap.set(p.market_hash_name, p));

        let tUsd = 0; let tBrl = 0;
        const updatedItems = data.items.map((item: any) => {
          const pInfo = priceMap.get(item.market_hash_name) || { price: 0, marketplace: 'Sem preço' };
          const pBrl = pInfo.price * USD_TO_BRL;
          tUsd += pInfo.price; tBrl += pBrl;
          return { ...item, price: pInfo.price, price_brl: pBrl, marketplace: pInfo.marketplace };
        });

        setItems(updatedItems); setTotal(tUsd); setTotalBRL(tBrl);
      } else {
        setError('Falha ao comunicar com a base de dados.');
      }

      setProgress(''); setLoadingPrices(false);
    } catch (err: any) {
      setError(err?.message ?? 'Erro na ligação.'); setLoading(false); setLoadingPrices(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">CS2 Inventory Pricer</h1>
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cole a Trade URL ou Link do Perfil da Steam:
            </label>
            <input
              type="text"
              value={tradeUrl}
              onChange={(e) => setTradeUrl(e.target.value)}
              placeholder="https://steamcommunity.com/id/vitorsacz ou Trade URL..."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 mb-4 text-gray-900"
              required
            />
            <button type="submit" disabled={loading || loadingPrices} className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors">
              {loading ? 'A ler Inventário...' : loadingPrices ? 'A gerar Cotação...' : 'Consultar Preços'}
            </button>
          </form>
          {progress && <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md"><p className="text-blue-700 text-sm">{progress}</p></div>}
          {error && <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-md"><p className="text-red-700">{error}</p></div>}
        </div>

        {items.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="mb-6 flex justify-between items-end">
              <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Inventário CS2 ({items.length} itens)</h2>
                <p className="text-sm text-gray-500">Valor Total Bruto: <strong className="text-green-600">R$ {totalBRL.toFixed(2)}</strong></p>
              </div>
            </div>

            {!loadingPrices && (
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-700 mb-2">📋 Copie o texto abaixo para colar no Excel:</label>
                <textarea className="w-full h-48 p-4 text-xs font-mono bg-gray-900 text-green-400 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500" readOnly value={generateCopyText()} onClick={(e) => (e.target as HTMLTextAreaElement).select()} />
              </div>
            )}

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 border-t pt-4">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {item.image && <div className="relative w-16 h-12 flex-shrink-0"><Image src={item.image} alt={item.name} fill className="object-contain" unoptimized /></div>}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.marketplace}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-semibold text-lg ${item.price > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                      {item.price > 0 ? `R$ ${item.price_brl?.toFixed(2)}` : 'R$ 0.00'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}