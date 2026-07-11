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
        if df['RSI'].iloc[-1] < 30:
            signals["RSI_Oversold_30"] = True

        # 2. Supertrend (7, 3) Buy Signal
        st = ta.supertrend(df['high'], df['low'], df['close'], length=7, multiplier=3)
        if st is not None:
            # SUPERTd_7_3.0 column value: 1 for green/buy, -1 for red/sell
            if st.iloc[-1]['SUPERTd_7_3.0'] == 1 and st.iloc[-2]['SUPERTd_7_3.0'] == -1:
                signals["Supertrend_Buy"] = True

        # 3. EMA Crossover (9 EMA cutting above 21 EMA)
        df['EMA_9'] = ta.ema(df['close'], length=9)
        df['EMA_21'] = ta.ema(df['close'], length=21)
        if df['EMA_9'].iloc[-1] > df['EMA_21'].iloc[-1] and df['EMA_9'].iloc[-2] <= df['EMA_21'].iloc[-2]:
            signals["EMA_Crossover_9_21"] = True

        # 4. MACD Bullish Crossover
        macd = ta.macd(df['close'], fast=12, slow=26, signal=9)
        if macd is not None:
            # MACD_12_26_9 is line, MACDs_12_26_9 is signal line
            if macd.iloc[-1]['MACD_12_26_9'] > macd.iloc[-1]['MACDs_12_26_9'] and macd.iloc[-2]['MACD_12_26_9'] <= macd.iloc[-2]['MACDs_12_26_9']:
                signals["MACD_Bullish_Cross"] = True

    except Exception as e:
        print(f"Strategy Error: {e}")
        
    return signals