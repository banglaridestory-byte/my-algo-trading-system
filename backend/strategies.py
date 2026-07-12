import pandas as pd
import pandas_ta as ta

def run_scanner_strategies(df):
    """
    input: pandas DataFrame with ['open', 'high', 'low', 'close', 'volume']
    output: dictionary with strategy signals (True/False)
    """
    signals = {
        "RSI_Oversold_30": False,
        "Supertrend_Buy": False,
        "EMA_Crossover_9_21": False,
        "MACD_Bullish_Cross": False
    }
    
    if len(df) < 30:
        return signals

    try:
        # 1. RSI (14) Oversold Strategy
        df['RSI'] = ta.rsi(df['close'], length=14)
        if not df['RSI'].empty and df['RSI'].iloc[-1] < 30:
            signals["RSI_Oversold_30"] = True

        # 2. Supertrend (7, 3) Buy Signal
        st = ta.supertrend(df['high'], df['low'], df['close'], length=7, multiplier=3)
        if st is not None and not st.empty:
            col = 'SUPERTd_7_3.0'
            if col in st.columns:
                if st[col].iloc[-1] == 1 and (len(st) < 2 or st[col].iloc[-2] == -1):
                    signals["Supertrend_Buy"] = True

        # 3. EMA Crossover (9 EMA cutting above 21 EMA)
        df['EMA_9'] = ta.ema(df['close'], length=9)
        df['EMA_21'] = ta.ema(df['close'], length=21)
        if not df['EMA_9'].empty and not df['EMA_21'].empty:
            if df['EMA_9'].iloc[-1] > df['EMA_21'].iloc[-1] and (len(df) < 2 or df['EMA_9'].iloc[-2] <= df['EMA_21'].iloc[-2]):
                signals["EMA_Crossover_9_21"] = True

        # 4. MACD Bullish Crossover
        macd = ta.macd(df['close'], fast=12, slow=26, signal=9)
        if macd is not None and not macd.empty:
            line = 'MACD_12_26_9'
            signal_line = 'MACDs_12_26_9'
            if line in macd.columns and signal_line in macd.columns:
                if macd[line].iloc[-1] > macd[signal_line].iloc[-1] and (len(macd) < 2 or macd[line].iloc[-2] <= macd[signal_line].iloc[-2]):
                    signals["MACD_Bullish_Cross"] = True

    except Exception as e:
        print(f"Strategy Signal Core Error: {e}")
        
    return signals