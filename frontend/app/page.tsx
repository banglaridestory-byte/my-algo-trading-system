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
  const [redirectUrl, setRedirectUrl] = useState<string>('https://algo-trading-frontend-app.vercel.app');
  const [isConfigSaved, setIsConfigSaved] = useState<boolean>(false);
  const [manualAuthCode, setManualAuthCode] = useState<string>('');

  const [fyersConnected, setFyersConnected] = useState<boolean>(false);
  const [orderPlacement, setOrderPlacement] = useState<string>('OFF');
  const [autoScan, setAutoScan] = useState<string>('ON');
  const [timeframe, setTimeframe] = useState<string>('5m');

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState<string>('');
  const [livePrices, setLivePrices] = useState<LivePrices>({});
  const [callsHistory, setCallsHistory] = useState<CallLog[]>([]);

  const [btSymbol, setBtSymbol] = useState<string>('NSE:RELIANCE-EQ');
  const [btStrategy, setBtStrategy] = useState<string>('EMA_Crossover_9_21');
  const [btDuration, setBtDuration] = useState<number>(3);
  const [btTimeframe, setBtTimeframe] = useState<string>('5m');
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState<boolean>(false);

  const [alertLogs, setAlertLogs] = useState<{ id: number; text: string; type: 'signal' | 'system' | 'error' }[]>([]);
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState<boolean>(false);

  const BACKEND_URL = 'https://my-algo-trading-system.onrender.com';
  const wsRef = useRef<WebSocket | null>(null);

  const addAlertLog = (text: string, type: 'signal' | 'system' | 'error' = 'system') => {
    setAlertLogs((prev) => [{ id: Date.now(), text, type }, ...prev].slice(0, 100));
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchSettings();
      fetchWatchlist();
      fetchHistory();
      initWebSocket();
    }
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [isLoggedIn]);

  const initWebSocket = () => {
    try {
      const wsUrl = `${BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/ws/alerts`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        addAlertLog('WebSocket core link established streaming data array.', 'system');
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event === 'PRICE_UPDATE') {
            const { symbol, price, change } = payload.data;
            setLivePrices((prev) => {
              const oldPrice = prev[symbol]?.price || 0;
              const direction = price > oldPrice ? 'up' : price < oldPrice ? 'down' : prev[symbol]?.direction || 'neutral';
              return {
                ...prev,
                [symbol]: { price, change, direction },
              };
            });
          } else if (payload.event === 'NEW_CALL') {
            setCallsHistory((prev) => [payload.data, ...prev]);
            addAlertLog(payload.message, 'signal');
            if (Notification.permission === 'granted') {
              new Notification('⚡ ALGO SIGNAL DETECTED', { body: payload.message });
            }
          }
        } catch (e) {
          console.error('WS parsing failure:', e);
        }
      };

      ws.onerror = () => {
        addAlertLog('WebSocket node encountered data integrity frame error.', 'error');
      };

      ws.onclose = () => {
        addAlertLog('WebSocket streaming dropped. Attempting pipeline reload...', 'error');
        setTimeout(() => {
          if (isLoggedIn) initWebSocket();
        }, 5000);
      };
    } catch (err) {
      console.error('WS initialization crash:', err);
    }
  };

  const requestNotificationPermission = () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission();
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings`);
      const data = await res.json();
      setFyersConnected(data.fyers_connected);
      setOrderPlacement(data.order_placement);
      setAutoScan(data.auto_scan || 'ON');
      setTimeframe(data.timeframe || '5m');
    } catch (err) {
      addAlertLog('Failed to synchronize global operational matrices.', 'error');
    }
  };

  const fetchWatchlist = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/watchlist`);
      const data = await res.json();
      setWatchlist(data.watchlist || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/calls/history`);
      const data = await res.json();
      setCallsHistory(data.history || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        setIsLoggedIn(true);
        requestNotificationPermission();
        addAlertLog('Root operator bypass verification matrix validated.', 'system');
      } else {
        setAuthError('Access restricted. Valid verification block required.');
      }
    } catch (err) {
      setAuthError('Authentication controller pipeline cluster unreachable.');
    }
  };

  const handleUpdateSettings = async (newOrder: string, newTf: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_placement: newOrder, timeframe: newTf }),
      });
      if (res.ok) {
        setOrderPlacement(newOrder);
        setTimeframe(newTf);
        addAlertLog(`Terminal execution modified. Orders: ${newOrder} | TF: ${newTf}`, 'system');
      }
    } catch (err) {
      addAlertLog('Failed to commit modified hardware runtime rules.', 'error');
    }
  };

  const toggleAutoScan = async () => {
    const targetStatus = autoScan === 'ON' ? 'OFF' : 'ON';
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings/autoscan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_scan: targetStatus }),
      });
      if (res.ok) {
        setAutoScan(targetStatus);
        addAlertLog(`Heuristic auto scanning telemetry module toggled ${targetStatus}.`, 'system');
      }
    } catch (err) {
      addAlertLog('Scanner control framework did not reply correctly.', 'error');
    }
  };

  const handleAddToWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/watchlist/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: newSymbol.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data.watchlist);
        addAlertLog(`Asset index registry accepted target: ${newSymbol.toUpperCase()}`, 'system');
        setNewSymbol('');
      } else {
        const errData = await res.json();
        addAlertLog(`Pipeline rejected asset: ${errData.detail}`, 'error');
      }
    } catch (err) {
      addAlertLog('Asset inclusion processing error occurred.', 'error');
    }
  };

  const handleRemoveFromWatchlist = async (symbol: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/watchlist/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data.watchlist);
        addAlertLog(`Unsubscribed asset token matrix from pipeline: ${symbol}`, 'system');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 🎯 FIX: Explicitly sending client_id and secret_key for auth URL compilation
  const handleGenerateAuthUrl = async () => {
    if (!clientId || !secretKey) {
      addAlertLog('App configuration fields missing required structures.', 'error');
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/fyers/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId.trim(),
          secret_key: secretKey.trim(),
          redirect_url: redirectUrl.trim()
        }),
      });
      if (res.ok) {
        const data = await res.json();
        window.open(data.auth_url, '_blank');
        setIsConfigSaved(true);
        addAlertLog('Fyers secure verification frame routed out to external viewport.', 'system');
      }
    } catch (err) {
      addAlertLog('Broker handshake architecture fail.', 'error');
    }
  };

  // 🎯 FIX: Passing entire payload block to backend so client_id and secret match session
  const handleSaveToken = async () => {
    if (!manualAuthCode) {
      addAlertLog('Verification code string required.', 'error');
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/fyers/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          auth_code: manualAuthCode.trim(),
          client_id: clientId.trim(),
          secret_key: secretKey.trim()
        }),
      });
      if (res.ok) {
        addAlertLog('Fyers master access registry saved. System live.', 'system');
        setFyersConnected(true);
        setManualAuthCode('');
      } else {
        const errData = await res.json();
        addAlertLog(`Token synchronization denied: ${errData.detail}`, 'error');
      }
    } catch (err) {
      addAlertLog('Token structural deployment fail.', 'error');
    }
  };

  const handleRunBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBacktesting(true);
    setBacktestResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: btSymbol,
          strategy: btStrategy,
          duration_months: btDuration,
          timeframe: btTimeframe,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setBacktestResult(data);
        addAlertLog(`Quant verification compilation ready for ${btSymbol} utilizing ${btStrategy}.`, 'system');
      } else {
        const errData = await res.json();
        addAlertLog(`Compilation dropped: ${errData.detail}`, 'error');
      }
    } catch (err) {
      addAlertLog('Backtest telemetry module framework timed out.', 'error');
    } finally {
      setIsBacktesting(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center font-mono selection:bg-zinc-800 selection:text-white p-4">
        <div className="absolute inset-0 bg-[radial-gradient(#111_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none"></div>
        <div className="w-full max-w-md bg-zinc-950/60 backdrop-blur-md border border-zinc-900 rounded-xl p-8 relative shadow-2xl">
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-3 h-3 bg-cyan-500 rounded-full animate-pulse"></div>
            <h1 className="text-sm font-bold tracking-widest text-zinc-400">APEX QUANT SECURITY</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-bold">OPERATOR IDENTIFIER</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-900/40 border border-zinc-800/80 rounded-lg px-4 py-3 text-xs focus:outline-none focus:border-zinc-700 transition-colors text-zinc-200"
                placeholder="root_id"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-bold">BYPASS KEYWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900/40 border border-zinc-800/80 rounded-lg px-4 py-3 text-xs focus:outline-none focus:border-zinc-700 transition-colors text-zinc-200"
                placeholder="••••••••"
                required
              />
            </div>
            {authError && <p className="text-[11px] text-red-400 font-mono bg-red-950/10 border border-red-900/40 p-3 rounded-lg">{authError}</p>}
            <button
              type="submit"
              className="w-full bg-zinc-100 hover:bg-white text-black font-bold py-3 px-4 rounded-lg text-xs tracking-wider transition-colors uppercase"
            >
              Initialize Node
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-mono flex flex-col antialiased selection:bg-zinc-800 selection:text-white">
      {/* Top Console Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/40 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></div>
          <h1 className="text-xs font-black tracking-widest text-zinc-200 uppercase">APEX QUANT // ENTERPRISE TERMINAL PRO</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <div className={`px-3 py-1.5 rounded-md border flex items-center space-x-2 ${fyersConnected ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-400' : 'bg-red-950/20 border-red-900/50 text-red-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${fyersConnected ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
            <span className="font-bold tracking-wider">FYERS PIPELINE: {fyersConnected ? 'ONLINE' : 'DISCONNECTED'}</span>
          </div>
          <button
            onClick={() => setIsAlertDrawerOpen(true)}
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 px-3 py-1.5 rounded-md transition-all flex items-center space-x-2 font-bold relative"
          >
            <span>CONSOLE BUFFER</span>
            {alertLogs.length > 0 && (
              <span className="bg-cyan-500 text-black text-[9px] font-extrabold px-1 rounded min-w-[14px] text-center">{alertLogs.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* Main Framework Grid */}
      <main className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 max-w-[1600px] w-full mx-auto">
        
        {/* Left Control Cluster (4 Columns) */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* API Pipeline Hardware Setup */}
          <section className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-5 relative overflow-hidden">
            <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center justify-between">
              <span>BROKER TELEMETRY PROTOCOL</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500">v3 API CORE</span>
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1.5">APP CLIENT ID</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={fyersConnected}
                  className="w-full bg-zinc-900/30 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-zinc-700 transition-colors text-zinc-300 disabled:opacity-50"
                  placeholder="Insert Fyers Client ID"
                />
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1.5">APP SECRET KEY</label>
                <input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  disabled={fyersConnected}
                  className="w-full bg-zinc-900/30 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-zinc-700 transition-colors text-zinc-300 disabled:opacity-50"
                  placeholder="••••••••••••••••"
                />
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1.5">REDIRECT SECURE DEPLOYMENT ENDPOINT</label>
                <input
                  type="text"
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                  disabled={fyersConnected}
                  className="w-full bg-zinc-900/30 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-500 bg-zinc-950/20 disabled:opacity-50"
                  readOnly
                />
              </div>
              
              {!fyersConnected && (
                <div className="pt-2 space-y-3 border-t border-zinc-900">
                  <button
                    onClick={handleGenerateAuthUrl}
                    className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-bold py-2 px-4 border border-zinc-800 rounded-lg text-xs tracking-wider transition-colors uppercase"
                  >
                    Request Secure Handshake URL
                  </button>
                  {isConfigSaved && (
                    <div className="space-y-2 animate-fadeIn">
                      <label className="block text-[9px] text-cyan-400 uppercase font-bold tracking-wider mb-1.5">RETURNED AUTHORIZATION STRING</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={manualAuthCode}
                          onChange={(e) => setManualAuthCode(e.target.value)}
                          className="flex-1 bg-zinc-900/60 border border-cyan-900/60 rounded-lg px-3 py-2 text-xs text-cyan-400 placeholder-cyan-800 focus:outline-none"
                          placeholder="Paste generated token string"
                        />
                        <button
                          onClick={handleSaveToken}
                          className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-4 rounded-lg text-xs uppercase tracking-wider transition-colors"
                        >
                          Mount
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Engine Parameters Console */}
          <section className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-5">
            <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4">CRITICAL EXECUTION POLICIES</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/30 border border-zinc-900">
                <div>
                  <h3 className="text-xs font-bold text-zinc-300">AUTOMATED TELEMETRY SCANNING</h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Continuous signal analysis matrix loop.</p>
                </div>
                <button
                  onClick={toggleAutoScan}
                  className={`px-3 py-1 rounded text-[10px] font-black transition-all border ${autoScan === 'ON' ? 'bg-cyan-950/30 border-cyan-800/80 text-cyan-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                >
                  {autoScan}
                </button>
              </div>

              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-2">INTEGRATED STRATEGY TIMEFRAME</label>
                <div className="grid grid-cols-4 gap-2">
                  {['1m', '5m', '15m', '1d'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => handleUpdateSettings(orderPlacement, tf)}
                      className={`py-1.5 rounded text-xs font-mono border transition-all ${timeframe === tf ? 'bg-zinc-100 border-zinc-100 text-black font-bold' : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:bg-zinc-900'}`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-2">BROKER DEPLOYMENT DISPATCH</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleUpdateSettings('OFF', timeframe)}
                    className={`py-2 rounded text-xs border transition-all font-bold ${orderPlacement === 'OFF' ? 'bg-red-950/20 border-red-900/60 text-red-400' : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-500 hover:bg-zinc-900'}`}
                  >
                    PAPER MODAL
                  </button>
                  <button
                    onClick={() => handleUpdateSettings('ON', timeframe)}
                    className={`py-2 rounded text-xs border transition-all font-bold ${orderPlacement === 'ON' ? 'bg-emerald-950/20 border-emerald-900/60 text-emerald-400' : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-500 hover:bg-zinc-900'}`}
                  >
                    LIVE TRADING
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Center/Right Main Array Grid (8 Columns) */}
        <div className="xl:col-span-8 space-y-6">
          
          {/* Watchlist array & Real-Time ticks */}
          <section className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">REAL-TIME RISK MONITOR PIPELINE</h2>
              <form onSubmit={handleAddToWatchlist} className="flex gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-zinc-700 text-zinc-200 uppercase font-mono tracking-wider placeholder:lowercase w-full sm:w-48"
                  placeholder="e.g. nse:tcs-eq"
                />
                <button
                  type="submit"
                  className="bg-zinc-100 hover:bg-white text-black text-xs font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  ADD ASSET
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {watchlist.length === 0 ? (
                <div className="col-span-full border border-dashed border-zinc-800 rounded-xl py-12 text-center text-xs text-zinc-600">
                  Risk array is dry. Zero data loops mapped.
                </div>
              ) : (
                watchlist.map((symbol) => {
                  const data = livePrices[symbol] || { price: 0, change: 0, direction: 'neutral' };
                  return (
                    <div
                      key={symbol}
                      className={`p-4 rounded-xl border transition-all flex items-center justify-between ${data.direction === 'up' ? 'bg-emerald-950/5 border-emerald-900/30' : data.direction === 'down' ? 'bg-red-950/5 border-red-900/30' : 'bg-zinc-900/20 border-zinc-900'}`}
                    >
                      <div className="space-y-1">
                        <div className="text-xs font-bold tracking-wide text-zinc-200 uppercase">{symbol}</div>
                        <div className={`text-[10px] font-mono ${data.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {data.change >= 0 ? '+' : ''}{data.change?.toFixed(2)}% TODAY
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right font-mono">
                          <span className={`text-sm font-bold tracking-tight ${data.direction === 'up' ? 'text-emerald-400' : data.direction === 'down' ? 'text-red-400' : 'text-zinc-300'}`}>
                            {data.price > 0 ? data.price.toFixed(2) : '0.00'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveFromWatchlist(symbol)}
                          className="text-zinc-600 hover:text-red-400 text-xs font-mono transition-colors p-1"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Quant Engine Signal Calls Feed */}
          <section className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-5">
            <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4">ENGINE SYSTEM HISTORICAL DISPATCHES</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-900 text-[10px] text-zinc-500 uppercase tracking-wider">
                    <th className="pb-3 font-bold">STAMP</th>
                    <th className="pb-3 font-bold">ASSET</th>
                    <th className="pb-3 font-bold">STRATEGY LAYER</th>
                    <th className="pb-3 font-bold">TF</th>
                    <th className="pb-3 font-bold">ACTION</th>
                    <th className="pb-3 font-bold text-right">ENTRY</th>
                    <th className="pb-3 font-bold text-right">TARGET / SL</th>
                    <th className="pb-3 font-bold text-right">DISPATCH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/40">
                  {callsHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-zinc-600 text-xs">
                        System telemetry pipeline waiting for trigger configurations.
                      </td>
                    </tr>
                  ) : (
                    callsHistory.map((call) => (
                      <tr key={call.id} className="hover:bg-zinc-900/20 transition-colors">
                        <td className="py-3.5 text-zinc-500 font-medium">{call.timestamp}</td>
                        <td className="py-3.5 font-bold text-zinc-200 uppercase">{call.symbol}</td>
                        <td className="py-3.5 text-zinc-400">{call.strategy}</td>
                        <td className="py-3.5"><span className="bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-[10px]">{call.timeframe}</span></td>
                        <td className="py-3.5">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${call.type === 'BUY' ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/40' : 'bg-red-950/30 text-red-400 border border-red-900/40'}`}>
                            {call.type}
                          </span>
                        </td>
                        <td className="py-3.5 text-right font-bold text-zinc-300">{call.entry_price.toFixed(2)}</td>
                        <td className="py-3.5 text-right font-mono text-[11px]">
                          <div className="text-emerald-500 font-bold">T: {call.target.toFixed(2)}</div>
                          <div className="text-red-400 font-medium">S: {call.sl.toFixed(2)}</div>
                        </td>
                        <td className="py-3.5 text-right">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${call.status === 'SUCCESS' ? 'bg-emerald-500 text-black' : 'bg-amber-500/10 text-amber-400 border border-amber-900/30'}`}>
                            {call.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Deep Analytics Backtest Layer */}
          <section className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-5">
            <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4">DEEP HEURISTIC BACKTEST VERIFIER</h2>
            <form onSubmit={handleRunBacktest} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end mb-6">
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1.5">TARGET SYMBOL</label>
                <input
                  type="text"
                  value={btSymbol}
                  onChange={(e) => setBtSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono uppercase text-zinc-200"
                  required
                />
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1.5">STRATEGY PATTERN</label>
                <select
                  value={btStrategy}
                  onChange={(e) => setBtStrategy(e.target.value)}
                  className="w-full bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 focus:outline-none"
                >
                  <option value="EMA_Crossover_9_21">EMA Crossover 9/21</option>
                  <option value="RSI_Oversold_30">RSI Oversold 30</option>
                  <option value="Supertrend_Buy">Supertrend Buy (7,3)</option>
                  <option value="MACD_Bullish_Cross">MACD Bullish Cross</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1.5">DURATION & TIMEFRAME</label>
                <div className="flex gap-2">
                  <select
                    value={btDuration}
                    onChange={(e) => setBtDuration(Number(e.target.value))}
                    className="flex-1 bg-zinc-900/40 border border-zinc-800 rounded-lg px-2 py-2 text-xs font-mono text-zinc-300"
                  >
                    <option value={1}>1 Month</option>
                    <option value={3}>3 Months</option>
                    <option value={6}>6 Months</option>
                  </select>
                  <select
                    value={btTimeframe}
                    onChange={(e) => setBtTimeframe(e.target.value)}
                    className="flex-1 bg-zinc-900/40 border border-zinc-800 rounded-lg px-2 py-2 text-xs font-mono text-zinc-300"
                  >
                    <option value="1m">1m</option>
                    <option value="5m">5m</option>
                    <option value="15m">15m</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={isBacktesting}
                className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 text-black font-black py-2 px-4 rounded-lg text-xs tracking-wider transition-all uppercase"
              >
                {isBacktesting ? 'COMPILING...' : 'RUN VERIFICATION'}
              </button>
            </form>

            {backtestResult && (
              <div className="border border-zinc-900 bg-zinc-900/10 rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono animate-fadeIn">
                <div className="space-y-1">
                  <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">WIN/LOSS GENERATED</div>
                  <div className="text-xs font-bold text-zinc-200">
                    <span className="text-emerald-400">{backtestResult.won}W</span> / <span className="text-red-400">{backtestResult.lost}L</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">WIN PROBABILITY RATE</div>
                  <div className="text-xs font-bold text-cyan-400">{backtestResult.win_rate}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">TOTAL TRADES EXECUTED</div>
                  <div className="text-xs font-bold text-zinc-300">{backtestResult.total_trades} Matrix Positions</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">NET SIMULATION YIELD</div>
                  <div className={`text-xs font-black ${backtestResult.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ₹{backtestResult.net_profit.toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Floating System Buffer Drawer */}
      {isAlertDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-zinc-950 border-l border-zinc-900 h-full flex flex-col font-mono shadow-2xl">
            <div className="p-4 border-b border-zinc-900 bg-zinc-900/20 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                <h3 className="text-xs font-black tracking-widest text-zinc-300 uppercase">SYSTEM DIAGNOSTIC STREAM</h3>
              </div>
              <button onClick={() => setIsAlertDrawerOpen(false)} className="text-zinc-500 hover:text-white text-sm font-mono font-bold transition-colors">×</button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2 flex-1 bg-black/40">
              {alertLogs.length === 0 ? (
                <p className="text-xs font-mono text-zinc-600 text-center py-8">Buffer registry is entirely empty.</p>
              ) : (
                alertLogs.map((log) => (
                  <div key={log.id} className={`p-3 rounded-lg border text-xs font-mono transition-all ${log.type === 'error' ? 'bg-red-950/20 text-red-400 border-red-900/60' : log.type === 'signal' ? 'bg-cyan-950/30 text-cyan-400 border-cyan-800/60 animate-pulse' : 'bg-zinc-900/60 text-emerald-400 border-zinc-800'}`}>\n                    <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                      <span>{log.type.toUpperCase()} CAPTURE LOG</span>
                      <span>{new Date(log.id).toLocaleTimeString()}</span>
                    </div>
                    <p className="font-medium text-zinc-200">{log.text}</p>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-zinc-800 bg-zinc-900/30 flex justify-end">
              <button
                onClick={() => setAlertLogs([])}
                className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 text-[10px] font-bold py-1 px-2.5 rounded transition-colors"
              >
                FLUSH RECOGNITIONS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}