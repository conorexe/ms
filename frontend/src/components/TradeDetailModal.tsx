import { ArbitrageEvent } from "../api/client";

interface Props {
  opportunity: ArbitrageEvent;
  onClose: () => void;
}

export default function TradeDetailModal({ opportunity, onClose }: Props) {
  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (num >= 1000) return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    return `$${num.toFixed(6)}`;
  };

  const formatQty = (qty: string) => {
    const num = parseFloat(qty);
    return num.toFixed(8);
  };

  const formatMoney = (value: string | null) => {
    if (!value) return "—";
    const num = parseFloat(value);
    return `$${num.toFixed(6)}`;
  };

  const formatPercent = (value: string) => {
    return `${parseFloat(value).toFixed(4)}%`;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  // Calculate fee breakdown estimates
  const buyPrice = parseFloat(opportunity.buy_price);
  const sellPrice = parseFloat(opportunity.sell_price);
  const spreadAbsolute = parseFloat(opportunity.spread_absolute);
  const tradeAmount = opportunity.trade_amount ? parseFloat(opportunity.trade_amount) : 1;
  
  // Estimate fees (typical exchange fees)
  const estimatedBuyFee = buyPrice * tradeAmount * 0.001; // 0.1% taker fee
  const estimatedSellFee = sellPrice * tradeAmount * 0.001; // 0.1% taker fee
  const totalEstimatedFees = estimatedBuyFee + estimatedSellFee;
  const grossProfit = spreadAbsolute * tradeAmount;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            <span className="asset-badge large">{opportunity.asset}</span>
            Trade Analysis
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Trade Overview */}
          <section className="detail-section">
            <h3 className="section-title">Trade Overview</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Detected At</span>
                <span className="detail-value mono">{formatTime(opportunity.detected_at)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Event ID</span>
                <span className="detail-value mono" style={{ fontSize: "0.75rem" }}>
                  {opportunity.event_id}
                </span>
              </div>
            </div>
          </section>

          {/* Exchange Details */}
          <section className="detail-section">
            <h3 className="section-title">Exchange Details</h3>
            <div className="exchange-comparison">
              <div className="exchange-side buy">
                <div className="exchange-header">
                  <span className="exchange-badge large">{opportunity.buy_exchange_name}</span>
                  <span className="side-label">BUY</span>
                </div>
                <div className="exchange-stats">
                  <div className="stat-row">
                    <span>Price</span>
                    <span className="mono">{formatPrice(opportunity.buy_price)}</span>
                  </div>
                  <div className="stat-row">
                    <span>Available Qty</span>
                    <span className="mono">{formatQty(opportunity.buy_qty_available)}</span>
                  </div>
                  <div className="stat-row">
                    <span>Est. Taker Fee</span>
                    <span className="mono fee-value">${estimatedBuyFee.toFixed(6)}</span>
                  </div>
                </div>
              </div>

              <div className="exchange-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>

              <div className="exchange-side sell">
                <div className="exchange-header">
                  <span className="exchange-badge large">{opportunity.sell_exchange_name}</span>
                  <span className="side-label">SELL</span>
                </div>
                <div className="exchange-stats">
                  <div className="stat-row">
                    <span>Price</span>
                    <span className="mono">{formatPrice(opportunity.sell_price)}</span>
                  </div>
                  <div className="stat-row">
                    <span>Available Qty</span>
                    <span className="mono">{formatQty(opportunity.sell_qty_available)}</span>
                  </div>
                  <div className="stat-row">
                    <span>Est. Taker Fee</span>
                    <span className="mono fee-value">${estimatedSellFee.toFixed(6)}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Spread Analysis */}
          <section className="detail-section">
            <h3 className="section-title">Spread Analysis</h3>
            <div className="detail-grid cols-3">
              <div className="detail-item highlight">
                <span className="detail-label">Spread %</span>
                <span className="detail-value mono spread-value">
                  {formatPercent(opportunity.spread_pct)}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Spread Absolute</span>
                <span className="detail-value mono">{formatPrice(opportunity.spread_absolute)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Price Diff</span>
                <span className="detail-value mono">
                  {formatPrice(String(sellPrice - buyPrice))}
                </span>
              </div>
            </div>
          </section>

          {/* Liquidity Analysis */}
          <section className="detail-section">
            <h3 className="section-title">Liquidity Analysis</h3>
            <div className="liquidity-bars">
              <div className="liquidity-item">
                <div className="liquidity-header">
                  <span>{opportunity.buy_exchange_name} Buy Side</span>
                  <span className="mono">{formatQty(opportunity.buy_qty_available)}</span>
                </div>
                <div className="liquidity-bar">
                  <div 
                    className="liquidity-fill buy" 
                    style={{ 
                      width: `${Math.min(100, parseFloat(opportunity.buy_qty_available) * 10)}%` 
                    }}
                  />
                </div>
              </div>
              <div className="liquidity-item">
                <div className="liquidity-header">
                  <span>{opportunity.sell_exchange_name} Sell Side</span>
                  <span className="mono">{formatQty(opportunity.sell_qty_available)}</span>
                </div>
                <div className="liquidity-bar">
                  <div 
                    className="liquidity-fill sell" 
                    style={{ 
                      width: `${Math.min(100, parseFloat(opportunity.sell_qty_available) * 10)}%` 
                    }}
                  />
                </div>
              </div>
            </div>
            <p className="liquidity-note">
              Max executable size: <strong className="mono">
                {formatQty(String(Math.min(
                  parseFloat(opportunity.buy_qty_available),
                  parseFloat(opportunity.sell_qty_available)
                )))}
              </strong>
            </p>
          </section>

          {/* Fee Breakdown */}
          <section className="detail-section">
            <h3 className="section-title">Fee Breakdown (Est. for 1 unit)</h3>
            <div className="fee-breakdown">
              <div className="fee-row">
                <span>Buy Exchange Fee (0.1%)</span>
                <span className="mono">${estimatedBuyFee.toFixed(6)}</span>
              </div>
              <div className="fee-row">
                <span>Sell Exchange Fee (0.1%)</span>
                <span className="mono">${estimatedSellFee.toFixed(6)}</span>
              </div>
              <div className="fee-row total">
                <span>Total Fees</span>
                <span className="mono fee-value">${totalEstimatedFees.toFixed(6)}</span>
              </div>
            </div>
          </section>

          {/* Profit Estimation */}
          <section className="detail-section">
            <h3 className="section-title">Profit Estimation (1 unit)</h3>
            <div className="profit-breakdown">
              <div className="profit-row">
                <span>Gross Profit</span>
                <span className="mono profit-positive">${grossProfit.toFixed(6)}</span>
              </div>
              <div className="profit-row">
                <span>Total Fees</span>
                <span className="mono fee-value">-${totalEstimatedFees.toFixed(6)}</span>
              </div>
              <div className="profit-row net">
                <span>Net Profit</span>
                <span className={`mono ${grossProfit - totalEstimatedFees >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                  ${(grossProfit - totalEstimatedFees).toFixed(6)}
                </span>
              </div>
            </div>
          </section>

          {/* Simulation Results (if simulated) */}
          {opportunity.simulated && (
            <section className="detail-section simulated">
              <h3 className="section-title">
                Simulation Results
              </h3>
              <div className="detail-grid cols-2">
                <div className="detail-item">
                  <span className="detail-label">Trade Amount</span>
                  <span className="detail-value mono">{formatQty(opportunity.trade_amount || "0")}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Simulated At</span>
                  <span className="detail-value mono">
                    {opportunity.simulated_at ? formatTime(opportunity.simulated_at) : "—"}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Gross Profit</span>
                  <span className="detail-value mono">{formatMoney(opportunity.gross_profit)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Total Fees</span>
                  <span className="detail-value mono fee-value">{formatMoney(opportunity.total_fees)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Slippage Cost</span>
                  <span className="detail-value mono">{formatMoney(opportunity.slippage_cost)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Latency Cost</span>
                  <span className="detail-value mono">{formatMoney(opportunity.latency_cost)}</span>
                </div>
              </div>
              <div className="net-profit-display">
                <span className="net-label">Net Profit</span>
                <span className={`net-value mono ${opportunity.profitable ? 'profit-positive' : 'profit-negative'}`}>
                  {formatMoney(opportunity.net_profit)}
                </span>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
