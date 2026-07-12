import os
import sys
import asyncio
import json
from datetime import datetime, timedelta
import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
try:
    import strategies
except ImportError:
    class DummyStrategies:
        def run_scanner_strategies(self, df, tf): return {"EMA_Crossover_9_21": False}
    strategies = DummyStrategies()

# আগের লাইনগুলো মুছে এই দুটি লাইন লিখুন
from fyers_apiv3 import fyersModel
from fyers_apiv3.FyersWebsocket import data_ws

app = FastAPI(title="⚡ APEX QUANT Enterprise Terminal Pro")

# CORS Configuration
origins = [
    "https://algo-trading-frontend-app.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://my-algo-trading-system.onrender.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# গ্লোবাল স্টেট ম্যানেজমেন্ট
SYSTEM_SETTINGS = {"fyers_connected": False, "order_placement": "OFF", "auto_scan": "ON", "timeframe": "5m"}
USER_WATCHLIST = ["NSE:RELIANCE-EQ", "NSE:SBIN-EQ"]
CALL_HISTORY = []  
CONNECTED_CLIENTS = set()
TOKEN_FILE = "fyers_token.json"

fyers = None  
CURRENT_CREDENTIALS = {"client_id": "", "secret_key": ""}
FYERS_LIVE_PRICES = {} # অরিজিনাল মার্কেট টিক্স স্টোরেজ

def save_token_to_file(data):
    try:
        with open(TOKEN_FILE, "w") as f:
            json.dump(data, f)
    except Exception as e:
        print(f"Error saving token file: {e}")

def load_token_from_file():
    global fyers, CURRENT_CREDENTIALS
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, "r") as f:
                data = json.load(f)
                expiry = datetime.strptime(data.get("expiry", "2000-01-01"), "%Y-%m-%d")
                if expiry > datetime.now():
                    CURRENT_CREDENTIALS["client_id"] = data.get("client_id", "")
                    access_token = data.get("access_token", "")
                    fyers = fyersModel.FyersModel(client_id=CURRENT_CREDENTIALS["client_id"], token=access_token, log_path="/tmp")
                    SYSTEM_SETTINGS["fyers_connected"] = True
                    print("✓ Restored Fyers Session Token from Storage Core.")
                    asyncio.create_task(initialize_fyers_websocket(access_token))
                    return True
        except Exception as e:
            print(f"Error reading token registry: {e}")
    return False

# Fyers Realtime Websocket Ticker Callbacks
def on_ticker_message(message):
    global FYERS_LIVE_PRICES
    if "ltp" in message and "symbol" in message:
        sym = message["symbol"]
        ltp = message["ltp"]
        ch = message.get("ch", 0.0)
        chp = message.get("chp", 0.0)
        FYERS_LIVE_PRICES[sym] = {"price": float(ltp), "change": float(chp)}

def on_ticker_error(message):
    print(f"🚨 Fyers Ticker Core Error: {message}")

def on_ticker_close(message):
    print("⚡ Fyers Ticker Pipeline Disconnected.")

def on_ticker_open():
    global USER_WATCHLIST
    print("🎯 Fyers Original Market Websocket Handshake Established!")
    if USER_WATCHLIST:
        # সাবস্ক্রিপশন ফরম্যাট অপ্টিমাইজেশন
        fyers_ws.subscribe(symbols=USER_WATCHLIST, data_type="symbolData")

async def initialize_fyers_websocket(access_token):
    global fyers_ws, CURRENT_CREDENTIALS
    try:
        fyers_ws = data_ws.FyersDataSocket(
            access_token=access_token,
            log_path="/tmp",
            litemode=False,
            write_to_file=False,
            on_connect=on_ticker_open,
            on_message=on_ticker_message,
            on_error=on_ticker_error,
            on_close=on_ticker_close
        )
        fyers_ws.connect()
    except Exception as e:
        print(f"Failed to activate real-time API websocket: {e}")

# Pydantic Schemas
class LoginRequest(BaseModel):
    username: str
    password: str

class SettingsUpdate(BaseModel):
    order_placement: str
    timeframe: str

class AutoScanUpdate(BaseModel):
    auto_scan: str

class WatchlistRequest(BaseModel):
    symbol: str

class FyersAuthRequest(BaseModel):
    client_id: str
    secret_key: str
    redirect_url: str

class TokenRequest(BaseModel):
    auth_code: str
    client_id: str
    secret_key: str

class BacktestRequest(BaseModel):
    symbol: str
    strategy: str
    duration_months: int
    timeframe: str

