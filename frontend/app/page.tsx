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

  const getSanitizedBase = () => {
    let base = process.env.NEXT_PUBLIC_API_BASE || "https://my-algo-trading-system.onrender.com";
    base = base.trim();
    if (base.endsWith('/')) {
      base = base.slice(0, -1);
    }
    if (base.endsWith('/api')) {
      base = base.slice(0, -4);
    }
    return base;
  };

  const BASE_HOST = getSanitizedBase(); 
  const API_BASE = `${BASE_HOST}/api`;

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

      const wsUrl = BASE_HOST.replace("https://", "wss://").replace("http://", "ws://") + "/ws/alerts";
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
          console.error("WS Telemetry connection fault", e);
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
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      });
      if (res.ok) setIsLoggedIn(true);
      else setAuthError("Security Authentication Rejected.");
    } catch (err) {
      setAuthError("Quant System Core Unreachable!");
    }
  };

  const fetchSystemSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
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
      const res = await fetch(`${API_BASE}/watchlist`);
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
      const res = await fetch(`${API_BASE}/calls/history`);
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
      const res = await fetch(`${API_BASE}/watchlist/add`, {
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
      const res = await fetch(`${API_BASE}/watchlist/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      const data = await res.json();
      if (res.ok) {
        setWatchlist(data.watchlist);
        pushAlert(`${symbol} cleared from monitoring stack.`, 'success');
      }
    } catch (e) { pushAlert("Failed to clean tracking target.", 'error'); }
  };

  const triggerFyersAuthAuthChannel = async () => {
    if (!clientId || !secretKey) return pushAlert("Developer configuration array empty!", "error");
    try {
      const res = await fetch(`${API_BASE}/fyers/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId.trim(), secret_key: secretKey.trim(), redirect_url: redirectUrl })
      });
      const data = await res.json();
      if (res.ok && data.auth_url) {
        window.open(data.auth_url, '_blank');
        pushAlert("Fyers authorization bridge triggered. Check popup.", "success");
      } else {
        pushAlert(data.detail || "Link compilation engine broken.", "error");
      }
    } catch { pushAlert("Security authorization handshake failure.", "error"); }
  };

  const processAppCodeRegistrationToken = async () => {
    if (!manualAuthCode.trim()) return pushAlert("Authentication String core empty", "error");
    try {
      const res = await fetch(`${API_BASE}/fyers/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_code: manualAuthCode.trim(), client_id: clientId.trim(), secret_key: secretKey.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setFyersConnected(true);
        setManualAuthCode('');
        pushAlert("Fyers execution channel validation passed successfully!", "success");
      } else {
        pushAlert(data.detail || "Handshake rejected.", "error");
      }
    } catch { pushAlert("Network logic engine timeout.", "error"); }
  };

  const handleUpdateExecutionSettings = async (selectedOrderPlacement: string, selectedTimeframe: string) => {
    try {
      const res = await fetch(`${API_BASE}/settings/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_placement: selectedOrderPlacement, timeframe: selectedTimeframe })
      });
      if (res.ok) {
        setOrderPlacement(selectedOrderPlacement);
        setTimeframe(selectedTimeframe);
        pushAlert(`System runtime reconfigured [Mode: ${selectedOrderPlacement} | Frame: ${selectedTimeframe}]`, 'success');
      }
    } catch { pushAlert("Config push failure.", "error"); }
  };

  const toggleAutoScanPipeline = async () => {
    const targets = autoScanStatus === 'ON' ? 'OFF' : 'ON';
    try {
      const res = await fetch(`${API_BASE}/settings/autoscan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_scan: targets })
      });
      if (res.ok) {
        setAutoScanStatus(targets);
        pushAlert(`Deep Strategy Engine: ${targets}`, 'success');
      }
    } catch { pushAlert("Pipeline controller lock dropped.", "error"); }
  };

  const executeStrategyBacktestSandbox = async () => {
    setBacktestResult(null);
    try {
      const res = await fetch(`${API_BASE}/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: btSymbol, strategy: btStrategy, duration_months: btDuration, timeframe: btTimeframe })
      });
      if (res.ok) {
        const data = await res.json();
        setBacktestResult(data);
        pushAlert("Sandbox backtest computation matrix fully resolved.", "success");
      } else {
        pushAlert("Matrix processing engine validation error.", "error");
      }
    } catch { pushAlert("Backtest deployment target unresolvable.", "error"); }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-sans antialiased text-gray-200 p-4 selection:bg-cyan-500/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08)_0,transparent_65%)]" />
        <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 p-8 rounded-2xl relative shadow-2xl backdrop-blur-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">⚡ APEX QUANT SYSTEM</h1>
            <p className="text-xs text-zinc-500 mt-1 uppercase tracking-widest">Enterprise Terminal Verification Gateway</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-400 font-bold mb-1.5">System Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 font-mono" placeholder="admin" required />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-400 font-bold mb-1.5">System Security Token</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 font-mono" placeholder="••••••••" required />
            </div>
            {authError && <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 p-2.5 rounded-lg font-medium">{authError}</p>}
            <button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-black font-bold py-2.5 rounded-lg text-sm tracking-wide transition-all shadow-lg shadow-emerald-950/20">Initialize Control Shell</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans antialiased flex flex-col selection:bg-cyan-500/20">
      <header className="border-b border-zinc-800 bg-zinc-950/70 backdrop-blur px-6 py-4 sticky top-0 z-40 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">⚡ APEX QUANT <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700 font-mono uppercase tracking-normal">Enterprise v3.1</span></h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={toggleAutoScanPipeline} className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${autoScanStatus === 'ON' ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800' : 'bg-zinc-900 text-zinc-400 border-zinc-800'}`}>
            STRATEGY SCANNER: {autoScanStatus}
          </button>
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs font-mono">
            <button onClick={() => handleUpdateExecutionSettings('OFF', timeframe)} className={`px-2.5 py-1 rounded-md transition-all font-bold ${orderPlacement === 'OFF' ? 'bg-zinc-800 text-amber-400 border border-zinc-700 shadow-sm' : 'text-zinc-500'}`}>LOG ENTRY ONLY</button>
            <button onClick={() => handleUpdateExecutionSettings('ON', timeframe)} className={`px-2.5 py-1 rounded-md transition-all font-bold ${orderPlacement === 'ON' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-950/30' : 'text-zinc-500'}`}>AUTO TRADING ACTIVE</button>
          </div>
          <select value={timeframe} onChange={(e) => handleUpdateExecutionSettings(orderPlacement, e.target.value)} className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500">
            <option value="1m">1 Minute</option>
            <option value="5m">5 Minutes</option>
            <option value="15m">15 Minutes</option>
            <option value="1h">1 Hour</option>
          </select>
          <button onClick={() => setShowAlertModal(true)} className="relative p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-all">
            🔔 {alertLogs.length > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-[10px] text-white font-black rounded-full flex items-center justify-center animate-bounce">{alertLogs.length}</span>}
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 xl:grid-cols-4 p-6 gap-6 max-w-[1600px] w-full mx-auto">
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-xl space-y-4">
            <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-wider flex justify-between items-center font-mono">
              Broker Configuration Link
              <span className={`h-2 w-2 rounded-full ${fyersConnected ? 'bg-emerald-400' : 'bg-red-500'}`} />
            </h3>

            {!isConfigSaved ? (
              <form onSubmit={saveDeveloperConfig} className="space-y-3">
                <input type="text" placeholder="Fyers Client ID" value={clientId} onChange={e => setClientId(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-xs font-mono rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-cyan-500" required />
                <input type="password" placeholder="Fyers Secret Key" value={secretKey} onChange={e => setSecretKey(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-xs font-mono rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-cyan-500" required />
                <button type="submit" className="w-full bg-zinc-800 hover:bg-zinc-700 text-xs font-mono font-bold py-2 rounded-lg transition-all">Save Vault Access Keys</button>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800 text-xs font-mono text-zinc-400 space-y-1">
                  <p>Client ID: <span className="text-zinc-200">{clientId.substring(0,6)}...</span></p>
                  <p>Redirect: <span className="text-zinc-500 break-all text-[10px]">{redirectUrl}</span></p>
                </div>
                {!fyersConnected ? (
                  <div className="space-y-2">
                    <button onClick={triggerFyersAuthAuthChannel} className="w-full bg-cyan-600 hover:bg-cyan-500 text-black text-xs font-mono font-bold py-2 rounded-lg transition-all">1. Extract Access Code</button>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Paste return Auth Code" value={manualAuthCode} onChange={e => setManualAuthCode(e.target.value)} className="flex-1 bg-zinc-900 border border-zinc-800 text-xs font-mono rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-emerald-500" />
                      <button onClick={processAppCodeRegistrationToken} className="bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-mono font-bold px-3 py-2 rounded-lg transition-all">2. Verify</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-950/20 border border-emerald-800/60 rounded-lg text-center">
                    <span className="text-xs text-emerald-400 font-mono font-bold">✓ Fyers Core Engine Fully Hooked</span>
                  </div>
                )}
                <button onClick={() => setIsConfigSaved(false)} className="w-full text-zinc-500 hover:text-zinc-400 text-[10px] font-mono text-right block transition-all">Modify API Secret Arrays</button>
              </div>
            )}
          </div>

          <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-xl space-y-4">
            <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-wider font-mono">Dynamic Portfolio Monitor</h3>
            <form onSubmit={addSymbolToWatchlist} className="flex gap-2">
              <input type="text" placeholder="e.g. NSE:NIFTY26JUL22000CE" value={newSymbol} onChange={e => setNewSymbol(e.target.value)} className="flex-1 bg-zinc-900 border border-zinc-800 text-xs font-mono rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-cyan-500 uppercase" />
              <button type="submit" className="bg-zinc-800 hover:bg-zinc-700 text-xs font-mono px-3 py-2 rounded-lg font-bold transition-all">+</button>
            </form>

            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {watchlist.length === 0 ? (
                <p className="text-xs font-mono text-zinc-600 text-center py-4">Watchlist stream is empty.</p>
              ) : (
                watchlist.map((symbol) => {
                  const data = livePrices[symbol] || { price: 0.00, change: 0, direction: 'neutral' };
                  return (
                    <div key={symbol} className="flex items-center justify-between p-3 bg-zinc-900/40 rounded-lg border border-zinc-800/80 hover:border-zinc-700 transition-all">
                      <div className="max-w-[65%]">
                        <p className="text-xs font-bold font-mono truncate text-zinc-200">{symbol.split(':')[1] || symbol}</p>
                        <p className="text-[10px] font-mono text-zinc-500 truncate">{symbol.split(':')[0]}</p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className={`text-xs font-mono font-bold transition-all ${data.direction === 'up' ? 'text-emerald-400' : data.direction === 'down' ? 'text-red-400' : 'text-zinc-300'}`}>
                            ₹{data.price.toFixed(2)}
                          </p>
                          <p className={`text-[9px] font-mono ${(data.change ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {(data.change ?? 0) >= 0 ? '+' : ''}{(data.change ?? 0).toFixed(2)}%
                          </p>
                        </div>
                        <button onClick={() => removeSymbolFromWatchlist(symbol)} className="text-zinc-600 hover:text-red-400 text-xs transition-all font-mono">×</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-3 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col overflow-hidden">
          <div className="border-b border-zinc-800 bg-zinc-900/40 p-2 flex gap-2">
            <button onClick={() => setActiveTab('live-logs')} className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${activeTab === 'live-logs' ? 'bg-zinc-800 text-white border border-zinc-700 shadow-inner' : 'text-zinc-400 hover:text-zinc-200'}`}>
              Execution Log Pipeline
            </button>
            <button onClick={() => setActiveTab('backtest-sandbox')} className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${activeTab === 'backtest-sandbox' ? 'bg-zinc-800 text-white border border-zinc-700 shadow-inner' : 'text-zinc-400 hover:text-zinc-200'}`}>
              Deep Strategy Sandbox (Backtest)
            </button>
          </div>

          <div className="p-6 flex-1 overflow-y-auto">
            {activeTab === 'live-logs' ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xs font-mono uppercase tracking-wider font-bold text-zinc-400">Live Telemetry Pipeline Engine</h2>
                  <span className="text-[10px] font-mono text-zinc-500">Auto Refreshing Live Stack via WebSocket</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="bg-zinc-900 text-zinc-400 uppercase tracking-wider font-bold text-[10px] border-b border-zinc-800">
                        <th className="p-3.5">Timestamp</th>
                        <th className="p-3.5">Trading Target</th>
                        <th className="p-3.5">Matched Rule</th>
                        <th className="p-3.5">Frame</th>
                        <th className="p-3.5">Action Block</th>
                        <th className="p-3.5">Base LTP</th>
                        <th className="p-3.5">Absolute Net PnL</th>
                        <th className="p-3.5">System Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/60 bg-black/20">
                      {callHistory.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-zinc-600 font-mono">No telemetry logic cycles executed in current container session yet.</td>
                        </tr>
                      ) : (
                        callHistory.map((log) => (
                          <tr key={log.id} className="hover:bg-zinc-900/30 transition-colors">
                            <td className="p-3.5 text-zinc-500 whitespace-nowrap">{log.timestamp}</td>
                            <td className="p-3.5 font-bold text-zinc-200">{log.symbol}</td>
                            <td className="p-3.5"><span className="px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-400 border border-cyan-900/60 text-[11px]">{log.strategy}</span></td>
                            <td className="p-3.5 text-zinc-400">{log.timeframe || '5m'}</td>
                            <td className="p-3.5">
                              <span className={`font-black uppercase text-[11px] ${log.type === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                                {log.type}
                              </span>
                            </td>
                            <td className="p-3.5 text-zinc-300 font-bold">₹{log.entry_price.toFixed(2)}</td>
                            <td className={`p-3.5 font-bold ${log.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {log.pnl >= 0 ? '+' : ''}₹{log.pnl.toLocaleString('en-IN')}
                            </td>
                            <td className="p-3.5">
                              <span className={`inline-flex items-center gap-1.5 font-bold uppercase text-[10px] ${log.status === 'SUCCESS' ? 'text-emerald-400' : log.status === 'PENDING' ? 'text-amber-400' : 'text-red-500'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${log.status === 'SUCCESS' ? 'bg-emerald-400' : log.status === 'PENDING' ? 'bg-amber-400' : 'bg-red-500'}`} />
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xs font-mono uppercase tracking-wider font-bold text-zinc-400 mb-1">Deep Strategy Backtest Compute Unit</h2>
                  <p className="text-xs text-zinc-500">Run parallel offline historical simulation on options/equities arrays.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-5 bg-zinc-900/30 rounded-xl border border-zinc-800">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 font-mono">Target Asset Token</label>
                    <input type="text" value={btSymbol} onChange={e => setBtSymbol(e.target.value)} className="w-full bg-black border border-zinc-800 text-xs font-mono text-zinc-200 px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500 uppercase" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 font-mono">Strategy Logic Module</label>
                    <select value={btStrategy} onChange={e => setBtStrategy(e.target.value)} className="w-full bg-black border border-zinc-800 text-xs font-mono text-zinc-200 px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500">
                      <option value="EMA_Crossover_9_21">EMA Crossover (9/21)</option>
                      <option value="RSI_Oversold_30">RSI Oversold Filter (30)</option>
                      <option value="Supertrend_Buy">Supertrend Wave Rider (7,3)</option>
                      <option value="MACD_Bullish_Cross">MACD Bullish Cross Engine</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 font-mono">Evaluation Window</label>
                    <select value={btDuration} onChange={e => setBtDuration(Number(e.target.value))} className="w-full bg-black border border-zinc-800 text-xs font-mono text-zinc-200 px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500">
                      <option value={1}>1 Month Window</option>
                      <option value={2}>2 Months Window</option>
                      <option value={3}>3 Months Window</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 font-mono">Resolution Frame</label>
                    <select value={btTimeframe} onChange={e => setBtTimeframe(e.target.value)} className="w-full bg-black border border-zinc-800 text-xs font-mono text-zinc-200 px-3 py-2 rounded-lg focus:outline-none focus:border-cyan-500">
                      <option value="1m">1 Minute Matrix</option>
                      <option value="5m">5 Minutes Matrix</option>
                      <option value="15m">15 Minutes Matrix</option>
                    </select>
                  </div>
                  <div className="md:col-span-4 pt-2">
                    <button onClick={executeStrategyBacktestSandbox} className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-black font-black font-mono text-xs py-2.5 rounded-lg tracking-wide transition-all shadow-lg shadow-cyan-950/20">Compile & Execute Sandbox Run Matrix</button>
                  </div>
                </div>

                {backtestResult && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/80 font-mono text-xs">
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase mb-0.5">Timeline Checked</p>
                        <p className="text-sm font-bold text-cyan-400">{backtestResult.duration_tested || `${btDuration} Month(s)`}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase mb-0.5">Initial Capital</p>
                        <p className="text-sm font-bold text-zinc-300">₹{backtestResult.initial_balance.toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase mb-0.5">Completed Cycles</p>
                        <p className="text-sm font-bold text-purple-400">{backtestResult.total_trades}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase mb-0.5">Win Efficiency</p>
                        <p className="text-sm font-bold text-amber-400">{backtestResult.win_rate}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase mb-0.5">Net Generated Yield</p>
                        <p className={`text-sm font-bold ${backtestResult.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {backtestResult.net_profit >= 0 ? '+' : ''}₹{backtestResult.net_profit.toLocaleString('en-IN')}
                        </p>
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
        </div>
      </main>

      {showAlertModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col max-h-[80vh] shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/20">
              <h3 className="text-xs uppercase font-bold tracking-wider text-zinc-400 font-mono">System Signal & Error Runtime Log Buffer</h3>
              <button onClick={() => setShowAlertModal(false)} className="text-zinc-500 hover:text-white text-sm font-mono font-bold transition-colors">×</button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2 flex-1 bg-black/40">
              {alertLogs.length === 0 ? (
                <p className="text-xs font-mono text-zinc-600 text-center py-8">Buffer registry is entirely empty.</p>
              ) : (
                alertLogs.map((log) => (
                  <div key={log.id} className={`p-3 rounded-lg border text-xs font-mono transition-all ${log.type === 'error' ? 'bg-red-950/20 text-red-400 border-red-900/60' : log.type === 'signal' ? 'bg-cyan-950/30 text-cyan-400 border-cyan-800/60 animate-pulse' : 'bg-zinc-900/60 text-emerald-400 border-zinc-800'}`}>
                    <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                      <span>{log.type.toUpperCase()} CAPTURE LOG</span>
                      <span>{new Date(log.id).toLocaleTimeString()}</span>
                    </div>
                    <p className="font-medium text-zinc-200">{log.text}</p>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-zinc-800 bg-zinc-900/30 flex justify-end">
              <button onClick={() => { setAlertLogs([]); setShowAlertModal(false); }} className="text-zinc-500 hover:text-red-400 text-[11px] font-mono transition-all">Clear Event Memory Core</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}