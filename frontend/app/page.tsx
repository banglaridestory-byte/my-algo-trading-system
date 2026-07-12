'use client';
import React, { useState, useEffect, useRef } from 'react';

interface ScannerResult {
  id: number;
  symbol: string;
  ltp: number;
  strategy_match: string;
  action: string;
}

interface CallLog {
  id: number;
  timestamp: string;
  symbol: string;
  strategy: string;
  type: string;
  entry_price: number;
  pnl: number;
  status: string;
}

interface BacktestResult {
  initial_balance: number;
  total_trades: number;
  win_rate: string;
  net_profit: number;
  duration_tested?: string;
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
  const [scannerData, setScannerData] = useState<ScannerResult[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [autoScanStatus, setAutoScanStatus] = useState<string>('ON');

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState<string>('');
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  const [btSymbol, setBtSymbol] = useState<string>('NSE:RELIANCE-EQ');
  const [btStrategy, setBtStrategy] = useState<string>('EMA_Crossover_9_21');
  const [btDuration, setBtDuration] = useState<number>(1);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

  // ডাইনামিক ক্লাউড/লোকাল API রাউটার (Render URL ডিফল্ট হিসেবে যুক্ত)
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://my-algo-trading-system.onrender.com/api";
  const WS_BASE = API_BASE.replace("https://", "wss://").replace("http://", "ws://");
  
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

      // রিয়েল-টাইম লাইভ সিগন্যাল অ্যালার্ট ও স্ট্যাটাসের জন্য WebSocket কানেকশন
      const ws = new WebSocket(`${WS_BASE}/ws/alerts`);
      ws.onmessage = (event) => {
        const parseData = JSON.parse(event.data);
        if (parseData.event === "NEW_CALL") {
          setNotification(parseData.message);
          if (audioRef.current) audioRef.current.play().catch(() => {});
          setCallHistory(prev => [parseData.data, ...prev]);
          setTimeout(() => setNotification(null), 4000);
        }
      };
      return () => ws.close();
    }
  }, [isLoggedIn]);

  const saveDeveloperConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim() || !secretKey.trim()) {
      alert("Credentials fields cannot be blank!");
      return;
    }
    localStorage.setItem('fyers_client_id', clientId.trim());
    localStorage.setItem('fyers_secret_key', secretKey.trim());
    setIsConfigSaved(true);
    alert("App Credentials Locked in Vault!");
  };

  const clearDeveloperConfig = () => {
    localStorage.removeItem('fyers_client_id');
    localStorage.removeItem('fyers_secret_key');
    setClientId('');
    setSecretKey('');
    setIsConfigSaved(false);
    setFyersConnected(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        setIsLoggedIn(true);
      } else {
        setAuthError(data.detail || "Authentication Rejected.");
      }
    } catch (err) {
      setAuthError("CRITICAL: Quant Core System Unreachable!");
    }
  };

  const fetchSystemSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (res.ok) {
        const data = await res.json();
        setFyersConnected(data.fyers_connected);
        setOrderPlacement(data.order_placement);
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
        setNewSymbol('');
      }
    } catch (err) { alert("Pipeline error"); }
  };

  const removeSymbolFromWatchlist = async (symbol: string) => {
    try {
      const res = await fetch(`${API_BASE}/watchlist/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      const data = await res.json();
      if (res.ok) setWatchlist(data.watchlist);
    } catch (err) { console.error(err); }
  };

  const launchFyersAuthFlow = () => {
    if (!clientId || !secretKey) {
      alert("Configure Vault Credentials first!");
      return;
    }
    const authUrl = `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=code&state=apex_sequence`;
    window.open(authUrl, "_blank");
  };

  const submitAuthCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAuthCode.trim()) return;
    try {
      const targetUrl = `${API_BASE}/fyers-callback?auth_code=${encodeURIComponent(manualAuthCode.trim())}&client_id=${encodeURIComponent(clientId)}&secret_key=${encodeURIComponent(secretKey)}&redirect_url=${encodeURIComponent(redirectUrl)}`;
      const res = await fetch(targetUrl);
      const data = await res.json();
      if (res.ok) {
        setFyersConnected(true);
        setManualAuthCode('');
        alert("✓ Fyers Handshake Stable!");
        fetchSystemSettings();
      } else {
        alert(data.detail || "Handshake Rejected.");
      }
    } catch (err) { alert("Fatal Connection Error."); }
  };

  const toggleOrderSystem = async (status: string) => {
    try {
      const res = await fetch(`${API_BASE}/settings/toggle-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_placement: status })
      });
      if (res.ok) setOrderPlacement(status);
    } catch (e) { console.error(e); }
  };

  const toggleAutoScan = async (status: string) => {
    try {
      const res = await fetch(`${API_BASE}/settings/toggle-autoscan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_scan: status })
      });
      if (res.ok) setAutoScanStatus(status);
    } catch (e) { console.error(e); }
  };

  const triggerOneClickScanner = async () => {
    setIsScanning(true);
    try {
      const res = await fetch(`${API_BASE}/scanner`);
      const data = await res.json();
      if (res.ok) setScannerData(data.results);
    } catch (err) { alert("Scanner telemetry fault."); }
    setIsScanning(false);
  };

  const runStrategyBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: btSymbol, strategy: btStrategy, duration_months: btDuration })
      });
      const data = await res.json();
      if (res.ok) setBacktestResult(data);
    } catch (e) { alert("Backtest engine compute timeout."); }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-white p-4 font-sans">
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-cyan-500"></div>
          <h2 className="text-2xl font-black text-center tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 mb-1">QUANT TRADING PORTAL</h2>
          <p className="text-xs text-gray-500 text-center uppercase tracking-widest mb-6 font-mono">Secured Algorithm Terminal</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 font-mono">Operator ID</label>
              <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" className="w-full p-3 bg-gray-950 border border-gray-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500 text-sm"/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 font-mono">Security Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full p-3 bg-gray-950 border border-gray-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500 text-sm"/>
            </div>
            {authError && <p className="text-red-400 text-xs text-center font-semibold font-mono bg-red-950/30 py-2 border border-red-900/40 rounded-xl">{authError}</p>}
            <button type="submit" className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 font-bold text-gray-950 rounded-xl text-sm uppercase tracking-wider shadow-lg">Establish Session</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans antialiased relative">
      
      {/* 🚨 রিয়েল-টাইম পুশ নোটিফিকেশন ব্যানার */}
      {notification && (
        <div className="fixed top-6 right-6 z-50 max-w-sm bg-gradient-to-r from-emerald-500 to-cyan-500 text-gray-950 p-4 rounded-xl shadow-2xl font-black border border-white flex items-center space-x-3 animate-bounce">
          <span className="text-xl">🔔</span>
          <p className="text-xs font-mono tracking-wide">{notification}</p>
        </div>
      )}

      <header className="border-b border-gray-900 bg-gray-900/40 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">⚡ APEX_QUANT PRO v3.0</span>
          <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${fyersConnected ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/60' : 'bg-red-950/50 text-red-400 border-red-800/60'}`}>
            {fyersConnected ? '● DATALINK LIVE' : '○ DISCONNECTED'}
          </span>
          <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${autoScanStatus === 'ON' ? 'bg-indigo-950 text-indigo-400 border-indigo-800/60' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
            {autoScanStatus === 'ON' ? '⚙️ AUTO BACKGROUND SCANNING' : '📋 MANUAL MODE'}
          </span>
        </div>
        <button onClick={() => setIsLoggedIn(false)} className="px-3 py-1.5 bg-gray-900 border border-gray-800 text-gray-400 text-xs font-semibold rounded-lg font-mono hover:bg-gray-800">LOGOUT</button>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        
        {/* কনফিগারেশন সেকশন */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between lg:col-span-2">
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">🔑 Fyers Developer Vault</h3>
                {isConfigSaved && <span className="text-[10px] bg-blue-950 text-blue-400 border border-blue-800 font-mono px-2 py-0.5 rounded">Credentials Vaulted</span>}
              </div>
              <form onSubmit={saveDeveloperConfig} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-gray-500 uppercase mb-1">App Client ID</label>
                  <input type="text" required disabled={isConfigSaved} value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="e.g. TXXXXXX-100" className="w-full p-2 bg-gray-950 border border-gray-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500"/>
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-gray-500 uppercase mb-1">App Secret Key</label>
                  <input type="password" required disabled={isConfigSaved} value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="••••••••••••" className="w-full p-2 bg-gray-950 border border-gray-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500"/>
                </div>
                {!isConfigSaved ? (
                  <button type="submit" className="md:col-span-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs font-bold hover:bg-gray-700">Lock Config into Memory</button>
                ) : (
                  <button type="button" onClick={clearDeveloperConfig} className="md:col-span-2 py-2 bg-red-950/20 text-red-400 border border-red-900/40 rounded-lg text-xs font-mono hover:bg-red-950/40">Unlock & Clear Credentials</button>
                )}
              </form>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono mb-2">🔌 Secure Authentication</h3>
              <p className="text-[11px] text-gray-500 mb-4">Click below to authorize. Paste the redirected code from URL bar to establish connection.</p>
            </div>
            <div className="space-y-3">
              <button type="button" onClick={launchFyersAuthFlow} disabled={!isConfigSaved || fyersConnected} className="w-full py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs rounded-lg uppercase tracking-wider disabled:opacity-55">
                {fyersConnected ? '✓ Secure Channel Stable' : '🔑 Get Fyers Auth Code'}
              </button>
              <form onSubmit={submitAuthCode} className="flex space-x-1.5">
                <input type="text" required disabled={fyersConnected} value={manualAuthCode} onChange={(e) => setManualAuthCode(e.target.value)} placeholder="Paste Redirected Auth Code..." className="flex-1 p-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"/>
                <button type="submit" disabled={fyersConnected || !manualAuthCode} className="px-3 bg-emerald-500 text-gray-900 font-bold text-xs rounded-lg uppercase font-mono disabled:opacity-50">Link</button>
              </form>
            </div>
          </div>
        </section>

        {/* অটোমেশন কন্ট্রোল ও ওয়াচলিস্ট */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl space-y-4">
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono mb-1">Auto Engine Rules</h3>
              <p className="text-[11px] text-gray-500">Configure core routing and scanning behavior.</p>
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-mono text-gray-400 uppercase">Broker Router:</label>
              <div className="flex bg-gray-950 p-1 rounded-xl border border-gray-800">
                <button onClick={() => toggleOrderSystem('OFF')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold font-mono ${orderPlacement === 'OFF' ? 'bg-amber-500 text-gray-950' : 'text-gray-400'}`}>⚠️ MONITOR ONLY</button>
                <button onClick={() => toggleOrderSystem('ON')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold font-mono ${orderPlacement === 'ON' ? 'bg-emerald-500 text-gray-950' : 'text-gray-400'}`}>🚀 AUTO ROUTE</button>
              </div>
              <label className="block text-[10px] font-mono text-gray-400 uppercase pt-2">Background Scanner Loop:</label>
              <div className="flex bg-gray-950 p-1 rounded-xl border border-gray-800">
                <button onClick={() => toggleAutoScan('OFF')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold font-mono ${autoScanStatus === 'OFF' ? 'bg-red-500 text-white' : 'text-gray-400'}`}>PAUSE SCAN</button>
                <button onClick={() => toggleAutoScan('ON')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold font-mono ${autoScanStatus === 'ON' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>ACTIVE LOOP</button>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl lg:col-span-2 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono mb-1">🎯 Target Watchlist Stream</h3>
              <p className="text-[11px] text-gray-500 mb-3">Add clean asset tags for continuous computing cycle.</p>
            </div>
            <form onSubmit={addSymbolToWatchlist} className="flex space-x-2 mb-4">
              <input type="text" required value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="Exchange:Symbol (e.g. NSE:RELIANCE-EQ)" className="flex-1 p-2.5 bg-gray-950 border border-gray-800 rounded-xl text-xs text-white font-mono focus:outline-none"/>
              <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-gray-950 text-xs font-black uppercase rounded-xl shadow">Lock Asset</button>
            </form>
            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {watchlist.map((sym) => (
                <span key={sym} className="flex items-center space-x-2 bg-gray-900 px-2.5 py-1 rounded-lg text-[11px] border border-gray-800 font-mono text-cyan-400">
                  <span>{sym}</span>
                  <button type="button" onClick={() => removeSymbolFromWatchlist(sym)} className="text-gray-500 hover:text-red-400 font-bold">×</button>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* 📋 রিয়েল-টাইম লাইভ সিগন্যাল ও কল হিস্ট্রি টেবিল (PROFIT/LOSS ট্র্যাকিং সহ) */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-5 border-b border-gray-800 bg-gray-950/40 flex justify-between items-center">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-300">📞 Real-Time Call History Logs</h3>
              <p className="text-[11px] text-gray-500 font-mono">Continuous matrix log. Dynamic calculations updated every 60s without full-page refresh.</p>
            </div>
            <button onClick={fetchCallHistory} className="px-3 py-1 bg-gray-800 border border-gray-700 text-xs font-mono rounded-lg hover:bg-gray-700">↻ Sync Logs</button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-950 text-[10px] font-bold text-gray-400 uppercase border-b border-gray-800 font-mono sticky top-0">
                <tr>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Asset</th>
                  <th className="px-6 py-3">Strategy</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Price</th>
                  <th className="px-6 py-3 text-right">Realized Yield PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/40 font-mono text-xs">
                {callHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-600">No telemetry background signals caught yet... Scanning live market...</td>
                  </tr>
                ) : (
                  callHistory.map((call) => (
                    <tr key={call.id} className="hover:bg-gray-850/30 transition">
                      <td className="px-6 py-4 text-gray-500">{call.timestamp}</td>
                      <td className="px-6 py-4 font-bold text-gray-200">{call.symbol}</td>
                      <td className="px-6 py-4"><span className="px-2 py-0.5 rounded bg-purple-950/50 border border-purple-900/60 text-purple-300 text-[10px]">{call.strategy}</span></td>
                      <td className="px-6 py-4 text-emerald-400 font-bold">{call.type}</td>
                      <td className="px-6 py-4 text-gray-300">₹{call.entry_price}</td>
                      <td className={`px-6 py-4 text-right font-black ${call.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {call.pnl >= 0 ? `+₹${call.pnl}` : `-₹${Math.abs(call.pnl)}`} ({call.status})
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ওয়ান-ক্লিক ম্যানুয়াল স্ক্যানার প্যানেল */}
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-white mb-0.5">One-Click Multi-Strategy Instant Scanner</h3>
            <p className="text-xs text-gray-500 font-mono">Forces immediate query calculation against active Fyers token.</p>
          </div>
          <button onClick={triggerOneClickScanner} disabled={isScanning || watchlist.length === 0 || !fyersConnected} className="px-8 py-3 bg-gradient-to-r from-emerald-400 to-cyan-400 text-gray-950 font-black rounded-xl text-sm uppercase tracking-wider disabled:opacity-40">
            {isScanning ? 'Querying Pipeline...' : '🎯 Force Instant Scan'}
          </button>
        </div>

        {/* ম্যানুয়াল স্ক্যানার রেজাল্ট টেবিল */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-950 text-[10px] font-bold text-gray-400 uppercase border-b border-gray-800">
              <tr>
                <th className="px-6 py-3.5">Asset Identity</th>
                <th className="px-6 py-3.5">LTP (₹)</th>
                <th className="px-6 py-3.5">Triggered Vector Matrix</th>
                <th className="px-6 py-3.5 text-right">Terminal Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/40 font-mono text-xs">
              {scannerData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-gray-600">No snapshot records to load. Execute manual scan or rely on background daemon.</td>
                </tr>
              ) : (
                scannerData.map((row) => (
                  <tr key={row.id}>
                    <td className="px-6 py-4 font-bold text-gray-100">{row.symbol}</td>
                    <td className="px-6 py-4 text-emerald-400">₹{row.ltp.toLocaleString('en-IN')}</td>
                    <td className="px-6 py-4"><span className="text-[11px] px-2.5 py-0.5 rounded-md bg-purple-950/40 border border-purple-800 text-purple-300">{row.strategy_match}</span></td>
                    <td className={`px-6 py-4 text-right font-black ${row.action.includes('EXECUTED') ? 'text-emerald-400' : 'text-gray-500'}`}>{row.action}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 🔬 ব্যাকটেস্ট প্যানেল: ১, ২, ৩ মাসের মাল্টি-টাইমফ্রেম ফিল্টার সহ */}
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl">
          <h3 className="text-xs font-bold uppercase tracking-widest font-mono text-gray-400 mb-4">🔬 Multi-Month Backplane Vector Tester</h3>
          <form onSubmit={runStrategyBacktest} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-6">
            <div>
              <label className="block text-[10px] font-mono font-bold text-gray-500 uppercase mb-1">Target Backtest Node</label>
              <select value={btSymbol} onChange={(e) => setBtSymbol(e.target.value)} className="w-full p-2.5 bg-gray-950 border border-gray-800 rounded-xl text-xs text-gray-300 focus:outline-none font-mono focus:border-emerald-500">
                {watchlist.length === 0 ? <option value="NSE:RELIANCE-EQ">NSE:RELIANCE-EQ (Default)</option> : watchlist.map((sym) => <option key={sym} value={sym}>{sym}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-gray-500 uppercase mb-1">Mathematical Strategy</label>
              <select value={btStrategy} onChange={(e) => setBtStrategy(e.target.value)} className="w-full p-2.5 bg-gray-950 border border-gray-800 rounded-xl text-xs text-gray-300 focus:outline-none focus:border-emerald-500">
                <option value="EMA_Crossover_9_21">EMA Crossover (9-21)</option>
                <option value="RSI_Oversold_30">RSI Oversold (14, 30)</option>
                <option value="Supertrend_Buy">Supertrend Buy (7, 3)</option>
                <option value="MACD_Bullish_Cross">MACD Bullish Cross</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-gray-500 uppercase mb-1">Historical Window</label>
              <select value={btDuration} onChange={(e) => setBtDuration(Number(e.target.value))} className="w-full p-2.5 bg-gray-950 border border-gray-800 rounded-xl text-xs text-gray-300 focus:outline-none focus:border-emerald-500 font-mono">
                <option value={1}>1 Month Data Window</option>
                <option value={2}>2 Months Data Window</option>
                <option value={3}>3 Months Data Window</option>
              </select>
            </div>
            <button type="submit" className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 font-bold rounded-xl text-xs text-white uppercase font-mono shadow-md">⚡ Compute Deep Vector</button>
          </form>

          {backtestResult && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gray-950 rounded-xl border border-gray-800 font-mono text-xs">
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-0.5">Timeline Checked</p>
                <p className="text-sm font-bold text-cyan-400">{backtestResult.duration_tested || `${btDuration} Month(s)`}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-0.5">Initial Capital</p>
                <p className="text-sm font-bold text-gray-300">₹{backtestResult.initial_balance.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-0.5">Completed Cycles</p>
                <p className="text-sm font-bold text-purple-400">{backtestResult.total_trades}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-0.5">Win Efficiency</p>
                <p className="text-sm font-bold text-amber-400">{backtestResult.win_rate}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase mb-0.5">Net Generated Yield</p>
                <p className={`text-sm font-bold ${backtestResult.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>₹{backtestResult.net_profit.toLocaleString('en-IN')}</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}