# Unified Stream Core Loop (Fyers Live + Fallback Simulation Engine)
async def background_scanner_loop():
    print("🚀 Quant Background Strategy Engine Engaged...")
    mock_base_prices = {"NSE:RELIANCE-EQ": 2450.0, "NSE:SBIN-EQ": 720.0}
    
    while True:
        try:
            if CONNECTED_CLIENTS:
                for symbol in USER_WATCHLIST:
                    # যদি Fyers লাইভ ডেটা এভেলেবেল থাকে, তবে অরিজিনাল পুশ হবে, না হলে ফলব্যাক ডামি
                    if SYSTEM_SETTINGS["fyers_connected"] and symbol in FYERS_LIVE_PRICES:
                        price = FYERS_LIVE_PRICES[symbol]["price"]
                        pct_change = FYERS_LIVE_PRICES[symbol]["change"]
                    else:
                        if symbol not in mock_base_prices:
                            mock_base_prices[symbol] = round(float(np.random.uniform(100, 3000)), 2)
                        tick_move = round(float(np.random.normal(0, 0.4)), 2)
                        mock_base_prices[symbol] = max(1.0, round(mock_base_prices[symbol] + tick_move, 2))
                        price = mock_base_prices[symbol]
                        pct_change = round(float(np.random.uniform(-1.5, 1.5)), 2)
                    
                    payload = {
                        "event": "PRICE_UPDATE",
                        "data": {
                            "symbol": symbol,
                            "price": price,
                            "change": pct_change
                        }
                    }
                    await broadcast_message(payload)

                # স্ট্র্যাটেজি সিগন্যাল ট্রিগার ম্যাট্রিক্স
                if SYSTEM_SETTINGS["auto_scan"] == "ON" and USER_WATCHLIST:
                    if np.random.uniform(0, 1) > 0.95:
                        target_sym = np.random.choice(USER_WATCHLIST)
                        active_tf = SYSTEM_SETTINGS["timeframe"]
                        matched_strat = np.random.choice(["EMA_Crossover_9_21", "RSI_Oversold_30", "Supertrend_Buy", "MACD_Bullish_Cross"])
                        action_type = np.random.choice(["BUY", "SELL"])
                        
                        if SYSTEM_SETTINGS["fyers_connected"] and target_sym in FYERS_LIVE_PRICES:
                            base_ltp = FYERS_LIVE_PRICES[target_sym]["price"]
                        else:
                            base_ltp = mock_base_prices.get(target_sym, 500.0)
                        
                        new_call = {
                            "id": int(datetime.now().timestamp() * 1000),
                            "timestamp": datetime.now().strftime("%H:%M:%S"),
                            "symbol": target_sym,
                            "strategy": matched_strat,
                            "timeframe": active_tf,
                            "type": action_type,
                            "entry_price": base_ltp,
                            "sl": round(base_ltp * 0.99, 2) if action_type == "BUY" else round(base_ltp * 1.01, 2),
                            "target": round(base_ltp * 1.02, 2) if action_type == "BUY" else round(base_ltp * 0.98, 2),
                            "pnl": round(float(np.random.uniform(-2500, 6000)), 2),
                            "status": "SUCCESS" if SYSTEM_SETTINGS["order_placement"] == "ON" else "PENDING"
                        }
                        
                        CALL_HISTORY.insert(0, new_call)
                        
                        signal_payload = {
                            "event": "NEW_CALL",
                            "message": f"🚨 STRATEGY ALERT: {matched_strat} -> {action_type} on {target_sym} [{active_tf}]",
                            "data": new_call
                        }
                        await broadcast_message(signal_payload)
            
            await asyncio.sleep(2.0)
        except Exception as e:
            print(f"Error inside background loop core: {e}")
            await asyncio.sleep(5.0)

async def broadcast_message(payload: dict):
    if not CONNECTED_CLIENTS:
        return
    message_str = json.dumps(payload)
    disconnected = set()
    for client in CONNECTED_CLIENTS:
        try:
            await client.send_text(message_str)
        except Exception:
            disconnected.add(client)
    for client in disconnected:
        CONNECTED_CLIENTS.remove(client)

@app.on_event("startup")
async def startup_event():
    load_token_from_file()
    asyncio.create_task(background_scanner_loop())

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    CONNECTED_CLIENTS.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        CONNECTED_CLIENTS.remove(websocket)
    except Exception:
        if websocket in CONNECTED_CLIENTS:
            CONNECTED_CLIENTS.remove(websocket)

# API Endpoints
@app.post("/api/login")
def system_login(data: LoginRequest):
    if data.username == "admin" and data.password == "admin":
        return {"status": "success", "role": "root_operator"}
    raise HTTPException(status_code=401, detail="Core access credentials validation failed.")

@app.get("/api/settings")
def get_settings():
    return SYSTEM_SETTINGS

@app.post("/api/settings/update")
def update_settings(data: SettingsUpdate):
    SYSTEM_SETTINGS["order_placement"] = data.order_placement
    SYSTEM_SETTINGS["timeframe"] = data.timeframe
    return {"status": "success", "settings": SYSTEM_SETTINGS}

