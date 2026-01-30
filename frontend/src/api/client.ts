const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export interface Exchange {
  id: number;
  name: string;
  display_name: string;
  maker_fee: string;
  taker_fee: string;
  is_active: boolean;
  status?: {
    connected: boolean;
    last_message_at: string | null;
    retry_count: number;
  };
}

export interface ArbitrageEvent {
  id: number;
  event_id: string;
  detected_at: string;
  asset: string;
  buy_exchange: number;
  sell_exchange: number;
  buy_exchange_name: string;
  sell_exchange_name: string;
  buy_price: string;
  sell_price: string;
  buy_qty_available: string;
  sell_qty_available: string;
  spread_pct: string;
  spread_absolute: string;
  simulated: boolean;
  simulated_at: string | null;
  trade_amount: string | null;
  gross_profit: string | null;
  total_fees: string | null;
  slippage_cost: string | null;
  latency_cost: string | null;
  net_profit: string | null;
  profitable: boolean | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Stats {
  total_opportunities: number;
  last_24h_count: number;
  simulated_count: number;
  profitable_count: number;
  avg_spread: string | null;
  max_spread: string | null;
  total_simulated_profit: string | null;
}

export interface ExchangeStatus {
  name: string;
  display_name: string;
  connected: boolean;
  last_message_at: string | null;
  retry_count: number;
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  
  return res.json();
}

export async function fetchOpportunities(params?: {
  asset?: string;
  simulated?: boolean;
  ordering?: string;
  limit?: number;
}): Promise<PaginatedResponse<ArbitrageEvent>> {
  const searchParams = new URLSearchParams();
  if (params?.asset) searchParams.set("asset", params.asset);
  if (params?.simulated !== undefined) searchParams.set("simulated", String(params.simulated));
  if (params?.ordering) searchParams.set("ordering", params.ordering);
  if (params?.limit !== undefined) searchParams.set("page_size", String(params.limit));
  
  const query = searchParams.toString();
  return fetchApi(`/opportunities/${query ? `?${query}` : ""}`);
}

export async function fetchRecentOpportunities(minutes = 5): Promise<ArbitrageEvent[]> {
  return fetchApi(`/opportunities/recent/?minutes=${minutes}`);
}

export async function fetchStats(): Promise<Stats> {
  return fetchApi("/opportunities/stats/");
}

export async function fetchExchangeStatus(): Promise<ExchangeStatus[]> {
  return fetchApi("/exchanges/status/");
}

export async function simulateTrade(
  id: number,
  params?: { amount?: number; latency_ms?: number }
): Promise<ArbitrageEvent & { simulation_details: Record<string, string> }> {
  return fetchApi(`/opportunities/${id}/simulate/`, {
    method: "POST",
    body: JSON.stringify(params || {}),
  });
}

export interface BatchSimulateItem {
  id: number;
  amount: number;
  latency_ms?: number;
}

export interface BatchSimulateResponse {
  results: ArbitrageEvent[];
  errors: { id: number; error: string }[];
  simulated_count: number;
}

export async function simulateBatch(items: BatchSimulateItem[]): Promise<BatchSimulateResponse> {
  return fetchApi("/opportunities/simulate_batch/", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export interface PollResponse {
  opportunities: ArbitrageEvent[];
  latest_id: number;
  count: number;
}

export interface PollOptions {
  sinceId?: number;
  limit?: number;
  includeSimulated?: boolean;
}

export async function pollOpportunities(options: PollOptions = {}): Promise<PollResponse> {
  const params = new URLSearchParams();
  if (options.sinceId !== undefined) params.set('since_id', String(options.sinceId));
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.includeSimulated) params.set('include_simulated', 'true');
  
  return fetchApi(`/opportunities/poll/?${params.toString()}`);
}

export function createOpportunityStream(
  sinceId: number,
  onData: (data: { opportunities: ArbitrageEvent[]; latest_id: number }) => void,
  onError?: (error: Event) => void
): EventSource {
  const url = `${API_BASE}/opportunities/stream/?since_id=${sinceId}`;
  const eventSource = new EventSource(url);
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onData(data);
    } catch (e) {
      console.error("Failed to parse SSE data:", e);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error("SSE error:", error);
    onError?.(error);
  };
  
  return eventSource;
}

export function getExportUrl(params?: { asset?: string; simulated?: boolean }): string {
  const searchParams = new URLSearchParams();
  if (params?.asset) searchParams.set("asset", params.asset);
  if (params?.simulated !== undefined) searchParams.set("simulated", String(params.simulated));
  
  const query = searchParams.toString();
  return `${API_BASE}/opportunities/export/${query ? `?${query}` : ""}`;
}
