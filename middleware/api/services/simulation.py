from decimal import Decimal
from dataclasses import dataclass
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class SimulationParams:
    trade_amount: Decimal = Decimal("1.0")
    latency_ms: int = 100
    slippage_factor: Decimal = Decimal("0.0005")


@dataclass
class SimulationResult:
    gross_profit: Decimal
    buy_fee: Decimal
    sell_fee: Decimal
    slippage_cost: Decimal
    latency_cost: Decimal
    net_profit: Decimal
    profitable: bool


def calculate_slippage(
    price: Decimal,
    trade_amount: Decimal,
    available_qty: Decimal = Decimal("10.0"),
    base_slippage: Decimal = Decimal("0.0005")
) -> Decimal:
    """
    Estimate slippage based on trade size and available liquidity.
    Higher amounts relative to available qty = more slippage.
    """
    if available_qty <= 0:
        available_qty = Decimal("10.0")
    
    size_factor = trade_amount / available_qty
    size_factor = min(size_factor, Decimal("1.0"))
    
    slippage_pct = base_slippage * (Decimal("1.0") + size_factor * Decimal("2.0"))
    return price * slippage_pct * trade_amount


def estimate_latency_cost(
    price: Decimal,
    trade_amount: Decimal,
    volatility_pct: Decimal = Decimal("0.0001"),
    latency_ms: int = 100
) -> Decimal:
    """
    Estimate price movement risk during execution latency.
    Based on typical crypto volatility.
    """
    latency_factor = Decimal(latency_ms) / Decimal("1000.0")
    movement_risk = volatility_pct * latency_factor
    return price * movement_risk * trade_amount


def simulate_trade(
    buy_price: Decimal,
    sell_price: Decimal,
    buy_fee_rate: Decimal,
    sell_fee_rate: Decimal,
    buy_qty_available: Decimal = Decimal("10.0"),
    sell_qty_available: Decimal = Decimal("10.0"),
    params: Optional[SimulationParams] = None
) -> SimulationResult:
    """
    Full trade simulation including fees, slippage, and latency costs.
    """
    if params is None:
        params = SimulationParams()

    amount = params.trade_amount

    # Calculate fees (taker fees for market orders)
    buy_cost = buy_price * amount
    sell_revenue = sell_price * amount
    
    buy_fee = buy_cost * buy_fee_rate
    sell_fee = sell_revenue * sell_fee_rate

    # Calculate slippage
    buy_slippage = calculate_slippage(
        buy_price, amount, buy_qty_available, params.slippage_factor
    )
    sell_slippage = calculate_slippage(
        sell_price, amount, sell_qty_available, params.slippage_factor
    )
    slippage_cost = buy_slippage + sell_slippage

    # Calculate latency risk
    latency_cost = estimate_latency_cost(
        buy_price, amount, latency_ms=params.latency_ms
    )

    # Final calculation
    gross_profit = sell_revenue - buy_cost
    total_costs = buy_fee + sell_fee + slippage_cost + latency_cost
    net_profit = gross_profit - total_costs

    logger.info(
        f"Simulation: gross={gross_profit:.8f}, fees={buy_fee + sell_fee:.8f}, "
        f"slippage={slippage_cost:.8f}, latency={latency_cost:.8f}, net={net_profit:.8f}"
    )

    return SimulationResult(
        gross_profit=gross_profit,
        buy_fee=buy_fee,
        sell_fee=sell_fee,
        slippage_cost=slippage_cost,
        latency_cost=latency_cost,
        net_profit=net_profit,
        profitable=net_profit > 0
    )
