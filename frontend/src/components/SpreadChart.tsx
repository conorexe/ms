import { ArbitrageEvent } from "../api/client";

interface Props {
  opportunities: ArbitrageEvent[];
}

export default function SpreadChart({ opportunities }: Props) {
  const last30 = opportunities.slice(0, 30).reverse();
  const maxSpread = Math.max(...last30.map((o) => parseFloat(o.spread_pct)), 0.5);

  if (last30.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Spread History</h3>
        </div>
        <div className="empty-state" style={{ padding: "2rem" }}>
          No data yet
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Spread History</h3>
      </div>
      <div className="chart-container">
        {last30.map((opp) => {
          const height = (parseFloat(opp.spread_pct) / maxSpread) * 100;
          return (
            <div
              key={opp.id}
              className="chart-bar"
              style={{ height: `${Math.max(height, 4)}%` }}
              title={`${opp.asset}: ${parseFloat(opp.spread_pct).toFixed(3)}%`}
            />
          );
        })}
      </div>
    </div>
  );
}
