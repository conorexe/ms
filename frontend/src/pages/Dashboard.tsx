import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRecentOpportunities, ArbitrageEvent } from "../api/client";
import Stats from "../components/Stats";
import SystemStatus from "../components/SystemStatus";
import OpportunityTable from "../components/OpportunityTable";
import SpreadChart from "../components/SpreadChart";
import TradeDetailModal from "../components/TradeDetailModal";

export default function Dashboard() {
  const [selectedOpportunity, setSelectedOpportunity] = useState<ArbitrageEvent | null>(null);
  
  const { data: opportunities, isLoading, error } = useQuery({
    queryKey: ["recent-opportunities"],
    queryFn: () => fetchRecentOpportunities(10),
    refetchInterval: 3000,
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Auto-refresh 3s
        </span>
      </div>

      <Stats hideProfitStat />

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Opportunities</h3>
          </div>

          {isLoading && (
            <div className="loading">
              <div className="spinner" />
              Loading opportunities...
            </div>
          )}

          {error && (
            <div className="empty-state">
              <p style={{ color: "var(--accent-red)" }}>
                Error loading data. Is the API running?
              </p>
            </div>
          )}

          {opportunities && (
            <OpportunityTable 
              opportunities={opportunities} 
              showSimulate={false}
              hideProfit
              onRowClick={setSelectedOpportunity}
            />
          )}
        </div>

        <div className="sidebar">
          <SystemStatus />
          {opportunities && <SpreadChart opportunities={opportunities} />}
        </div>
      </div>

      {selectedOpportunity && (
        <TradeDetailModal
          opportunity={selectedOpportunity}
          onClose={() => setSelectedOpportunity(null)}
        />
      )}
    </div>
  );
}
