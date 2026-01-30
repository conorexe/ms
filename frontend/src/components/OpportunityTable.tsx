import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArbitrageEvent, simulateTrade } from "../api/client";

interface Props {
  opportunities: ArbitrageEvent[];
  showSimulate?: boolean;
  compact?: boolean;
  hideProfit?: boolean;
  onRowClick?: (opportunity: ArbitrageEvent) => void;
}

export default function OpportunityTable({ 
  opportunities, 
  showSimulate = true, 
  compact = false,
  hideProfit = false,
  onRowClick,
}: Props) {
  const queryClient = useQueryClient();

  const simulate = useMutation({
    mutationFn: (id: number) => simulateTrade(id, { amount: 1, latency_ms: 100 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (num >= 1000) return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    return `$${num.toFixed(4)}`;
  };

  const getSpreadClass = (spread: string) => {
    const s = parseFloat(spread);
    if (s >= 0.3) return "spread-high";
    if (s >= 0.15) return "spread-med";
    return "spread-low";
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (opportunities.length === 0) {
    return (
      <div className="empty-state">
        <p>No opportunities detected yet</p>
        <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
          Waiting for arbitrage opportunities from connected exchanges...
        </p>
      </div>
    );
  }

  const showProfit = !compact && !hideProfit;

  return (
    <div className="table-container">
      <table className={`opp-table ${onRowClick ? 'clickable' : ''}`}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Asset</th>
            <th>Buy From</th>
            <th>Sell To</th>
            {!compact && <th>Buy Price</th>}
            {!compact && <th>Sell Price</th>}
            <th>Spread</th>
            {showProfit && <th>Est. Profit</th>}
            {showSimulate && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {opportunities.map((opp) => (
            <tr 
              key={opp.id} 
              className={`${opp.simulated ? "row-simulated" : ""} ${onRowClick ? "clickable-row" : ""}`}
              onClick={() => onRowClick?.(opp)}
            >
              <td className="mono">{formatTime(opp.detected_at)}</td>
              <td>
                <span className="asset-badge">{opp.asset}</span>
              </td>
              <td>
                <span className="exchange-badge">{opp.buy_exchange_name}</span>
              </td>
              <td>
                <span className="exchange-badge">{opp.sell_exchange_name}</span>
              </td>
              {!compact && <td className="mono">{formatPrice(opp.buy_price)}</td>}
              {!compact && <td className="mono">{formatPrice(opp.sell_price)}</td>}
              <td className={`mono ${getSpreadClass(opp.spread_pct)}`}>
                {parseFloat(opp.spread_pct).toFixed(3)}%
              </td>
              {showProfit && (
                <td className="mono">
                  {opp.net_profit ? (
                    <span className={parseFloat(opp.net_profit) >= 0 ? "profit-positive" : "profit-negative"}>
                      ${parseFloat(opp.net_profit).toFixed(4)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              )}
              {showSimulate && (
                <td>
                  {!opp.simulated ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        simulate.mutate(opp.id);
                      }}
                      disabled={simulate.isPending}
                    >
                      Simulate
                    </button>
                  ) : (
                    <span className="simulated-badge">Done</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
