'use client';

import { useState } from 'react';
import Image from 'next/image';

interface PriceInfo {
  market_hash_name: string;
  priceYoupin: number;
  priceBuff: number;
}

interface InventoryItem {
  name: string;
  market_hash_name: string;
  image: string;
  priceYoupin?: number;
  priceBuff?: number;
}

export default function Home() {
  const [tradeUrl, setTradeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [totalBRL, setTotalBRL] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeUrl) return;
    setLoading(true);
    setItems([]);

    try {
      const invRes = await fetch('/api/get-inventory', {
        method: 'POST',
        body: JSON.stringify({ tradeUrl }),
      });
      const invData = await invRes.json();

      if (!invData.success) {
        alert(invData.error);
        setLoading(false);
        return;
      }

      const hashNames = invData.items.map((i: any) => i.market_hash_name);
      const priceRes = await fetch('/api/get-price', {
        method: 'POST',
        body: JSON.stringify({ market_hash_names: hashNames }),
      });

      const priceData = await priceRes.json();
      const priceMap = new Map<string, PriceInfo>(
        priceData.prices.map((p: PriceInfo) => [p.market_hash_name, p])
      );

      let subtotal = 0;
      const updated = invData.items.map((item: any) => {
        const p = priceMap.get(item.market_hash_name);
        const val = p?.priceYoupin || p?.priceBuff || 0;
        subtotal += val;
        return { ...item, priceYoupin: p?.priceYoupin || 0, priceBuff: p?.priceBuff || 0 };
      });

      setItems(updated.sort((a: any, b: any) => (b.priceYoupin || 0) - (a.priceYoupin || 0)));
      setTotalBRL(subtotal);
    } catch (err) {
      alert("Erro ao conectar com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-black text-gray-900 mb-8 text-center italic">SKIN VAULT <span className="text-blue-600">PRICER</span></h1>
        
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 mb-8 flex gap-3">
          <input
            type="text"
            value={tradeUrl}
            onChange={(e) => setTradeUrl(e.target.value)}
            placeholder="Cole seu Trade Link ou Link da Steam..."
            className="flex-1 px-4 py-3 border rounded-xl outline-none text-gray-800 focus:ring-2 focus:ring-blue-500"
          />
          <button disabled={loading} onClick={handleSubmit} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold transition-all disabled:bg-gray-400">
            {loading ? 'Consultando...' : 'AVALIAR'}
          </button>
        </div>

        {items.length > 0 && (
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
            <div className="flex justify-between items-center mb-6 pb-6 border-b">
              <h2 className="text-xl font-bold text-gray-800 uppercase">Seu Inventário</h2>
              <div className="text-right">
                <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">Total Estimado</p>
                <p className="text-3xl font-black text-green-600">R$ {totalBRL.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid gap-4">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border hover:border-blue-300 transition-all">
                  <div className="relative w-20 h-16 bg-white rounded-lg p-1 flex-shrink-0">
                    <Image src={item.image} alt="" fill className="object-contain" unoptimized />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 leading-tight truncate">{item.name}</p>
                    <p className="text-[10px] text-gray-400 font-mono uppercase truncate">{item.market_hash_name}</p>
                  </div>
                  <div className="flex gap-6 text-right flex-shrink-0">
                    <div>
                      <p className="text-[9px] font-black text-blue-500 uppercase">Youpin</p>
                      <p className="font-bold text-gray-900">{item.priceYoupin ? `R$ ${item.priceYoupin.toFixed(2)}` : '---'}</p>
                    </div>
                    <div className="border-l pl-6">
                      <p className="text-[9px] font-black text-gray-400 uppercase">Buff163</p>
                      <p className="font-bold text-gray-400">{item.priceBuff ? `R$ ${item.priceBuff.toFixed(2)}` : '---'}</p>
                    </div>
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