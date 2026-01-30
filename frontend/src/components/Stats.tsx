import { useQuery } from "@tanstack/react-query";
import { fetchStats } from "../api/client";

interface Props {
  hideProfitStat?: boolean;
}

export default function Stats({ hideProfitStat = false }: Props) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
    refetchInterval: 3000,
  });

  const statCount = hideProfitStat ? 3 : 4;

  if (isLoading || !stats) {
    return (
      <div className="stats-grid">
        {[...Array(statCount)].map((_, i) => (
          <div key={i} className="stat-card">
            <span className="stat-value">—</span>
            <span className="stat-label">Loading...</span>
          </div>
        ))}
      </div>
    );
  }

  const formatNumber = (n: number | null | undefined) => {
    if (n === null || n === undefined) return "—";
    return n.toLocaleString();
  };

  const formatPercent = (s: string | null) => {
    if (!s) return "—";
    return `${parseFloat(s).toFixed(3)}%`;
  };

  const formatProfit = (s: string | null) => {
    if (!s) return "—";
    const n = parseFloat(s);
    return `$${n.toFixed(2)}`;
  };

  return (
    <div className="stats-grid">
      <div className="stat-card">
        <span className="stat-value">{formatNumber(stats.total_opportunities)}</span>
        <span className="stat-label">Total Opportunities</span>
      </div>
      <div className="stat-card">
        <span className="stat-value">{formatNumber(stats.last_24h_count)}</span>
        <span className="stat-label">Last 24 Hours</span>
      </div>
      <div className="stat-card">
        <span className="stat-value green">{formatPercent(stats.avg_spread)}</span>
        <span className="stat-label">Avg Spread</span>
      </div>
      {!hideProfitStat && (
        <div className="stat-card">
          <span className={`stat-value ${parseFloat(stats.total_simulated_profit || "0") >= 0 ? "green" : "red"}`}>
            {formatProfit(stats.total_simulated_profit)}
          </span>
          <span className="stat-label">Sim. Profit</span>
        </div>
      )}
    </div>
  );
}
