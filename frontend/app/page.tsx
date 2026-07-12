'use client';
import React, { useState, useEffect, useRef } from 'react';

interface CallLog {
  id: number;
  timestamp: string;
  symbol: string;
  strategy: string;
  timeframe: string;
  type: string;
  entry_price: number;
  sl: number;
  target: number;
  pnl: number;
  status: string;
}

interface BacktestResult {
  initial_balance: number;
  total_trades: number;
  won: number;
  lost: number;
  win_rate: string;
  monthly_avg: number;
  net_profit: number;
  timeframe: string;
  duration_tested: string;
}

interface LivePrices {
  [symbol: string]: {
    price: number;
    change?: number;
    direction?: 'up' | 'down' | 'neutral';
  };
}

export default function AlgoTradingApp() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  const [clientId, setClientId] = useState<string>('');
  const [secretKey, setSecretKey] = useState<string>('');
  const [redirectUrl, setRedirectUrl] = useState<string>('');
  const [isConfigSaved, setIsConfigSaved] = useState<boolean>(false);
  const [manualAuthCode, setManualAuthCode] = useState<string>('');

  const [fyersConnected, setFyersConnected] = useState<boolean>(false);
  const [orderPlacement, setOrderPlacement] = useState<string>('OFF');
  const [timeframe, setTimeframe] = useState<string>('5m');
  const [autoScanStatus, setAutoScanStatus] = useState<string>('ON');

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('live-logs');
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  
  const [livePrices, setLivePrices] = useState<LivePrices>({});
  const [alertLogs, setAlertLogs] = useState<{ id: number; text: string; type: 'success' | 'error' | 'signal' }[]>([]);
  const [showAlertModal, setShowAlertModal] = useState<boolean>(false);

  const [btSymbol, setBtSymbol] = useState<string>('NSE:RELIANCE-EQ');
  const [btStrategy, setBtStrategy] = useState<string>('EMA_Crossover_9_21');
  const [btDuration, setBtDuration] = useState<number>(1);
  const [btTimeframe, setBtTimeframe] = useState<string>('5m');
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setRedirectUrl(window.location.origin + '/');
      audioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-500.wav");
      
      const savedId = localStorage.getItem('fyers_client_id');
      const savedSecret = localStorage.getItem('fyers_secret_key');
      if (savedId && savedSecret) {
        setClientId(savedId);
        setSecretKey(savedSecret);
        setIsConfigSaved(true);
      }
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchSystemSettings();
      fetchWatchlist();
      fetchCallHistory();

      const wsUrl = API_BASE.replace("https://", "wss://").replace("http://", "ws://") + "/ws/alerts";
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const parseData = JSON.parse(event.data);
          
          if (parseData.event === "NEW_CALL") {
            pushAlert(parseData.message, 'signal');
            if (audioRef.current) audioRef.current.play().catch(() => {});
            setCallHistory(prev => [parseData.data, ...prev]);
          } else if (parseData.event === "SYSTEM_ERROR") {
            pushAlert(parseData.message, 'error');
          } else if (parseData.event === "PRICE_UPDATE") {
            const { symbol, price, change } = parseData.data;
            setLivePrices(prev => {
              const oldPrice = prev[symbol]?.price || price;
              const direction = price > oldPrice ? 'up' : price < oldPrice ? 'down' : prev[symbol]?.direction || 'neutral';
              return {
                ...prev,
                [symbol]: { price, change, direction }
              };
            });
          }
        } catch (e) {
          console.error("WS Parse error", e);
        }
      };

      return () => ws.close();
    }
  }, [isLoggedIn]);

  const pushAlert = (text: string, type: 'success' | 'error' | 'signal') => {
    setAlertLogs(prev => [{ id: Date.now(), text, type }, ...prev]);
  };

  const saveDeveloperConfig = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('fyers_client_id', clientId.trim());
    localStorage.setItem('fyers_secret_key', secretKey.trim());
    setIsConfigSaved(true);
    pushAlert("Developer credentials saved to vault successfully.", "success");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) setIsLoggedIn(true);
      else setAuthError("Security Authentication Rejected.");
    } catch (err) {
      setAuthError("Quant System Core Unreachable!");
    }
  };

  const fetchSystemSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setFyersConnected(data.fyers_connected);
        setOrderPlacement(data.order_placement);
        setTimeframe(data.timeframe || '5m');
        setAutoScanStatus(data.auto_scan || 'ON');
      }
    } catch (err) { console.error(err); }
  };

  const fetchWatchlist = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/watchlist`);
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data.watchlist || []);
        const initialPrices: LivePrices = {};
        (data.watchlist || []).forEach((sym: string) => {
          initialPrices[sym] = { price: 0.00, change: 0, direction: 'neutral' };
        });
        setLivePrices(initialPrices);
      }
    } catch (err) { console.error(err); }
  };

  const fetchCallHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/calls/history`);
      if (res.ok) {
        const data = await res.json();
        setCallHistory(data.history || []);
      }
    } catch (e) { console.error(e); }
  };

  const addSymbolToWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSymbol = newSymbol.trim().toUpperCase();
    if (!cleanSymbol) return;
    try {
      const res = await fetch(`${API_BASE}/api/watchlist/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: cleanSymbol })
      });
      const data = await res.json();
      if (res.ok) {
        setWatchlist(data.watchlist);
        setLivePrices(prev => ({ ...prev, [cleanSymbol]: { price: 0.00, change: 0, direction: 'neutral' } }));
        setNewSymbol('');
        pushAlert(`${cleanSymbol} locked into pipeline.`, 'success');
      } else {
        pushAlert(data.detail, 'error');
      }
    } catch (err) { pushAlert("Pipeline sync fault.", 'error'); }
  };

  const removeSymbolFromWatchlist = async (symbol: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/watchlist/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      const data = await res.json();
      if (res.ok) {
        setWatchlist(data.watchlist);
        setLivePrices(prev => {
          const updated = { ...prev };
          delete updated[symbol];
          return updated;
        });
        pushAlert(`${symbol} purged from stream.`, 'success');
      }
    } catch (err) { console.error(err); }
  };

  const launchFyersAuthFlow = () => {
    const authUrl = `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=code&state=apex_sequence`;
    window.open(authUrl, "_blank");
  };

  const submitAuthCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const targetUrl = `${API_BASE}/api/fyers-callback?auth_code=${encodeURIComponent(manualAuthCode.trim())}&client_id=${encodeURIComponent(clientId)}&secret_key=${encodeURIComponent(secretKey)}&redirect_url=${encodeURIComponent(redirectUrl)}`;
      const res = await fetch(targetUrl);
      if (res.ok) {
        setFyersConnected(true);
        setManualAuthCode('');
        pushAlert("Fyers Token Handshake Stable!", "success");
        fetchSystemSettings();
      } else {
        pushAlert("Token rejected by Broker.", "error");
      }
    } catch (err) { pushAlert("Fatal connection crash.", "error"); }
  };

  const updateEngineConfig = async (status: string, tf: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/toggle-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_placement: status, timeframe: tf })
      });
      if (res.ok) {
        setOrderPlacement(status);
        setTimeframe(tf);
        pushAlert("Router rules synced with backend.", 'success');
      }
    } catch (e) { console.error(e); }
  };

  const toggleAutoScan = async (status: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/toggle-autoscan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_scan: status })
      });
      if (res.ok) {
        setAutoScanStatus(status);
        pushAlert(`Background loop turned ${status}`, 'success');
      }
    } catch (e) { console.error(e); }
  };

  const runStrategyBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: btSymbol, strategy: btStrategy, duration_months: btDuration, timeframe: btTimeframe })
      });
      const data = await res.json();
      if (res.ok) setBacktestResult(data);
    } catch (e) { pushAlert("Backtest compile compute error.", 'error'); }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-white p-4">
        <div className="w-full max-w-md bg-[#18181b] border border-zinc-800 rounded-xl p-8 shadow-2xl">
          <h2 className="text-xl font-black text-center tracking-wider text-emerald-400 mb-1">APEX_QUANT PRO ACCESS</h2>
          <p className="text-[10px] text-zinc-500 text-center uppercase tracking-widest mb-6">Secured Quant Core Terminal</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Operator ID</label>
              <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" className="w-full p-3 bg-black border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Security Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full p-3 bg-black border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"/>
            </div>
            {authError && <p className="text-red-400 text-xs text-center font-mono bg-red-950/20 py-2 border border-red-900/40 rounded-lg">{authError}</p>}
            <button type="submit" className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 font-bold text-zinc-950 rounded-lg text-xs uppercase tracking-wider transition">Establish Session</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans antialiased">
      {showAlertModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end p-4">
          <div className="w-full max-w-md bg-[#18181b] border border-zinc-800 rounded-xl p-6 shadow-2xl flex flex-col h-full">
            <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-3">
              <h3 className="font-bold text-sm tracking-wider flex items-center gap-2">🔔 NOTIFICATION TERMINAL ({alertLogs.length})</h3>
              <button onClick={() => setShowAlertModal(false)} className="text-zinc-500 hover:text-white text-sm">✕ Close</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {alertLogs.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-10 font-mono">Telemetry clean. No active log events.</p>
              ) : (
                alertLogs.map(log => (
                  <div key={log.id} className={`p-3 rounded-lg border text-xs font-mono ${log.type === 'error' ? 'bg-red-950/20 border-red-900/50 text-red-400' : log.type === 'success' ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-400' : 'bg-blue-950/20 border-blue-900/50 text-cyan-400'}`}>
                    {log.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-zinc-800 bg-[#121214] px-4 py-3 sticky top-0 z-40 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black tracking-wider text-emerald-400">⚡ APEX_QUANT MULTI-STREAM</span>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${fyersConnected ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/60' : 'bg-red-950/40 text-red-400 border-red-900/60'}`}>
            {fyersConnected ? '● DATALINK SECURED' : '○ DISCONNECTED'}
          </span>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <button onClick={() => setShowAlertModal(true)} className="relative p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition">
            <span className="text-base">🔔</span>
            {alertLogs.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-zinc-950 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {alertLogs.length}
              </span>
            )}
          </button>
          <button onClick={() => setIsLoggedIn(false)} className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-semibold rounded-lg hover:text-white font-mono">LOGOUT</button>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-[#18181b] border border-zinc-800 p-5 rounded-xl shadow-xl lg:col-span-2">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest font-mono mb-3">🔑 Fyers Persistent Vault</h3>
            <form onSubmit={saveDeveloperConfig} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase mb-1">App Client ID</label>
                <input type="text" required value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" className="w-full p-2 bg-black border border-zinc-800 rounded text-xs font-mono text-white focus:outline-none focus:border-emerald-500"/>
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase mb-1">App Secret Key</label>
                <input type="password" required value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="Secret Key" className="w-full p-2 bg-black border border-zinc-800 rounded text-xs font-mono text-white focus:outline-none focus:border-emerald-500"/>
              </div>
              <div className="md:col-span-2 flex flex-col sm:flex-row gap-2 pt-2">
                <button type="submit" className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-xs font-bold transition">Lock Config Keys</button>
                <button type="button" onClick={launchFyersAuthFlow} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 font-bold text-xs rounded uppercase tracking-wider text-white transition">Generate Auth Token</button>
              </div>
            </form>
            <form onSubmit={submitAuthCode} className="mt-4 pt-4 border-t border-zinc-800/60 flex gap-2">
              <input type="text" required value={manualAuthCode} onChange={(e) => setManualAuthCode(e.target.value)} placeholder="Paste redirected auth code here..." className="flex-1 p-2 bg-black border border-zinc-800 rounded text-xs text-white focus:outline-none font-mono"/>
              <button type="submit" className="px-4 bg-emerald-500 text-zinc-950 font-bold text-xs rounded font-mono uppercase hover:bg-emerald-600">Link Token</button>
            </form>
          </div>

          <div className="bg-[#18181b] border border-zinc-800 p-5 rounded-xl shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest font-mono mb-2">⚙️ Operational Control Engine</h3>
              <p className="text-[11px] text-zinc-500 mb-3">Core routing, background loops and standard scan window rules.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Timeframe Anchor</label>
                <select value={timeframe} onChange={(e) => updateEngineConfig(orderPlacement, e.target.value)} className="w-full p-2 bg-black border border-zinc-800 rounded text-xs text-zinc-300 font-mono">
                  <option value="1m">1 Minute Chart</option>
                  <option value="5m">5 Minute Chart</option>
                  <option value="15m">15 Minute Chart</option>
                  <option value="1h">1 Hour Chart</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => toggleAutoScan(autoScanStatus === 'ON' ? 'OFF' : 'ON')} className={`py-2 text-[11px] font-mono rounded font-bold transition ${autoScanStatus === 'ON' ? 'bg-purple-950 border border-purple-800 text-purple-300' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'}`}>
                  {autoScanStatus === 'ON' ? '⚙️ AUTO SYNC ON' : 'PAUSED'}
                </button>
                <button onClick={() => updateEngineConfig(orderPlacement === 'ON' ? 'OFF' : 'ON', timeframe)} className={`py-2 text-[11px] font-mono rounded font-bold transition ${orderPlacement === 'ON' ? 'bg-emerald-500 text-zinc-950' : 'bg-amber-600/20 text-amber-400 border border-amber-900/50'}`}>
                  {orderPlacement === 'ON' ? '🚀 AUTO ORDER' : '⚠️ MONITOR ONLY'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#18181b] border border-zinc-800 p-5 rounded-xl shadow-xl">
          <div className="mb-4">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest font-mono">🎯 Live Pipeline Monitoring Watchlist</h3>
            <p className="text-[11px] text-zinc-500">Real-time LTP ticks fetched directly from the broker pipeline.</p>
          </div>
          
          <form onSubmit={addSymbolToWatchlist} className="flex gap-2 mb-5">
            <input type="text" required value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="Exchange:Symbol (e.g., NSE:RELIANCE-EQ)" className="flex-1 p-2 bg-black border border-zinc-800 rounded text-xs text-white font-mono focus:outline-none focus:border-zinc-700"/>
            <button type="submit" className="px-5 py-2 bg-emerald-500 text-zinc-950 text-xs font-black uppercase rounded hover:bg-emerald-600 transition">Add Instrument</button>
          </form>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto pr-1">
            {watchlist.length === 0 ? (
              <div className="col-span-full text-center py-8 text-zinc-600 border border-dashed border-zinc-800 rounded-xl font-mono text-xs">
                Pipeline container empty. Add symbols to start tracking live ticks.
              </div>
            ) : (
              watchlist.map((sym) => {
                const liveData = livePrices[sym] || { price: 0.00, change: 0, direction: 'neutral' };
                let borderStateColor = 'border-zinc-800';
                let priceTextColor = 'text-zinc-300';
                
                if (liveData.direction === 'up') {
                  borderStateColor = 'border-emerald-500/40 bg-emerald-950/10';
                  priceTextColor = 'text-emerald-400';
                } else if (liveData.direction === 'down') {
                  borderStateColor = 'border-red-500/40 bg-red-950/10';
                  priceTextColor = 'text-red-400';
                }

                return (
                  <div key={sym} className={`p-4 bg-black border ${borderStateColor} rounded-xl shadow-lg relative flex flex-col justify-between group transition-all duration-300`}>
                    <button 
                      type="button" 
                      onClick={() => removeSymbolFromWatchlist(sym)} 
                      className="absolute top-2 right-2 text-zinc-600 hover:text-red-400 font-bold text-sm transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      ✕
                    </button>
                    
                    <div className="mb-2">
                      <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">
                        {sym.split(':')[0] || 'TICKER'}
                      </span>
                      <h4 className="text-xs font-bold font-mono tracking-wide text-zinc-200 mt-1.5 break-all">
                        {sym.split(':')[1] || sym}
                      </h4>
                    </div>

                    <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-zinc-900">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase">LTP</span>
                      <div className="text-right">
                        <span className={`text-base font-black font-mono tracking-tight transition-colors duration-200 ${priceTextColor}`}>
                          ₹{liveData.price > 0 ? liveData.price.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : "Calculating..."}
                        </span>
                        {liveData.change !== undefined && liveData.change !== 0 && (
                          <p className={`text-[10px] font-mono font-medium ${liveData.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {liveData.change >= 0 ? `+${liveData.change}%` : `${liveData.change}%`}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="bg-[#18181b] border border-zinc-800 rounded-xl shadow-xl overflow-hidden">
          <div className="flex border-b border-zinc-800 bg-black/40">
            <button onClick={() => setActiveTab('live-logs')} className={`flex-1 sm:flex-none px-6 py-3 text-xs font-bold font-mono tracking-wider transition-all ${activeTab === 'live-logs' ? 'border-b-2 border-emerald-400 bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              📊 SIGNAL HISTORY LOGS
            </button>
            <button onClick={() => setActiveTab('backtest')} className={`flex-1 sm:flex-none px-6 py-3 text-xs font-bold font-mono tracking-wider transition-all ${activeTab === 'backtest' ? 'border-b-2 border-emerald-400 bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              🔬 VECTOR BACKTEST ENGINE
            </button>
          </div>

          <div className="p-4">
            {activeTab === 'live-logs' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-black text-[10px] font-bold text-zinc-400 uppercase border-b border-zinc-800">
                    <tr>
                      <th className="p-3">Time / TF</th>
                      <th className="p-3">Asset Identity</th>
                      <th className="p-3">Strategy</th>
                      <th className="p-3">Entry Matrix</th>
                      <th className="p-3">SL / Target</th>
                      <th className="p-3 text-right">PnL Yield Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {callHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-zinc-600">No background signals tracked yet. Active daemon watching asset pool...</td>
                      </tr>
                    ) : (
                      callHistory.map((call) => (
                        <tr key={call.id} className="hover:bg-zinc-900/40 transition">
                          <td className="p-3 text-zinc-500">{call.timestamp}<br/><span className="text-[10px] text-purple-400">{call.timeframe}</span></td>
                          <td className="p-3 font-bold text-zinc-200">{call.symbol}</td>
                          <td className="p-3"><span className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 rounded text-[10px]">{call.strategy}</span></td>
                          <td className="p-3 text-emerald-400 font-bold">₹{call.entry_price}</td>
                          <td className="p-3 text-zinc-400">SL: <span className="text-red-400">₹{call.sl}</span><br/>Tgt: <span className="text-emerald-400">₹{call.target}</span></td>
                          <td className="p-3 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${call.status === 'TARGET HIT' ? 'bg-emerald-950/60 text-emerald-400' : call.status === 'SL HIT' ? 'bg-red-950/60 text-red-400' : 'bg-zinc-800 text-zinc-400'}`}>
                              {call.status}
                            </span>
                            <div className={`font-bold mt-1 ${call.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {call.pnl >= 0 ? `+₹${call.pnl}` : `-₹${Math.abs(call.pnl)}`}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'backtest' && (
              <div className="space-y-6">
                <form onSubmit={runStrategyBacktest} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end bg-black/40 p-4 rounded-lg border border-zinc-800/80">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase mb-1">Target Node</label>
                    <select value={btSymbol} onChange={(e) => setBtSymbol(e.target.value)} className="w-full p-2 bg-black border border-zinc-800 rounded text-xs text-zinc-300 font-mono">
                      {watchlist.map((sym) => <option key={sym} value={sym}>{sym}</option>)}
                      {watchlist.length === 0 && <option value="NSE:RELIANCE-EQ">NSE:RELIANCE-EQ</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase mb-1">Strategy Matrix</label>
                    <select value={btStrategy} onChange={(e) => setBtStrategy(e.target.value)} className="w-full p-2 bg-black border border-zinc-800 rounded text-xs text-zinc-300 font-mono">
                      <option value="EMA_Crossover_9_21">EMA Crossover (9-21)</option>
                      <option value="RSI_Oversold_30">RSI Oversold (14, 30)</option>
                      <option value="Supertrend_Buy">Supertrend Buy (7, 3)</option>
                      <option value="MACD_Bullish_Cross">MACD Bullish Cross</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase mb-1">Timeframe Select</label>
                    <select value={btTimeframe} onChange={(e) => setBtTimeframe(e.target.value)} className="w-full p-2 bg-black border border-zinc-800 rounded text-xs text-zinc-300 font-mono">
                      <option value="1m">1 min</option>
                      <option value="5m">5 min</option>
                      <option value="15m">15 min</option>
                      <option value="1h">1 hour</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase mb-1">Historical Window</label>
                    <select value={btDuration} onChange={(e) => setBtDuration(Number(e.target.value))} className="w-full p-2 bg-black border border-zinc-800 rounded text-xs text-zinc-300 font-mono">
                      <option value={1}>1 Month Window</option>
                      <option value={2}>2 Months Window</option>
                      <option value={3}>3 Months Window</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-700 font-bold rounded text-xs text-white uppercase font-mono transition">Compute Backplane</button>
                </form>

                {backtestResult && (
                  <div className="space-y-4 font-mono">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-black border border-zinc-800 p-4 rounded-lg">
                        <p className="text-[10px] text-zinc-500 uppercase">Test Config Setup</p>
                        <p className="text-sm font-bold text-cyan-400 mt-1">{backtestResult.duration_tested} ({backtestResult.timeframe})</p>
                      </div>
                      <div className="bg-black border border-zinc-800 p-4 rounded-lg">
                        <p className="text-[10px] text-zinc-500 uppercase">Simulated Base Capital</p>
                        <p className="text-sm font-bold text-zinc-300 mt-1">₹{backtestResult.initial_balance.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="bg-black border border-zinc-800 p-4 rounded-lg">
                        <p className="text-[10px] text-zinc-500 uppercase">Total Completed Cycles</p>
                        <p className="text-sm font-bold text-purple-400 mt-1">{backtestResult.total_trades} Trades</p>
                      </div>
                      <div className="bg-black border border-zinc-800 p-4 rounded-lg">
                        <p className="text-[10px] text-zinc-500 uppercase">Win Efficiency Rate</p>
                        <p className="text-sm font-bold text-amber-400 mt-1">{backtestResult.win_rate}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-900/40 p-4 rounded-lg border border-zinc-800">
                      <div className="flex justify-between items-center border-b md:border-b-0 md:border-r border-zinc-800 pb-2 md:pb-0 md:pr-4">
                        <span className="text-xs text-zinc-400">✅ Won Cycles:</span>
                        <span className="text-sm font-black text-emerald-400">{backtestResult.won} Trades</span>
                      </div>
                      <div className="flex justify-between items-center border-b md:border-b-0 md:border-r border-zinc-800 pb-2 md:pb-0 md:px-4">
                        <span className="text-xs text-zinc-400">❌ Lost Cycles:</span>
                        <span className="text-sm font-black text-red-400">{backtestResult.lost} Trades</span>
                      </div>
                      <div className="flex justify-between items-center md:pl-4">
                        <span className="text-xs text-zinc-400">💰 Net generated Profit:</span>
                        <span className="text-sm font-black text-emerald-400">₹{backtestResult.net_profit.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}