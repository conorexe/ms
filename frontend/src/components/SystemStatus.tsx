import { useQuery } from "@tanstack/react-query";
import { fetchExchangeStatus } from "../api/client";

export default function SystemStatus() {
  const { data: status } = useQuery({
    queryKey: ["exchange-status"],
    queryFn: fetchExchangeStatus,
    refetchInterval: 5000,
  });

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Exchange Status</h3>
      </div>
      <div className="status-list">
        {status?.map((ex) => (
          <div key={ex.name} className="status-item">
            <span
              className={`status-dot ${
                ex.connected ? "connected" : ex.retry_count > 0 ? "connecting" : "disconnected"
              }`}
            />
            <span className="exchange-name">{ex.display_name || ex.name}</span>
          </div>
        ))}
        {!status?.length && (
          <div className="status-item">
            <span className="status-dot disconnected" />
            <span className="exchange-name">No exchanges configured</span>
          </div>
        )}
      </div>
    </div>
  );
}