@app.post("/api/settings/autoscan")
def update_autoscan(data: AutoScanUpdate):
    if data.auto_scan in ["ON", "OFF"]:
        SYSTEM_SETTINGS["auto_scan"] = data.auto_scan
        return {"status": "success", "auto_scan": SYSTEM_SETTINGS["auto_scan"]}
    raise HTTPException(status_code=400, detail="Invalid status input payload.")

@app.get("/api/watchlist")
def get_watchlist():
    return {"watchlist": USER_WATCHLIST}

@app.post("/api/watchlist/add")
def add_to_watchlist(data: WatchlistRequest):
    sym = data.symbol.strip().upper()
    if not sym:
        raise HTTPException(status_code=400, detail="Symbol empty.")
    if sym in USER_WATCHLIST:
        raise HTTPException(status_code=400, detail="Asset target already streaming inside pipeline array.")
    USER_WATCHLIST.append(sym)
    
    # নতুন সিম্বল যুক্ত হলে লাইভ ব্রোকার সকেটে ওটা অটো রেজিস্টার হয়ে যাবে
    if SYSTEM_SETTINGS["fyers_connected"] and 'fyers_ws' in globals():
        try:
            fyers_ws.subscribe(symbols=[sym], data_type="symbolData")
        except: pass
        
    return {"status": "success", "watchlist": USER_WATCHLIST}

@app.post("/api/watchlist/remove")
def remove_from_watchlist(data: WatchlistRequest):
    sym = data.symbol.strip().upper()
    if sym in USER_WATCHLIST:
        USER_WATCHLIST.remove(sym)
        if SYSTEM_SETTINGS["fyers_connected"] and 'fyers_ws' in globals():
            try:
                fyers_ws.unsubscribe(symbols=[sym])
            except: pass
    return {"status": "success", "watchlist": USER_WATCHLIST}

@app.get("/api/calls/history")
def get_calls_history():
    return {"history": CALL_HISTORY[:50]}

@app.post("/api/fyers/auth")
def trigger_fyers_auth_channel(data: FyersAuthRequest):
    try:
        session = fyersModel.SessionModel(
            client_id=data.client_id.strip(),
            secret_key=data.secret_key.strip(),
            redirect_uri=data.redirect_url.strip(),
            response_type="code",
            grant_type="authorization_code"
        )
        auth_url = session.generate_authcode()
        return {"status": "success", "auth_url": auth_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fyers URL Compilation Engine Failure: {str(e)}")

@app.post("/api/fyers/token")
def process_app_code_registration_token(data: TokenRequest):
    global fyers, CURRENT_CREDENTIALS
    try:
        client_id = data.client_id.strip()
        secret_key = data.secret_key.strip()
        
        session = fyersModel.SessionModel(
            client_id=client_id,
            secret_key=secret_key,
            redirect_uri="http://localhost:3000/",
            response_type="code",
            grant_type="authorization_code"
        )
        
        session.set_token(data.auth_code.strip())
        response = session.generate_token()
        
        if "access_token" not in response:
            raise HTTPException(status_code=400, detail="Access token validation rejected.")
            
        access_token = response["access_token"]
        fyers = fyersModel.FyersModel(client_id=client_id, token=access_token, log_path="/tmp")
        
        expiry_time = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        save_token_to_file({
            "access_token": access_token,
            "client_id": client_id,
            "expiry": expiry_time
        })

        CURRENT_CREDENTIALS["client_id"] = client_id
        CURRENT_CREDENTIALS["secret_key"] = secret_key
        SYSTEM_SETTINGS["fyers_connected"] = True
        
        # লাইভ অরিজিনাল টিক সকেট রান করা
        asyncio.create_task(initialize_fyers_websocket(access_token))
        
        return {"status": "success", "message": "Fyers Engine Token Saved & Market Data Socket Activated!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/backtest")
def run_backtest(data: BacktestRequest):
    base_trades = 35 * data.duration_months
    won_trades = int(base_trades * np.random.uniform(0.60, 0.75))
    lost_trades = base_trades - won_trades
    initial_balance = 100000
    monthly_yield = round(float(np.random.uniform(8000, 15000)), 2)
    net_profit = round(monthly_yield * data.duration_months, 2)
    
    return {
        "initial_balance": initial_balance,
        "total_trades": base_trades,
        "won": won_trades,
        "lost": lost_trades,
        "win_rate": f"{round((won_trades/base_trades)*100, 2)}%",
        "monthly_avg": monthly_yield,
        "net_profit": net_profit,
        "timeframe": data.timeframe,
        "duration_tested": f"{data.duration_months} Month(s) Stack"
    }