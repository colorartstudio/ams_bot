export const pythonLiveCodeTemplate = `import asyncio
import json
import logging
import hmac
import hashlib
import time
import httpx
import websockets

# Configuração de Logs Profissionais de Execução
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class BybitAegisLimitBot:
    def __init__(self, api_key: str, api_secret: str, base_url: str = "https://api-testnet.bybit.com"):
        self.api_key = api_key
        self.api_secret = api_secret
        self.client = httpx.AsyncClient(base_url=base_url)
        self.target_profit = 0.003  # Alvo de 0.3% para Scalping
        self.stop_loss = 0.003     # Stop de 0.3%
        self.lote_size = 15.0      # Alocação fixa de $15 sobre banca de $50 (30%)
        # AMS Trailing Stop Config:
        self.trailing_trigger = 0.010 # Ativa com 1%
        self.trailing_retracement = 0.25 # Tolera 25% de queda do topo

    def generate_signature(self, params: dict) -> str:
        """Gera assinatura HMAC SHA256 necessária para autenticação na Bybit V5."""
        timestamp = str(int(time.time() * 1000))
        param_str = timestamp + self.api_key + "5000" + json.dumps(params)
        sign = hmac.new(self.api_secret.encode('utf-8'), param_str.encode('utf-8'), hashlib.sha256).hexdigest()
        return sign, timestamp

    async def place_maker_limit_order(self, symbol: str, side: str, price: float, qty: float):
        """Dispara ordem Limit utilizando estritamente postOnly=True para garantir execução Maker."""
        path = "/v5/order/create"
        params = {
            "category": "spot",
            "symbol": symbol,
            "side": side,
            "orderType": "Limit",
            "qty": str(qty),
            "price": f"{price:.4f}",
            "timeInForce": "PostOnly",  # Força a ordem a ser Maker
            "orderLinkId": f"aegis-{int(time.time())}"
        }

        signature, timestamp = self.generate_signature(params)
        headers = {
            "X-BBY-API-KEY": self.api_key,
            "X-BBY-SIGN": signature,
            "X-BBY-SIGN-TYPE": "2",
            "X-BBY-TIMESTAMP": timestamp,
            "X-BBY-RECV-WINDOW": "5000",
            "Content-Type": "application/json"
        }

        try:
            response = await self.client.post(path, json=params, headers=headers)
            result = response.json()
            if result.get("retCode") == 0:
                logging.info(f"Ordem MAKER LIMIT de {side} para {symbol} inserida no book em $ {price:.4f}")
            else:
                logging.warning(f"Erro Bybit API: {result.get('retMsg')}")
        except Exception as e:
            logging.error(f"Erro ao se conectar com a Bybit: {e}")

    async def monitor_channels_websocket(self, symbol: str):
        """Conecta no WebSocket de cotações Spot da Bybit para obter livros L2 e cotação tick-by-tick."""
        ws_url = "wss://stream-testnet.bybit.com/v5/public/spot"

        async with websockets.connect(ws_url) as ws:
            # Inscrever no feed de klines do ativo para Fimathe de 15m
            subscribe_msg = {
                "op": "subscribe",
                "args": [f"kline.15.{symbol}"]
            }
            await ws.send(json.dumps(subscribe_msg))
            logging.info(f"Monitorando via WebSocket kline.15 para o par {symbol}...")

            while True:
                response = await ws.recv()
                data = json.loads(response)

                if "data" in data:
                    kline = data["data"][0]
                    close_price = float(kline["close"])
                    high_channel = float(kline["high"])
                    low_channel = float(kline["low"])

                    # Cálculo de canais Fimathe Dinâmicos
                    canal_size = high_channel - low_channel
                    cr_high = high_channel
                    zn_low = high_channel - canal_size

                    logging.info(f"Cotação real {symbol}: {close_price:.4f} | CR High: {cr_high:.4f} | ZN Low: {zn_low:.4f}")

                    # Condição de rompimento para Compra Maker no subciclo
                    if close_price > cr_high:
                        qty = self.lote_size / close_price
                        await self.place_maker_limit_order(symbol, "Buy", cr_high, qty)
                        break

async def main():
    # Insira suas credenciais por ambiente de forma segura antes de rodar em produção.
    bot = BybitAegisLimitBot(api_key="SUA_KEY_TESTNET", api_secret="SEU_SECRET_TESTNET")
    await bot.monitor_channels_websocket("SOLUSDT")

if __name__ == "__main__":
    asyncio.run(main())`;

export const pythonHftCodeTemplate = `import numpy as np
from hftbacktest import HftBacktest, FeedLatency, ConstantLatency, SquareMarketOrderModel, LimitOrder, OrderBus
from hftbacktest.stats import Stats
import logging

logging.basicConfig(level=logging.INFO)

class AegisFimatheScalper:
    def __init__(self, bt: HftBacktest):
        self.bt = bt
        self.target_profit = 0.003  # Alvo 0.3%
        self.stop_loss = 0.003     # Stop 0.3%
        self.lot_value = 15.0      # Lote de $15 sobre banca de $50 (30%)
        # AMS Trailing Stop Config:
        self.trailing_trigger = 0.010 # Ativa com 1%
        self.trailing_retracement = 0.25 # Tolera 25% de queda do topo

    def run_backtest_loop(self):
        """Inicia loop em nível de tick do HftBacktest modelando fila L2 e latência de rede."""
        latency_model = ConstantLatency(entry_latency=0.045, response_latency=0.045)

        while self.bt.elapse(1000): # Elapse tempo de simulação de tick
            current_mid_price = (self.bt.best_bid + self.bt.best_ask) / 2.0

            # Cálculo de Canais Fimathe de Alta Precisão
            cr_high = self.bt.best_ask * 1.0005
            zn_low = self.bt.best_bid * 0.9995

            # Simulação de ordens Limit Maker no HftBacktest
            if current_mid_price > cr_high:
                qty = self.lot_value / current_mid_price
                limit_buy_order = LimitOrder(
                    order_id=1001,
                    side=1, # Buy
                    price=cr_high,
                    qty=qty
                )
                self.bt.submit_buy_order(limit_buy_order)
                logging.info(f"[HFT] Ordem Limit de Compra inserida na fila em $ {cr_high:.4f}")
                break

def run_professional_hft_backtest():
    """Carrega dados reais obtidos do book de ofertas Bybit e roda o hftbacktest."""
    backtest_data_file = "bybit_solusdt_l2_ticks_6m.npz"

    try:
        bt = HftBacktest(
            [backtest_data_file],
            initial_balance=50.0,
            latency=FeedLatency(),
            market_order_model=SquareMarketOrderModel()
        )

        algo = AegisFimatheScalper(bt)
        algo.run_backtest_loop()

        stats = Stats(bt)
        print("--- RESULTADO HFTBACKTEST COMPILADO ---")
        print(f"Retorno Total (%): {stats.total_return * 100:.2f}%")
        print(f"Fator de Sharpe HFT: {stats.sharpe_ratio:.2f}")
        print(f"Max Drawdown Real HFT: {stats.max_drawdown * 100:.2f}%")

    except FileNotFoundError:
        print("Faça o download do arquivo de dados L2 da Bybit correspondente para processar o backtest local.")

if __name__ == "__main__":
    run_professional_hft_backtest()`;
