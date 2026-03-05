# Uncommitted Changes — MarketScout

All changes are relative to the last pushed commit:
`ce7da24 — Added poll endpoint and aligned queryset filter to accept simulated params`

---

## 1. `src/middleware/api/serializers.py`

### Change 1a — `ExchangeSerializer.get_status()` key names

**Delete:**
```python
def get_status(self, obj):
    if hasattr(obj, "status") and obj.status is not None:
        return {
            "is_connected": obj.status.is_connected,
            "last_heartbeat": obj.status.last_heartbeat,
            "last_error": obj.status.last_error,
            "reconnect_attempts": obj.status.reconnect_attempts,
            "updated_at": obj.status.updated_at,
        }
    return None
```

**Add:**
```python
def get_status(self, obj):
    if hasattr(obj, "status") and obj.status is not None:
        return {
            "connected": obj.status.is_connected,
            "last_message_at": obj.status.last_heartbeat,
            "last_error": obj.status.last_error,
            "retry_count": getattr(obj.status, "reconnect_attempts", 0),
        }
    return None
```

---

### Change 1b — `ArbitrageEventSerializer` (full replacement)

**Delete** the entire `ArbitrageEventSerializer` class:
```python
class ArbitrageEventSerializer(serializers.ModelSerializer):
    buy_exchange = ExchangeSerializer(read_only=True)
    sell_exchange = ExchangeSerializer(read_only=True)

    spread_pct  = serializers.DecimalField(source="spread", max_digits=12, decimal_places=8, read_only=True)
    simulated   = serializers.BooleanField(source="trade_executed", read_only=True)
    detected_at = serializers.DateTimeField(source="created_at", read_only=True)
    net_profit  = serializers.DecimalField(source="estimated_profit", max_digits=20, decimal_places=10, read_only=True)
    profitable  = serializers.SerializerMethodField()
    gross_profit = serializers.SerializerMethodField()
    total_fees   = serializers.SerializerMethodField()

    class Meta:
        model = ArbitrageEvent
        fields = "__all__"

    def get_profitable(self, obj):
        if obj.estimated_profit is None:
            return None
        return obj.estimated_profit > 0

    def get_gross_profit(self, obj):
        if obj.buy_fee is None or obj.sell_fee is None:
            return None
        return str(obj.estimated_profit + obj.buy_fee + obj.sell_fee +
                   (obj.slippage_cost or 0) + (obj.latency_cost or 0))

    def get_total_fees(self, obj):
        if obj.buy_fee is None and obj.sell_fee is None:
            return None
        return str((obj.buy_fee or 0) + (obj.sell_fee or 0))

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for k, v in list(data.items()):
            if isinstance(v, float):
                data[k] = str(v)
        return data
```

**Add:**
```python
class ArbitrageEventSerializer(serializers.ModelSerializer):
    # Flat exchange name/fee fields (reference-compatible)
    buy_exchange_name = serializers.CharField(source="buy_exchange.name", read_only=True)
    sell_exchange_name = serializers.CharField(source="sell_exchange.name", read_only=True)
    buy_exchange_fee = serializers.DecimalField(
        source="buy_exchange.taker_fee", max_digits=8, decimal_places=6, read_only=True
    )
    sell_exchange_fee = serializers.DecimalField(
        source="sell_exchange.taker_fee", max_digits=8, decimal_places=6, read_only=True
    )

    # Reference-compatible field aliases
    spread_pct = serializers.DecimalField(source="spread", max_digits=12, decimal_places=8, read_only=True)
    simulated = serializers.BooleanField(source="trade_executed", read_only=True)
    detected_at = serializers.DateTimeField(source="created_at", read_only=True)
    net_profit = serializers.DecimalField(source="estimated_profit", max_digits=20, decimal_places=10, read_only=True)

    # Computed fields (not in our DB but present in reference)
    profitable = serializers.SerializerMethodField()
    gross_profit = serializers.SerializerMethodField()
    total_fees = serializers.SerializerMethodField()
    spread_absolute = serializers.SerializerMethodField()
    buy_qty_available = serializers.SerializerMethodField()
    sell_qty_available = serializers.SerializerMethodField()
    simulated_at = serializers.SerializerMethodField()

    class Meta:
        model = ArbitrageEvent
        fields = [
            "id", "event_id", "detected_at", "asset",
            "buy_exchange", "sell_exchange",
            "buy_exchange_name", "sell_exchange_name",
            "buy_exchange_fee", "sell_exchange_fee",
            "buy_price", "sell_price",
            "buy_qty_available", "sell_qty_available",
            "spread_pct", "spread_absolute",
            "simulated", "simulated_at", "trade_amount",
            "gross_profit", "total_fees", "slippage_cost", "latency_cost",
            "net_profit", "profitable",
        ]

    def get_profitable(self, obj):
        if obj.estimated_profit is None:
            return None
        return obj.estimated_profit > 0

    def get_gross_profit(self, obj):
        if obj.buy_fee is None or obj.sell_fee is None:
            return None
        return str(obj.estimated_profit + obj.buy_fee + obj.sell_fee +
                   (obj.slippage_cost or 0) + (obj.latency_cost or 0))

    def get_total_fees(self, obj):
        if obj.buy_fee is None and obj.sell_fee is None:
            return None
        return str((obj.buy_fee or 0) + (obj.sell_fee or 0))

    def get_spread_absolute(self, obj):
        try:
            return str(obj.sell_price - obj.buy_price)
        except Exception:
            return None

    def get_buy_qty_available(self, obj):
        return "0"

    def get_sell_qty_available(self, obj):
        return "0"

    def get_simulated_at(self, obj):
        return None
```

---

### Change 1c — `ArbitrageEventIngestSerializer` — add optional fields

**After** the line `spread_pct = serializers.DecimalField(max_digits=12, decimal_places=8)`, **add:**
```python
    buy_qty = serializers.DecimalField(max_digits=20, decimal_places=8, required=False, default=0)
    sell_qty = serializers.DecimalField(max_digits=20, decimal_places=8, required=False, default=0)
    spread_absolute = serializers.DecimalField(max_digits=20, decimal_places=8, required=False, allow_null=True)
```

---

### Change 1d — `SimulateRequestSerializer.amount` — add default

**Delete:**
```python
    amount = serializers.DecimalField(max_digits=20, decimal_places=10)
```

**Add:**
```python
    amount = serializers.DecimalField(max_digits=20, decimal_places=10, default=1)
```

---

## 2. `src/middleware/api/views.py`

### Change 2a — import line

**Delete:**
```python
from django.db.models import Avg, Count, Sum
```

**Add:**
```python
from django.db.models import Avg, Max, Sum
```

---

### Change 2b — `ExchangeViewSet.status()` — add `display_name`

In the `try` branch, **add** `"display_name": exchange.display_name,` after `"name": exchange.name,`:
```python
                results.append(
                    {
                        "name": exchange.name,
                        "display_name": exchange.display_name,
                        "connected": st.is_connected,
                        "last_message_at": st.last_heartbeat,
                        "retry_count": getattr(st, "reconnect_attempts", 0),
                    }
                )
```

In the `except ExchangeStatus.DoesNotExist` branch, **add** `"display_name": exchange.display_name,` after `"name": exchange.name,`:
```python
                results.append(
                    {
                        "name": exchange.name,
                        "display_name": exchange.display_name,
                        "connected": False,
                        "last_message_at": None,
                        "retry_count": 0,
                    }
                )
```

---

### Change 2c — `ArbitrageEventViewSet.poll()` — new action (add after the `stream` action)

**Add:**
```python
    # =========================================================
    # Poll endpoint (long-poll for new events since a given id)
    # =========================================================
    @action(detail=False, methods=["get"])
    def poll(self, request):
        """
        GET /api/opportunities/poll/?since_id=<id>&limit=50&include_simulated=true
        Returns {opportunities, latest_id, count}.
        """
        try:
            since_id = int(request.query_params.get("since_id", 0))
        except (TypeError, ValueError):
            since_id = 0

        try:
            limit = int(request.query_params.get("limit", 50))
        except (TypeError, ValueError):
            limit = 50

        include_simulated = request.query_params.get("include_simulated", "false").lower() == "true"

        qs = ArbitrageEvent.objects.filter(id__gt=since_id).select_related(
            "buy_exchange", "sell_exchange"
        )

        if not include_simulated:
            qs = qs.filter(trade_executed=False)

        events_list = list(qs.order_by("id")[:limit])
        data = ArbitrageEventSerializer(events_list, many=True).data
        latest_id = events_list[-1].id if events_list else since_id

        return Response({
            "opportunities": data,
            "latest_id": latest_id,
            "count": len(data),
        })
```

---

### Change 2d — `ArbitrageEventViewSet.stats()` — full replacement

**Delete:**
```python
    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = self.get_queryset()
        since_24h = timezone.now() - timedelta(hours=24)

        aggregates = qs.aggregate(
            total_count=Count("id"),
            avg_spread=Avg("spread"),
        )

        last_24h_count = qs.filter(created_at__gte=since_24h).count()
        total_sim_profit = qs.filter(trade_executed=True).aggregate(
            total=Sum("estimated_profit")
        )["total"]

        return Response(
            {
                "total_count": aggregates["total_count"] or 0,
                "last_24h_count": last_24h_count,
                "avg_spread": str(aggregates["avg_spread"] or 0),
                "total_sim_profit": str(total_sim_profit or 0),
            }
        )
```

**Add:**
```python
    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = self.get_queryset()
        since_24h = timezone.now() - timedelta(hours=24)

        total = qs.count()
        last_24h_count = qs.filter(created_at__gte=since_24h).count()
        simulated_qs = qs.filter(trade_executed=True)
        simulated_count = simulated_qs.count()
        profitable_count = qs.filter(trade_executed=True, estimated_profit__gt=0).count()

        agg = qs.aggregate(
            avg_spread=Avg("spread"),
            max_spread=Max("spread"),
        )
        total_sim_profit = simulated_qs.aggregate(total=Sum("estimated_profit"))["total"]

        return Response(
            {
                "total_opportunities": total,
                "last_24h_count": last_24h_count,
                "simulated_count": simulated_count,
                "profitable_count": profitable_count,
                "avg_spread": str(agg["avg_spread"] or 0),
                "max_spread": str(agg["max_spread"] or 0),
                "total_simulated_profit": str(total_sim_profit or 0),
            }
        )
```

---

## 3. `src/middleware/api/pagination.py` *(new file — create it)*

**Create the file with this content:**
```python
from rest_framework.pagination import PageNumberPagination


class LargeResultsSetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 5000
```

---

## 4. `src/middleware/marketscout/settings.py`

**After** the `CORS_ALLOW_CREDENTIALS = True` line, **add:**
```python
REST_FRAMEWORK = {
    'DEFAULT_PAGINATION_CLASS': 'api.pagination.LargeResultsSetPagination',
    'PAGE_SIZE': 100,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}
```

---

## 5. `src/frontend/src/main.tsx`

**Delete:**
```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import App from "./App"
import "./index.css"

const queryClient = new QueryClient()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
```

**Add:**
```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

---

## 6. `src/frontend/src/App.tsx`

**Replace entire file with:**
```tsx
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "./pages/Dashboard";
import AdvancedMode from "./pages/AdvancedMode";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <nav className="nav">
          <a href="/" className="nav-brand">
            MarketScout
          </a>
          <div className="nav-links">
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/advanced" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Advanced Mode
            </NavLink>
          </div>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/advanced" element={<AdvancedMode />} />
          </Routes>
        </main>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
```

---

## 7. `src/frontend/src/api/client.ts`

**Replace entire file with:**
```ts
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
```

---

## 8. `src/frontend/src/index.css`

**Replace entire file with:**
```css
:root {
  --bg-primary: #0d0d0d;
  --bg-secondary: #141414;
  --bg-tertiary: #1a1a1a;
  --bg-card: #161616;
  --border-color: #2a2a2a;
  --text-primary: #e5e5e5;
  --text-secondary: #999;
  --text-muted: #666;
  --accent-green: #22c55e;
  --accent-red: #ef4444;
  --accent-yellow: #eab308;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
  line-height: 1.5;
  font-size: 14px;
}

#root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--border-color);
}

/* Typography */
h1, h2, h3 {
  font-weight: 600;
}

.mono {
  font-family: 'SF Mono', 'Consolas', monospace;
}

/* Navigation */
.nav {
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0.75rem 1.5rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 1rem;
}

.nav-brand svg {
  width: 24px;
  height: 24px;
}

.nav-links {
  display: flex;
  gap: 0.25rem;
}

.nav-link {
  color: var(--text-secondary);
  text-decoration: none;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

.nav-link:hover {
  color: var(--text-primary);
}

.nav-link.active {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

/* Main content */
.main {
  flex: 1;
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* Cards */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.card-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Stats grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1rem;
}

.stat-value {
  display: block;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.125rem;
}

.stat-value.green { color: var(--accent-green); }
.stat-value.red { color: var(--accent-red); }
.stat-value.yellow { color: var(--accent-yellow); }

.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* Table */
.table-container {
  overflow-x: auto;
}

.opp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.opp-table th,
.opp-table td {
  padding: 0.625rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.opp-table th {
  background: var(--bg-tertiary);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  font-size: 0.6875rem;
  letter-spacing: 0.03em;
}

.opp-table tbody tr:hover {
  background: var(--bg-tertiary);
}

.opp-table .mono {
  font-size: 0.8125rem;
}

/* Spread badges */
.spread-high {
  color: var(--accent-green);
  font-weight: 600;
}

.spread-med {
  color: var(--accent-yellow);
}

.spread-low {
  color: var(--text-muted);
}

/* Asset badge */
.asset-badge {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  background: var(--bg-tertiary);
  border-radius: 2px;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 0.75rem;
}

/* Exchange badge */
.exchange-badge {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  background: var(--bg-tertiary);
  border-radius: 2px;
  font-size: 0.75rem;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-family: inherit;
  font-weight: 500;
  font-size: 0.8125rem;
  cursor: pointer;
}

.btn-primary {
  background: var(--text-primary);
  color: var(--bg-primary);
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  background: var(--border-color);
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Status indicators */
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot.connected {
  background: var(--accent-green);
}

.status-dot.disconnected {
  background: var(--accent-red);
}

.status-dot.connecting {
  background: var(--accent-yellow);
}

/* Filters */
.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  align-items: center;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.filter-label {
  font-size: 0.6875rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.filter-input,
.filter-select {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 0.375rem 0.5rem;
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.8125rem;
}

.filter-input:focus,
.filter-select:focus {
  outline: none;
  border-color: var(--text-muted);
}

/* Chart */
.chart-container {
  display: flex;
  align-items: flex-end;
  height: 80px;
  gap: 2px;
  padding: 0.5rem 0;
}

.chart-bar {
  flex: 1;
  min-width: 6px;
  background: var(--text-muted);
  border-radius: 1px 1px 0 0;
}

/* System status */
.status-list {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  font-size: 0.8125rem;
}

.exchange-name {
  font-weight: 500;
  text-transform: capitalize;
}

/* Loading state */
.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color);
  border-top-color: var(--text-muted);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin-right: 0.5rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}

/* Simulated row */
.row-simulated {
  opacity: 0.7;
}

.simulated-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--accent-green);
  font-size: 0.75rem;
}

/* Profit display */
.profit-positive {
  color: var(--accent-green);
}

.profit-negative {
  color: var(--accent-red);
}

/* Page header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-title {
  font-size: 1.25rem;
  font-weight: 600;
}

/* Grid layouts */
.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 240px;
  gap: 1rem;
}

@media (max-width: 1000px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Clickable table rows */
.opp-table.clickable tbody tr {
  cursor: pointer;
}

/* Pending badge */
.pending-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--text-muted);
  font-size: 0.75rem;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1.5rem;
}

.modal-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  max-width: 700px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  background: var(--bg-secondary);
  z-index: 10;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1rem;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
}

.modal-close:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 1rem;
}

/* Detail sections */
.detail-section {
  margin-bottom: 1.5rem;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 0.75rem;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.detail-grid.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}

.detail-grid.cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.detail-item {
  background: var(--bg-tertiary);
  padding: 0.75rem;
  border-radius: 4px;
}

.detail-item.highlight {
  border-left: 2px solid var(--accent-green);
}

.detail-label {
  display: block;
  font-size: 0.6875rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 0.125rem;
}

.detail-value {
  font-size: 0.875rem;
  color: var(--text-primary);
}

.spread-value {
  color: var(--accent-green);
  font-weight: 600;
}

/* Exchange comparison */
.exchange-comparison {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
}

.exchange-side {
  flex: 1;
  background: var(--bg-tertiary);
  border-radius: 4px;
  padding: 1rem;
}

.exchange-side.buy {
  border-left: 2px solid var(--accent-green);
}

.exchange-side.sell {
  border-left: 2px solid var(--text-secondary);
}

.exchange-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.side-label {
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 0.125rem 0.375rem;
  border-radius: 2px;
  background: var(--bg-secondary);
}

.exchange-side.buy .side-label {
  color: var(--accent-green);
}

.exchange-side.sell .side-label {
  color: var(--text-secondary);
}

.exchange-stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
}

.stat-row span:first-child {
  color: var(--text-muted);
}

.exchange-arrow {
  display: flex;
  align-items: center;
  color: var(--text-muted);
}

/* Liquidity bars */
.liquidity-bars {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.liquidity-item {
  background: var(--bg-tertiary);
  padding: 0.75rem;
  border-radius: 4px;
}

.liquidity-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.375rem;
  font-size: 0.8125rem;
}

.liquidity-bar {
  height: 4px;
  background: var(--bg-secondary);
  border-radius: 2px;
  overflow: hidden;
}

.liquidity-fill {
  height: 100%;
  border-radius: 2px;
}

.liquidity-fill.buy {
  background: var(--accent-green);
}

.liquidity-fill.sell {
  background: var(--text-secondary);
}

.liquidity-note {
  margin-top: 0.75rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  text-align: center;
}

/* Fee breakdown */
.fee-breakdown,
.profit-breakdown {
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.fee-row,
.profit-row {
  display: flex;
  justify-content: space-between;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.8125rem;
}

.fee-row:last-child,
.profit-row:last-child {
  border-bottom: none;
}

.fee-row.total,
.profit-row.net {
  background: var(--bg-secondary);
  font-weight: 600;
}

.fee-value {
  color: var(--accent-red);
}

/* Net profit display */
.net-profit-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.net-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.net-value {
  font-size: 1.25rem;
  font-weight: 600;
}

/* Simulated section */
.detail-section.simulated {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1rem;
}

.simulated-indicator {
  color: var(--accent-green);
}

/* Badge sizes */
.asset-badge.large,
.exchange-badge.large {
  padding: 0.375rem 0.625rem;
  font-size: 0.875rem;
}

.btn-lg {
  padding: 0.625rem 1.5rem;
  font-size: 0.875rem;
}

.btn-stop {
  background: var(--accent-red);
  color: white;
}

.btn-stop:hover {
  opacity: 0.9;
}

.btn svg {
  flex-shrink: 0;
}

.spinner.small {
  width: 14px;
  height: 14px;
  margin-right: 0.375rem;
}

/* Responsive adjustments for modal */
@media (max-width: 768px) {
  .modal-content {
    margin: 1rem;
    max-height: calc(100vh - 2rem);
  }

  .exchange-comparison {
    flex-direction: column;
  }

  .exchange-arrow {
    transform: rotate(90deg);
    justify-content: center;
    padding: 0.25rem 0;
  }

  .detail-grid,
  .detail-grid.cols-3,
  .detail-grid.cols-2 {
    grid-template-columns: 1fr;
  }
}

/* ===== ADVANCED MODE STYLES ===== */

.advanced-mode {
  min-height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.advanced-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.advanced-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 1.125rem;
  font-weight: 600;
}

.advanced-subtitle {
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.sim-time {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  padding: 0.375rem 0.625rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.locked-funds-indicator {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--accent-yellow);
  padding: 0.25rem 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.locked-funds-indicator .lock-count {
  font-weight: 600;
  min-width: 1rem;
  text-align: center;
}

.locked-funds-indicator .lock-label {
  color: var(--text-muted);
  font-size: 0.6875rem;
}

.data-mode-selector {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.mode-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  position: relative;
}

.mode-card:hover:not(.disabled) {
  border-color: var(--text-muted);
}

.mode-card.active {
  border-color: var(--text-secondary);
}

.mode-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mode-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.mode-title {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.mode-desc {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.mode-check {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 16px;
  height: 16px;
  background: var(--text-secondary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  color: var(--bg-primary);
  font-weight: 700;
}

.live-status-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-bottom: 1rem;
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--accent-red);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.live-dot {
  width: 6px;
  height: 6px;
  background: var(--accent-red);
  border-radius: 50%;
}

.live-info {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.advanced-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

.advanced-content {
  display: grid;
  grid-template-columns: 240px 1fr 220px;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: visible;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.panel-header h3 {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-secondary);
}

.panel-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  background: var(--bg-secondary);
  border-radius: 2px;
  color: var(--text-secondary);
}

.exchange-panel {
  display: flex;
  flex-direction: column;
}

.exchange-matrix {
  padding: 0.5rem;
  flex: 1;
  overflow-y: auto;
}

.exchange-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  margin-bottom: 0.375rem;
  border-left: 2px solid var(--accent-green);
}

.exchange-row.disconnected {
  border-left-color: var(--accent-red);
  opacity: 0.6;
}

.exchange-info {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
}

.exchange-fee {
  margin-left: auto;
  font-size: 0.625rem;
  font-family: 'SF Mono', 'Consolas', monospace;
  color: var(--text-muted);
  padding: 0.125rem 0.25rem;
  background: var(--bg-secondary);
  border-radius: 2px;
}

.main-panel {
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.bot-builder {
  padding: 1rem;
  overflow-y: auto;
  flex: 1;
}

.builder-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.strategy-name-input {
  font-size: 1rem;
  font-weight: 600;
  background: transparent;
  border: none;
  color: var(--text-primary);
  padding: 0.375rem 0;
  border-bottom: 1px solid var(--border-color);
  width: 250px;
}

.strategy-name-input:focus {
  outline: none;
  border-bottom-color: var(--text-muted);
}

.builder-actions {
  display: flex;
  gap: 0.5rem;
}

.profile-select {
  padding: 0.375rem 0.5rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.75rem;
  cursor: pointer;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.75rem;
}

.module-card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.module-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.625rem 0.75rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.module-header h4 {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary);
}

.module-content {
  padding: 0.75rem;
}

.form-group {
  margin-bottom: 0.75rem;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  color: var(--text-secondary);
  margin-bottom: 0.375rem;
}

.form-group label input[type="checkbox"] {
  width: 14px;
  height: 14px;
}

.input-with-suffix {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.input-with-suffix input {
  flex: 1;
  padding: 0.375rem 0.5rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 0.8125rem;
}

.input-with-suffix input:focus {
  outline: none;
  border-color: var(--text-muted);
}

.input-with-suffix span {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.toggle-group {
  display: flex;
  gap: 0.25rem;
}

.toggle-btn {
  flex: 1;
  padding: 0.375rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 0.6875rem;
  cursor: pointer;
}

.toggle-btn.active {
  background: var(--text-secondary);
  color: var(--bg-primary);
  border-color: var(--text-secondary);
}

.strategy-preview {
  background: var(--bg-secondary);
  border-radius: 4px;
  padding: 0.5rem;
}

.preview-label {
  font-size: 0.625rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.strategy-preview code {
  display: block;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 0.6875rem;
  color: var(--text-secondary);
  margin-top: 0.375rem;
  white-space: pre-wrap;
}

.hint {
  display: block;
  font-size: 0.625rem;
  color: var(--text-muted);
  margin-top: 0.125rem;
}

.module-header .total-capital {
  margin-left: auto;
  font-size: 0.6875rem;
  font-family: 'SF Mono', 'Consolas', monospace;
  color: var(--accent-green);
  padding: 0.125rem 0.375rem;
  background: var(--bg-primary);
  border-radius: 2px;
}

.capital-editor {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.capital-module {
  grid-column: span 2;
}

.capital-module .capital-editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.capital-module .capital-edit-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 1fr;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.capital-module .capital-edit-row.disabled {
  opacity: 0.5;
}

.capital-module .col-exchange {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.capital-module .col-balance input {
  width: 100%;
  padding: 0.375rem 0.5rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 0.75rem;
  text-align: right;
}

.capital-module .col-balance input:focus {
  outline: none;
  border-color: var(--text-muted);
}

.capital-module .col-balance input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.capital-labels {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr 1fr;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  margin-top: 0.25rem;
  font-size: 0.625rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.capital-labels span:not(:first-child) {
  text-align: center;
}

.live-monitor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  overflow-y: auto;
  flex: 1;
}

.pnl-chart {
  background: var(--bg-tertiary);
  border-radius: 4px;
  padding: 0.75rem;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.chart-header h4 {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.pnl-value {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 1rem;
  font-weight: 600;
}

.pnl-value.positive { color: var(--accent-green); }
.pnl-value.negative { color: var(--accent-red); }

.chart-area {
  height: 80px;
  display: flex;
  align-items: flex-end;
}

.chart-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.mini-chart {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  flex: 1;
  height: 100%;
}

.mini-chart .chart-bar {
  flex: 1;
  min-width: 3px;
  border-radius: 1px 1px 0 0;
}

.mini-chart .chart-bar.positive { background: var(--accent-green); }
.mini-chart .chart-bar.negative { background: var(--accent-red); }

.trade-feed {
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.feed-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
}

.feed-header h4 {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.trade-count {
  font-size: 0.625rem;
  color: var(--text-muted);
  padding: 0.125rem 0.375rem;
  background: var(--bg-secondary);
  border-radius: 2px;
}

.feed-content {
  flex: 1;
  overflow-y: auto;
  max-height: 200px;
}

.trade-entry {
  display: grid;
  grid-template-columns: 60px 1fr 40px 80px 70px 24px;
  gap: 0.375rem;
  align-items: center;
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.6875rem;
  cursor: pointer;
}

.trade-entry:hover { background: var(--bg-secondary); }
.trade-entry.failed, .trade-entry.timeout { opacity: 0.6; }

.trade-time {
  font-family: 'SF Mono', 'Consolas', monospace;
  color: var(--text-muted);
}

.trade-route {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.trade-route .badge {
  font-size: 0.5625rem;
  padding: 0.125rem 0.25rem;
  background: var(--bg-secondary);
  border-radius: 2px;
  text-transform: capitalize;
}

.trade-route .arrow { color: var(--text-muted); }

.trade-asset {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-weight: 500;
}

.trade-profit {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-weight: 600;
}

.trade-profit.positive { color: var(--accent-green); }
.trade-profit.negative { color: var(--accent-red); }

.trade-status { text-align: center; }
.trade-status.success { color: var(--accent-green); }
.trade-status.partial { color: var(--accent-yellow); }
.trade-status.failed, .trade-status.timeout { color: var(--accent-red); }

.feed-empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.trade-size {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  font-family: 'SF Mono', 'Consolas', monospace;
}

.trade-size .size-amount { font-size: 0.6875rem; color: var(--text-primary); }
.trade-size .size-value { font-size: 0.5625rem; color: var(--text-muted); }

.funds-breakdown {
  background: var(--bg-tertiary);
  border-radius: 4px;
  padding: 0.75rem;
}

.funds-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.funds-header h4 { font-size: 0.75rem; color: var(--text-secondary); }
.funds-total { font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.75rem; color: var(--text-muted); }

.funds-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.5rem;
}

.funds-exchange {
  background: var(--bg-secondary);
  border-radius: 4px;
  padding: 0.5rem;
}

.funds-exchange-name {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.375rem;
  text-transform: capitalize;
}

.funds-assets { display: flex; flex-direction: column; gap: 0.25rem; }

.funds-asset {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  font-size: 0.625rem;
}

.funds-asset .asset-label { color: var(--text-muted); width: 32px; }
.funds-asset .asset-avail { font-family: 'SF Mono', 'Consolas', monospace; color: var(--text-primary); }
.funds-asset .asset-locked { font-family: 'SF Mono', 'Consolas', monospace; color: var(--accent-yellow); font-size: 0.5625rem; }

.log-panel {
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
}

.log-header h4 { font-size: 0.75rem; color: var(--text-secondary); }

.log-content {
  max-height: 120px;
  overflow-y: auto;
  padding: 0.375rem;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 0.625rem;
}

.log-entry {
  padding: 0.125rem 0.375rem;
  border-radius: 2px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-entry.success { color: var(--accent-green); }
.log-entry.error { color: var(--accent-red); }

.analytics-panel {
  padding: 1rem;
  overflow-y: auto;
}

.analytics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.analytics-card {
  background: var(--bg-tertiary);
  border-radius: 4px;
  padding: 1rem;
  text-align: center;
}

.analytics-value {
  display: block;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.125rem;
}

.analytics-value.green { color: var(--accent-green); }
.analytics-value.red { color: var(--accent-red); }

.analytics-label {
  font-size: 0.6875rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.analytics-breakdown {
  background: var(--bg-tertiary);
  border-radius: 4px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.analytics-breakdown h4 { font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.75rem; }

.breakdown-bars { display: flex; flex-direction: column; gap: 0.5rem; }

.breakdown-item { display: flex; align-items: center; gap: 0.75rem; }
.breakdown-label { width: 80px; font-size: 0.6875rem; color: var(--text-secondary); }
.breakdown-bar { flex: 1; height: 4px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden; }
.breakdown-fill { height: 100%; border-radius: 2px; }
.breakdown-fill.fees { background: var(--accent-yellow); }
.breakdown-fill.slippage { background: var(--text-muted); }
.breakdown-value { width: 60px; text-align: right; font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.6875rem; color: var(--text-muted); }

.analytics-sensitivity {
  background: var(--bg-tertiary);
  border-radius: 4px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.analytics-sensitivity h4 { font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.375rem; }
.sensitivity-note { font-size: 0.75rem; color: var(--text-muted); }

.real-opportunities { background: var(--bg-tertiary); border-radius: 4px; padding: 1rem; }
.real-opportunities h4 { font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.75rem; }
.real-opp-list { display: flex; flex-direction: column; gap: 0.375rem; }

.real-opp-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  background: var(--bg-secondary);
  border-radius: 4px;
  cursor: pointer;
}

.real-opp-item:hover { background: var(--border-color); }
.opp-asset { font-family: 'SF Mono', 'Consolas', monospace; font-weight: 600; color: var(--text-primary); }
.opp-route { flex: 1; font-size: 0.75rem; color: var(--text-secondary); }
.opp-spread { font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.75rem; color: var(--text-muted); }
.opp-spread.high { color: var(--accent-green); }

.control-panel { display: flex; flex-direction: column; }
.control-buttons { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
.full-width { width: 100%; }

.speed-control { padding: 0.75rem; border-top: 1px solid var(--border-color); }
.speed-label { display: block; font-size: 0.6875rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 0.5rem; }
.speed-buttons { display: flex; gap: 0.25rem; }

.speed-btn {
  flex: 1;
  padding: 0.375rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-muted);
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 0.6875rem;
  cursor: pointer;
}

.speed-btn.active { background: var(--text-secondary); color: var(--bg-primary); border-color: var(--text-secondary); }

.live-stats { padding: 0.75rem; border-top: 1px solid var(--border-color); flex: 1; }

.stat-row { display: flex; justify-content: space-between; padding: 0.375rem 0; border-bottom: 1px solid var(--border-color); }
.stat-row:last-child { border-bottom: none; }
.stat-label { font-size: 0.6875rem; color: var(--text-muted); }
.stat-value { font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.75rem; color: var(--text-primary); }
.stat-value.positive { color: var(--accent-green); }
.stat-value.negative { color: var(--accent-red); }

.trade-detail-modal { max-width: 550px; }

.route-detail {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: center;
  padding: 0.75rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.route-side { display: flex; flex-direction: column; align-items: center; gap: 0.125rem; }
.route-side .exchange { font-weight: 600; text-transform: capitalize; }
.route-side .price { font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.9375rem; color: var(--text-primary); }
.route-detail .route-arrow { font-size: 1.25rem; color: var(--text-muted); }

.financial-breakdown { background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; }

.fin-row { display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-color); font-size: 0.8125rem; }
.fin-row:last-child { border-bottom: none; }
.fin-row.total { background: var(--bg-secondary); font-weight: 600; }
.fin-row .positive { color: var(--accent-green); }
.fin-row .negative { color: var(--accent-red); }

.execution-detail { padding: 0.5rem; background: var(--bg-tertiary); border-radius: 4px; font-size: 0.8125rem; }

.detail-section { margin-bottom: 1rem; }
.detail-section h4 { font-size: 0.6875rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 0.5rem; }

.detail-value.success { color: var(--accent-green); }
.detail-value.partial { color: var(--accent-yellow); }
.detail-value.failed, .detail-value.timeout { color: var(--accent-red); }

.btn-ghost { background: transparent; border: 1px solid var(--border-color); color: var(--text-muted); }
.btn-ghost:hover { background: var(--bg-secondary); color: var(--text-primary); }

.active-mode-display { padding: 0.75rem; text-align: center; border-bottom: 1px solid var(--border-color); }
.mode-badge { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.375rem 0.75rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; color: var(--bg-primary); }

@media (max-width: 1200px) {
  .advanced-content { grid-template-columns: 200px 1fr 180px; }
}

@media (max-width: 900px) {
  .advanced-content { grid-template-columns: 1fr; }
  .exchange-panel { display: none; }
  .analytics-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 768px) {
  .advanced-header { flex-direction: column; gap: 0.75rem; }
  .header-right { flex-wrap: wrap; justify-content: center; }
  .advanced-tabs { overflow-x: auto; padding-bottom: 0.375rem; }
  .module-grid { grid-template-columns: 1fr; }
  .analytics-grid { grid-template-columns: 1fr; }
  .trade-entry { grid-template-columns: 50px 1fr auto; font-size: 0.625rem; }
  .trade-route, .trade-amount, .trade-latency { display: none; }
  .capital-module { grid-column: span 1; }
  .capital-module .capital-edit-row { grid-template-columns: 1fr 1fr 1fr; }
  .capital-module .col-exchange { grid-column: span 3; margin-bottom: 0.25rem; }
  .capital-labels { grid-template-columns: 1fr 1fr 1fr; }
  .capital-labels span:first-child { display: none; }
}
```

---

## 9. `src/frontend/src/components/Stats.tsx`

**Replace entire file with:**
```tsx
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
```

---

## 10. `src/frontend/src/components/SystemStatus.tsx`

**Replace entire file with:**
```tsx
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
```

---

## 11. `src/frontend/src/components/SpreadChart.tsx`

**Replace entire file with:**
```tsx
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
```

---

## 12. `src/frontend/src/components/OpportunityTable.tsx`

**Replace entire file with:**
```tsx
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
```

---

## 13. `src/frontend/src/components/TradeDetailModal.tsx`

**Replace entire file with:**
```tsx
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

  const buyPrice = parseFloat(opportunity.buy_price);
  const sellPrice = parseFloat(opportunity.sell_price);
  const spreadAbsolute = parseFloat(opportunity.spread_absolute);
  const tradeAmount = opportunity.trade_amount ? parseFloat(opportunity.trade_amount) : 1;

  const estimatedBuyFee = buyPrice * tradeAmount * 0.001;
  const estimatedSellFee = sellPrice * tradeAmount * 0.001;
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
```

---

## 14. `src/frontend/src/pages/Dashboard.tsx`

**Replace entire file with:**
```tsx
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
```

---

## 15. `src/frontend/src/pages/AdvancedMode.tsx`

**Replace entire file with:**

```tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchExchangeStatus,
  fetchRecentOpportunities,
  fetchOpportunities,
  pollOpportunities,
  createOpportunityStream,
  ArbitrageEvent
} from "../api/client";
import TradeDetailModal from "../components/TradeDetailModal";

// Types for simulation
type DataMode = "backtest" | "live";

interface ExchangeConfig {
  name: string;
  displayName: string;
  makerFee: number;
  takerFee: number;
  withdrawalFee: number;
  latencyMs: number;
  liquidityDepth: number;
  balances: { [asset: string]: number };
  connected: boolean;
}

interface BotConfig {
  name: string;
  dataInterval: number;
  connectionType: "websocket" | "rest";
  minSpreadThreshold: number;
  includeTransferFees: boolean;
  slippageAssumption: number;
  executionType: "market" | "limit";
  maxBalancePercent: number;
  enableTriangular: boolean;
  triangularThreshold: number;
}

interface SimulationTrade {
  id: string;
  timestamp: number;
  type: "spatial" | "triangular";
  buyExchange: string;
  sellExchange: string;
  asset: string;
  buyPrice: number;
  sellPrice: number;
  amount: number;
  grossProfit: number;
  fees: number;
  slippage: number;
  latencyCost: number;
  netProfit: number;
  executionTimeMs: number;
  status: "success" | "partial" | "failed" | "timeout";
  sourceOpportunityId?: number;
}

interface LockedFunds {
  id: string;
  exchange: string;
  asset: string;
  amount: number;
  lockedAt: number;
  unlockAt: number;
  tradeId: string;
  reason: "pending_settlement" | "withdrawal_cooldown" | "transfer_in_progress";
}

interface SimulationState {
  isRunning: boolean;
  isPaused: boolean;
  speed: number;
  currentTime: number;
  startTime: number;
  trades: SimulationTrade[];
  totalPnL: number;
  latencyMode: "constant" | "random" | "exchange-dependent";
  stressTestEnabled: boolean;
  lockedFunds: LockedFunds[];
  settlementDelayMs: number; // How long funds stay locked after trade
}

interface BacktestConfig {
  startDate: string;
  endDate: string;
  currentIndex: number;
  data: ArbitrageEvent[];
}

const DEFAULT_EXCHANGES: ExchangeConfig[] = [
  { name: "binance", displayName: "Binance", makerFee: 0.1, takerFee: 0.1, withdrawalFee: 0.0005, latencyMs: 15, liquidityDepth: 100, balances: { BTC: 5, ETH: 50, USDT: 100000 }, connected: true },
  { name: "kraken", displayName: "Kraken", makerFee: 0.16, takerFee: 0.26, withdrawalFee: 0.0005, latencyMs: 45, liquidityDepth: 60, balances: { BTC: 3, ETH: 30, USDT: 50000 }, connected: true },
  { name: "coinbase", displayName: "Coinbase", makerFee: 0.4, takerFee: 0.6, withdrawalFee: 0.0001, latencyMs: 35, liquidityDepth: 80, balances: { BTC: 2, ETH: 20, USDT: 30000 }, connected: true },
];

const DEFAULT_BOT_CONFIG: BotConfig = {
  name: "Untitled Strategy",
  dataInterval: 50,
  connectionType: "websocket",
  minSpreadThreshold: 0.01,
  includeTransferFees: true,
  slippageAssumption: 0.05,
  executionType: "market",
  maxBalancePercent: 20,
  enableTriangular: false,
  triangularThreshold: 0.2,
};

const DATA_MODE_INFO = {
  backtest: {
    title: "Backtest",
    description: "Replay historical opportunities at adjustable speed",
    color: "var(--accent-yellow)",
  },
  live: {
    title: "Live Paper",
    description: "Real-time polling of actual exchange opportunities (configurable)",
    color: "var(--accent-red)",
  },
};

export default function AdvancedMode() {
  // Data mode state
  const [dataMode, setDataMode] = useState<DataMode>("backtest");

  // Core state
  const [exchanges, setExchanges] = useState<ExchangeConfig[]>(DEFAULT_EXCHANGES);
  const [botConfig, setBotConfig] = useState<BotConfig>(DEFAULT_BOT_CONFIG);
  const [simulation, setSimulation] = useState<SimulationState>({
    isRunning: false,
    isPaused: false,
    speed: 1,
    currentTime: Date.now(),
    startTime: Date.now(),
    trades: [],
    totalPnL: 0,
    latencyMode: "exchange-dependent",
    stressTestEnabled: false,
    lockedFunds: [],
    settlementDelayMs: 2000, // 2 seconds default settlement time
  });

  // Backtest state
  const [backtestConfig, setBacktestConfig] = useState<BacktestConfig>({
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    currentIndex: 0,
    data: [],
  });
  const [isLoadingBacktest, setIsLoadingBacktest] = useState(false);

  // Live mode state
  const [liveOpportunities, setLiveOpportunities] = useState<ArbitrageEvent[]>([]);
  const [processedLiveIds, setProcessedLiveIds] = useState<Set<number>>(new Set());
  const livePollingRef = useRef<number | null>(null);
  const lastLiveIdRef = useRef(0);
  const isLivePollingRef = useRef(false);

  // Configurable settings
  const [opportunityLimit, setOpportunityLimit] = useState(50);
  const [pollingInterval, setPollingInterval] = useState(200);
  const [backtestLimit, setBacktestLimit] = useState(1000);

  // UI state
  const [activeTab, setActiveTab] = useState<"builder" | "monitor" | "analytics">("builder");
  const [selectedTrade, setSelectedTrade] = useState<SimulationTrade | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<{ name: string; config: BotConfig }[]>([
    { name: "CrossExchange v1: Binance-Kraken Spread Hunter", config: { ...DEFAULT_BOT_CONFIG, minSpreadThreshold: 0.5 } },
    { name: "TriArb v2: ETH-BTC-USDT Cycle Explorer", config: { ...DEFAULT_BOT_CONFIG, enableTriangular: true, triangularThreshold: 0.3 } },
  ]);
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<ArbitrageEvent | null>(null);

  const simulationRef = useRef<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch real exchange status
  const { data: realExchanges } = useQuery({
    queryKey: ["exchange-status"],
    queryFn: fetchExchangeStatus,
  });

  const { data: realOpportunities } = useQuery({
    queryKey: ["advanced-opportunities"],
    queryFn: () => fetchRecentOpportunities(60),
    refetchInterval: 10000,
  });


  // Calculate available (unlocked) balance for an exchange/asset
  // In backtest mode, we don't use fund locking (instant settlement assumed)
  const getAvailableBalance = useCallback((exchangeName: string, asset: string): number => {
    const exchange = exchanges.find(e => e.name === exchangeName);
    if (!exchange) return 0;

    const totalBalance = exchange.balances[asset] || 0;

    // Skip fund locking in backtest mode - assume instant settlement
    if (dataMode === "backtest") {
      return totalBalance;
    }

    const lockedAmount = simulation.lockedFunds
      .filter(lf => lf.exchange === exchangeName && lf.asset === asset && lf.unlockAt > simulation.currentTime)
      .reduce((sum, lf) => sum + lf.amount, 0);

    return Math.max(0, totalBalance - lockedAmount);
  }, [exchanges, simulation.lockedFunds, simulation.currentTime, dataMode]);

  // Lock funds when a trade is executed
  const lockFundsForTrade = useCallback((trade: SimulationTrade): LockedFunds[] => {
    const locks: LockedFunds[] = [];
    const now = simulation.currentTime;
    const unlockTime = now + simulation.settlementDelayMs;

    // Lock USDT on buy exchange (cost of purchase)
    const buyCost = trade.buyPrice * trade.amount;
    locks.push({
      id: `lock-${trade.id}-buy`,
      exchange: trade.buyExchange,
      asset: "USDT",
      amount: buyCost,
      lockedAt: now,
      unlockAt: unlockTime,
      tradeId: trade.id,
      reason: "pending_settlement",
    });

    // Lock the asset on sell exchange (what we're selling)
    locks.push({
      id: `lock-${trade.id}-sell`,
      exchange: trade.sellExchange,
      asset: trade.asset,
      amount: trade.amount,
      lockedAt: now,
      unlockAt: unlockTime,
      tradeId: trade.id,
      reason: "pending_settlement",
    });

    return locks;
  }, [simulation.currentTime, simulation.settlementDelayMs]);

  // Clean up expired locks (funds that have settled)
  const cleanupExpiredLocks = useCallback(() => {
    setSimulation(prev => ({
      ...prev,
      lockedFunds: prev.lockedFunds.filter(lf => lf.unlockAt > prev.currentTime),
    }));
  }, []);

  // Check if we have sufficient available funds for a trade
  const canExecuteTrade = useCallback((
    buyExchange: string,
    sellExchange: string,
    asset: string,
    amount: number,
    buyPrice: number
  ): { canExecute: boolean; reason?: string } => {
    const requiredUSDT = buyPrice * amount;
    const availableUSDT = getAvailableBalance(buyExchange, "USDT");

    if (availableUSDT < requiredUSDT) {
      return {
        canExecute: false,
        reason: `Insufficient USDT on ${buyExchange}: need ${requiredUSDT.toFixed(2)}, available ${availableUSDT.toFixed(2)} (${(availableUSDT / requiredUSDT * 100).toFixed(0)}% of required)`
      };
    }

    const availableAsset = getAvailableBalance(sellExchange, asset);
    if (availableAsset < amount) {
      return {
        canExecute: false,
        reason: `Insufficient ${asset} on ${sellExchange}: need ${amount.toFixed(6)}, available ${availableAsset.toFixed(6)}`
      };
    }

    return { canExecute: true };
  }, [getAvailableBalance]);

  // Convert real opportunity to simulated trade (with fund locking)
  const processRealOpportunity = useCallback((opp: ArbitrageEvent): { trade: SimulationTrade; locks: LockedFunds[] } | null => {
    const spread = parseFloat(opp.spread_pct);
    if (spread < botConfig.minSpreadThreshold) return null;

    const buyPrice = parseFloat(opp.buy_price);
    const sellPrice = parseFloat(opp.sell_price);
    const buyEx = exchanges.find(e => e.name.toLowerCase() === opp.buy_exchange_name.toLowerCase()) || exchanges[0];
    const sellEx = exchanges.find(e => e.name.toLowerCase() === opp.sell_exchange_name.toLowerCase()) || exchanges[1];

    // Skip if either exchange is disabled
    if (!buyEx.connected || !sellEx.connected) {
      return null;
    }

    // Extract asset symbol (e.g., "BTC" from "BTC/USDT")
    const asset = opp.asset.split("/")[0] || opp.asset;

    // Use AVAILABLE balance (total - locked) instead of total balance
    const availableUSDT = getAvailableBalance(buyEx.name, "USDT");
    const availableAsset = getAvailableBalance(sellEx.name, asset);

    const maxAmount = Math.min(
      parseFloat(opp.buy_qty_available) || 1,
      parseFloat(opp.sell_qty_available) || 1,
      availableUSDT / buyPrice * (botConfig.maxBalancePercent / 100),
      availableAsset * (botConfig.maxBalancePercent / 100)
    );

    // Can't execute if no available funds
    if (maxAmount <= 0.0001) {
      return null;
    }

    const amount = Math.max(0.001, maxAmount * (0.5 + Math.random() * 0.5));

    // Final check: can we actually execute this trade?
    const fundCheck = canExecuteTrade(buyEx.name, sellEx.name, asset, amount, buyPrice);
    if (!fundCheck.canExecute) {
      // Log why we skipped this trade
      console.log(`[FundLock] Skipping trade: ${fundCheck.reason}`);
      return null;
    }

    const grossProfit = (sellPrice - buyPrice) * amount;
    const fees = (buyPrice * amount * buyEx.takerFee / 100) + (sellPrice * amount * sellEx.takerFee / 100);
    const slippage = grossProfit * (botConfig.slippageAssumption / 100);

    let latency = buyEx.latencyMs + sellEx.latencyMs;
    if (simulation.latencyMode === "random") {
      latency += Math.random() * 100;
    }
    const latencyCost = grossProfit * (latency / 1000) * 0.1;

    const netProfit = grossProfit - fees - slippage - latencyCost;

    let status: SimulationTrade["status"] = "success";
    if (simulation.stressTestEnabled && Math.random() < 0.15) {
      status = Math.random() < 0.5 ? "failed" : "timeout";
    } else if (Math.random() < 0.05) {
      status = "partial";
    }

    const trade: SimulationTrade = {
      id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(opp.detected_at).getTime(),
      type: "spatial",
      buyExchange: opp.buy_exchange_name,
      sellExchange: opp.sell_exchange_name,
      asset,
      buyPrice,
      sellPrice,
      amount,
      grossProfit,
      fees,
      slippage,
      latencyCost,
      netProfit: status === "success" ? netProfit : status === "partial" ? netProfit * 0.4 : 0,
      executionTimeMs: latency,
      status,
      sourceOpportunityId: opp.id,
    };

    // Create fund locks for this trade
    const locks = lockFundsForTrade(trade);

    return { trade, locks };
  }, [exchanges, botConfig, simulation.latencyMode, simulation.stressTestEnabled, getAvailableBalance, canExecuteTrade, lockFundsForTrade]);

  // Load backtest data
  const loadBacktestData = useCallback(async () => {
    setIsLoadingBacktest(true);
    try {
      const response = await fetchOpportunities({ ordering: "detected_at", limit: backtestLimit });
      setBacktestConfig(prev => ({
        ...prev,
        data: response.results,
        currentIndex: 0,
      }));
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Loaded ${response.results.length} historical opportunities for backtest`]);
    } catch (error) {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: Failed to load backtest data`]);
    }
    setIsLoadingBacktest(false);
  }, [backtestLimit]);

  // EventSource ref for SSE streaming
  const eventSourceRef = useRef<EventSource | null>(null);

  // Start live data feed (SSE for WebSocket mode, REST polling for REST mode)
  const startLivePolling = useCallback(() => {
    if (livePollingRef.current || isLivePollingRef.current || eventSourceRef.current) {
      return;
    }

    isLivePollingRef.current = true;

    if (botConfig.connectionType === "websocket") {
      // Use Server-Sent Events for real-time streaming
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Starting SSE stream (real-time push)...`]);

      eventSourceRef.current = createOpportunityStream(
        lastLiveIdRef.current,
        (data) => {
          if (data.opportunities && data.opportunities.length > 0) {
            lastLiveIdRef.current = data.latest_id;
            setLiveOpportunities(prev => [...prev.slice(-opportunityLimit), ...data.opportunities]);
            setLogs(prev => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] SSE: Received ${data.opportunities.length} opportunities (ID: ${data.latest_id})`]);
          }
        },
        (error) => {
          console.error("SSE error:", error);
          setLogs(prev => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] SSE connection error - will auto-reconnect`]);
        }
      );

      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] SSE stream connected - real-time mode active`]);
    } else {
      // Use REST polling
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Starting REST polling (${pollingInterval}ms interval)...`]);

      const pollLiveData = async () => {
        if (!isLivePollingRef.current) return;

        try {
          const response = await pollOpportunities({
            sinceId: lastLiveIdRef.current,
            limit: opportunityLimit,
            includeSimulated: true,
          });

          if (response.opportunities && response.opportunities.length > 0) {
            lastLiveIdRef.current = response.latest_id;
            setLiveOpportunities(prev => [...prev.slice(-opportunityLimit), ...response.opportunities]);
            setLogs(prev => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] REST: Received ${response.opportunities.length} opportunities (ID: ${response.latest_id})`]);
          }
        } catch (error) {
          console.error("REST poll error:", error);
        }
      };

      pollLiveData();

      const effectiveInterval = Math.max(50, Math.round(pollingInterval / simulation.speed));
      livePollingRef.current = window.setInterval(pollLiveData, effectiveInterval);

      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] REST polling active at ${simulation.speed}x speed (${effectiveInterval}ms)`]);
    }
  }, [opportunityLimit, pollingInterval, simulation.speed, botConfig.connectionType]);

  // Stop live data feed
  const stopLivePolling = useCallback(() => {
    isLivePollingRef.current = false;

    // Stop REST polling
    if (livePollingRef.current) {
      clearInterval(livePollingRef.current);
      livePollingRef.current = null;
    }

    // Close SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Process live opportunities
  useEffect(() => {
    if (dataMode !== "live" || !simulation.isRunning || simulation.isPaused) return;

    const newOpportunities = liveOpportunities.filter(opp => !processedLiveIds.has(opp.id));

    if (newOpportunities.length > 0) {
      const newTrades: SimulationTrade[] = [];
      const newLocks: LockedFunds[] = [];
      const newProcessedIds = new Set(processedLiveIds);

      for (const opp of newOpportunities) {
        const result = processRealOpportunity(opp);
        if (result) {
          newTrades.push(result.trade);
          newLocks.push(...result.locks);
          const logEntry = `[${new Date().toLocaleTimeString()}] LIVE ${result.trade.status.toUpperCase()}: ${result.trade.asset} | ${result.trade.buyExchange} → ${result.trade.sellExchange} | Spread: ${parseFloat(opp.spread_pct).toFixed(3)}% | Net: $${result.trade.netProfit.toFixed(4)} | Funds locked for ${simulation.settlementDelayMs / 1000}s`;
          setLogs(prev => [...prev.slice(-199), logEntry]);
        }
        newProcessedIds.add(opp.id);
      }

      if (newTrades.length > 0) {
        setSimulation(prev => ({
          ...prev,
          trades: [...prev.trades.slice(-99), ...newTrades],
          totalPnL: prev.totalPnL + newTrades.reduce((sum, t) => sum + t.netProfit, 0),
          lockedFunds: [...prev.lockedFunds, ...newLocks],
        }));
      }

      setProcessedLiveIds(newProcessedIds);
    }
  }, [dataMode, simulation.isRunning, simulation.isPaused, liveOpportunities, processedLiveIds, processRealOpportunity, simulation.settlementDelayMs]);

  // Main simulation loop (Backtest mode)
  useEffect(() => {
    if (!simulation.isRunning || simulation.isPaused || dataMode === "live") {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
      return;
    }

    if (dataMode === "backtest") {
      // Backtest mode: replay historical data (no fund locking - instant settlement)
      const tickInterval = Math.max(100, 1000 / simulation.speed);

      simulationRef.current = window.setInterval(() => {
        setBacktestConfig(prev => {
          if (prev.currentIndex >= prev.data.length) {
            setSimulation(s => ({ ...s, isRunning: false }));
            setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] Backtest complete. Processed ${prev.data.length} opportunities.`]);
            return prev;
          }

          const opp = prev.data[prev.currentIndex];
          const result = processRealOpportunity(opp);

          if (result) {
            setSimulation(s => ({
              ...s,
              currentTime: result.trade.timestamp,
              trades: [...s.trades.slice(-99), result.trade],
              totalPnL: s.totalPnL + result.trade.netProfit,
              // No fund locking in backtest mode - instant settlement
            }));

            const logEntry = `[${new Date(result.trade.timestamp).toLocaleTimeString()}] BACKTEST ${result.trade.status.toUpperCase()}: ${result.trade.asset} | ${result.trade.buyExchange} → ${result.trade.sellExchange} | Net: $${result.trade.netProfit.toFixed(4)}`;
            setLogs(l => [...l.slice(-199), logEntry]);
          } else {
            setLogs(l => [...l.slice(-199), `[${new Date().toLocaleTimeString()}] BACKTEST SKIPPED: ${opp.asset} - Below spread threshold`]);
          }

          return { ...prev, currentIndex: prev.currentIndex + 1 };
        });
      }, tickInterval);
    }

    return () => {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
      }
    };
  }, [simulation.isRunning, simulation.isPaused, simulation.speed, dataMode, processRealOpportunity]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLivePolling();
    };
  }, [stopLivePolling]);

  // Restart polling when speed changes during live mode (only for REST mode)
  useEffect(() => {
    if (dataMode === "live" && simulation.isRunning && !simulation.isPaused && botConfig.connectionType === "rest") {
      stopLivePolling();
      startLivePolling();
    }
  }, [simulation.speed]);

  // Continuously update time in live mode to process fund unlocks
  useEffect(() => {
    if (dataMode === "live" && simulation.isRunning && !simulation.isPaused) {
      const timeUpdateInterval = window.setInterval(() => {
        setSimulation(prev => ({
          ...prev,
          currentTime: Date.now(),
        }));
        cleanupExpiredLocks();
      }, 100); // Update time every 100ms

      return () => clearInterval(timeUpdateInterval);
    }
  }, [dataMode, simulation.isRunning, simulation.isPaused, cleanupExpiredLocks]);

  const startSimulation = async () => {
    if (dataMode === "backtest" && backtestConfig.data.length === 0) {
      await loadBacktestData();
    }

    if (dataMode === "live") {
      lastLiveIdRef.current = 0;
      setProcessedLiveIds(new Set());
      setLiveOpportunities([]);
      startLivePolling();
    }

    setSimulation(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      startTime: Date.now(),
      currentTime: Date.now(),
      trades: [],
      totalPnL: 0,
      lockedFunds: [], // Clear all locked funds on restart
    }));

    if (dataMode === "backtest") {
      setBacktestConfig(prev => ({ ...prev, currentIndex: 0 }));
    }

    setLogs([`[${new Date().toLocaleTimeString()}] ${DATA_MODE_INFO[dataMode].title} simulation started with config: ${botConfig.name}`]);
  };

  const stopSimulation = () => {
    if (dataMode === "live") {
      stopLivePolling();
    }
    setSimulation(prev => ({ ...prev, isRunning: false, isPaused: false }));
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Simulation stopped. Total P/L: $${simulation.totalPnL.toFixed(4)}`]);
  };

  const togglePause = () => {
    setSimulation(prev => ({ ...prev, isPaused: !prev.isPaused }));
  };

  const setSpeed = (speed: number) => {
    setSimulation(prev => ({ ...prev, speed }));
  };

  const saveProfile = () => {
    const name = prompt("Enter profile name:", botConfig.name);
    if (name) {
      setSavedProfiles(prev => [...prev, { name, config: { ...botConfig, name } }]);
    }
  };

  const loadProfile = (profile: { name: string; config: BotConfig }) => {
    setBotConfig(profile.config);
  };

  const updateBotConfig = <K extends keyof BotConfig>(key: K, value: BotConfig[K]) => {
    setBotConfig(prev => ({ ...prev, [key]: value }));
  };

  const updateExchange = (index: number, updates: Partial<ExchangeConfig>) => {
    setExchanges(prev => prev.map((ex, i) => i === index ? { ...ex, ...updates } : ex));
  };

  // Calculate analytics
  const analytics = {
    totalTrades: simulation.trades.length,
    successfulTrades: simulation.trades.filter(t => t.status === "success").length,
    failedTrades: simulation.trades.filter(t => t.status === "failed" || t.status === "timeout").length,
    avgExecutionTime: simulation.trades.length > 0
      ? simulation.trades.reduce((a, b) => a + b.executionTimeMs, 0) / simulation.trades.length
      : 0,
    totalFees: simulation.trades.reduce((a, b) => a + b.fees, 0),
    totalSlippage: simulation.trades.reduce((a, b) => a + b.slippage, 0),
    sharpeRatio: simulation.trades.length > 5
      ? (simulation.totalPnL / simulation.trades.length) / (Math.sqrt(simulation.trades.map(t => t.netProfit).reduce((a, b) => a + Math.pow(b - simulation.totalPnL / simulation.trades.length, 2), 0) / simulation.trades.length) || 1)
      : 0,
    winRate: simulation.trades.length > 0
      ? (simulation.trades.filter(t => t.netProfit > 0).length / simulation.trades.length) * 100
      : 0,
  };

  return (
    <div className="advanced-mode">
      {/* Header */}
      <div className="advanced-header">
        <div className="header-left">
          <h1 className="advanced-title">
            Advanced Mode
          </h1>
          <span className="advanced-subtitle">Arbitrage Simulation Environment</span>
        </div>
        <div className="header-right">
          <div className="sim-time">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            {new Date(simulation.currentTime).toLocaleTimeString()}
          </div>
          {simulation.lockedFunds.length > 0 && (
            <div className="locked-funds-indicator" title={`${simulation.lockedFunds.length} active fund locks`}>
              <span className="lock-count">{simulation.lockedFunds.length}</span>
              <span className="lock-label">Locked</span>
            </div>
          )}
        </div>
      </div>

      {/* Data Mode Selector */}
      <div className="data-mode-selector">
        {(Object.keys(DATA_MODE_INFO) as DataMode[]).map(mode => (
          <button
            key={mode}
            className={`mode-card ${dataMode === mode ? "active" : ""} ${simulation.isRunning ? "disabled" : ""}`}
            onClick={() => !simulation.isRunning && setDataMode(mode)}
            disabled={simulation.isRunning}
            style={{ "--mode-color": DATA_MODE_INFO[mode].color } as React.CSSProperties}
          >
            <div className="mode-info">
              <span className="mode-title">{DATA_MODE_INFO[mode].title}</span>
              <span className="mode-desc">{DATA_MODE_INFO[mode].description}</span>
            </div>
            {dataMode === mode && <span className="mode-check">*</span>}
          </button>
        ))}
      </div>


      {/* Live Mode Status */}
      {dataMode === "live" && simulation.isRunning && (
        <div className="live-status-bar">
          <div className="live-indicator">
            <span className="live-dot" />
            LIVE
          </div>
          <span className="live-info">
            {botConfig.connectionType === "websocket"
              ? `SSE Stream (real-time push)`
              : `REST Polling (${Math.round(pollingInterval / simulation.speed)}ms)`
            } • Limit: {opportunityLimit} • {liveOpportunities.length} received • {processedLiveIds.size} processed
          </span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="advanced-tabs">
        <button
          className={`tab-btn ${activeTab === "builder" ? "active" : ""}`}
          onClick={() => setActiveTab("builder")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          Bot Builder
        </button>
        <button
          className={`tab-btn ${activeTab === "monitor" ? "active" : ""}`}
          onClick={() => setActiveTab("monitor")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          Live Monitor
        </button>
        <button
          className={`tab-btn ${activeTab === "analytics" ? "active" : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M18 20V10M12 20V4M6 20v-6"/>
          </svg>
          Analytics
        </button>
      </div>

      {/* Main Content */}
      <div className="advanced-content">
        {/* Left Panel - Exchanges */}
        <div className="panel exchange-panel">
          <div className="panel-header">
            <h3>Exchanges</h3>
            <span className="panel-badge">{exchanges.filter(e => e.connected).length} Active</span>
          </div>
          <div className="exchange-matrix">
            {exchanges.map((ex, idx) => (
              <div key={ex.name} className={`exchange-row ${ex.connected ? "connected" : "disconnected"}`}>
                <div className="exchange-info">
                  <span className={`status-dot ${ex.connected ? "connected" : "disconnected"}`} />
                  <span className="exchange-name">{ex.displayName}</span>
                  <span className="exchange-fee">{ex.takerFee}%</span>
                </div>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => updateExchange(idx, { connected: !ex.connected })}
                >
                  {ex.connected ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Center Panel - Tab Content */}
        <div className="panel main-panel">
          {activeTab === "builder" && (
            <div className="bot-builder">
              <div className="builder-header">
                <input
                  type="text"
                  className="strategy-name-input"
                  value={botConfig.name}
                  onChange={(e) => updateBotConfig("name", e.target.value)}
                  placeholder="Strategy Name"
                  disabled={simulation.isRunning}
                />
                <div className="builder-actions">
                  <button className="btn btn-secondary btn-sm" onClick={saveProfile} disabled={simulation.isRunning}>
                    Save Profile
                  </button>
                  <select
                    className="profile-select"
                    onChange={(e) => {
                      const profile = savedProfiles.find(p => p.name === e.target.value);
                      if (profile) loadProfile(profile);
                    }}
                    value=""
                    disabled={simulation.isRunning}
                  >
                    <option value="" disabled>Load Profile...</option>
                    {savedProfiles.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="module-grid">
                {/* Market Data Streamer */}
                <div className="module-card">
                  <div className="module-header">
                    <h4>Market Data Streamer</h4>
                  </div>
                  <div className="module-content">
                    <div className="form-group">
                      <label>Data Interval {dataMode === "live" && "(Live mode: real-time)"}</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={botConfig.dataInterval}
                          onChange={(e) => updateBotConfig("dataInterval", parseInt(e.target.value) || 50)}
                          disabled={simulation.isRunning}
                        />
                        <span>ms</span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Connection Type</label>
                      <div className="toggle-group">
                        <button
                          className={`toggle-btn ${botConfig.connectionType === "websocket" ? "active" : ""}`}
                          onClick={() => updateBotConfig("connectionType", "websocket")}
                          disabled={simulation.isRunning}
                        >
                          WebSocket
                        </button>
                        <button
                          className={`toggle-btn ${botConfig.connectionType === "rest" ? "active" : ""}`}
                          onClick={() => updateBotConfig("connectionType", "rest")}
                          disabled={simulation.isRunning}
                        >
                          REST
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Signal Engine */}
                <div className="module-card">
                  <div className="module-header">
                    <h4>Signal Engine</h4>
                  </div>
                  <div className="module-content">
                    <div className="form-group">
                      <label>Min Spread Threshold</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={botConfig.minSpreadThreshold}
                          onChange={(e) => updateBotConfig("minSpreadThreshold", parseFloat(e.target.value) || 0.1)}
                          disabled={simulation.isRunning}
                        />
                        <span>%</span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={botConfig.includeTransferFees}
                          onChange={(e) => updateBotConfig("includeTransferFees", e.target.checked)}
                          disabled={simulation.isRunning}
                        />
                        Include Transfer Fees
                      </label>
                    </div>
                    <div className="form-group">
                      <label>Slippage Assumption</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={botConfig.slippageAssumption}
                          onChange={(e) => updateBotConfig("slippageAssumption", parseFloat(e.target.value) || 0)}
                          disabled={simulation.isRunning}
                        />
                        <span>%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Execution Logic */}
                <div className="module-card">
                  <div className="module-header">
                    <h4>Execution Logic</h4>
                  </div>
                  <div className="module-content">
                    <div className="form-group">
                      <label>Order Type</label>
                      <div className="toggle-group">
                        <button
                          className={`toggle-btn ${botConfig.executionType === "market" ? "active" : ""}`}
                          onClick={() => updateBotConfig("executionType", "market")}
                          disabled={simulation.isRunning}
                        >
                          Market (Speed)
                        </button>
                        <button
                          className={`toggle-btn ${botConfig.executionType === "limit" ? "active" : ""}`}
                          onClick={() => updateBotConfig("executionType", "limit")}
                          disabled={simulation.isRunning}
                        >
                          Limit (Price)
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Max Balance %</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={botConfig.maxBalancePercent}
                          onChange={(e) => updateBotConfig("maxBalancePercent", parseInt(e.target.value) || 10)}
                          disabled={simulation.isRunning}
                        />
                        <span>%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Capital Allocation */}
                <div className="module-card capital-module">
                  <div className="module-header">
                    <h4>Capital Allocation</h4>
                    <span className="total-capital">
                      ${(exchanges.reduce((sum, ex) => sum + ex.balances.USDT + ex.balances.BTC * 42000 + ex.balances.ETH * 2200, 0) / 1000).toFixed(0)}k
                    </span>
                  </div>
                  <div className="module-content">
                    <div className="capital-editor">
                      {exchanges.map((ex, idx) => (
                        <div key={ex.name} className={`capital-edit-row ${!ex.connected ? "disabled" : ""}`}>
                          <div className="col-exchange">
                            <span className={`status-dot ${ex.connected ? "connected" : "disconnected"}`} />
                            {ex.displayName}
                          </div>
                          <div className="col-balance">
                            <input
                              type="text"
                              value={ex.balances.BTC}
                              onChange={(e) => updateExchange(idx, {
                                balances: { ...ex.balances, BTC: parseFloat(e.target.value) || 0 }
                              })}
                              disabled={simulation.isRunning}
                              title="BTC"
                            />
                          </div>
                          <div className="col-balance">
                            <input
                              type="text"
                              value={ex.balances.ETH}
                              onChange={(e) => updateExchange(idx, {
                                balances: { ...ex.balances, ETH: parseFloat(e.target.value) || 0 }
                              })}
                              disabled={simulation.isRunning}
                              title="ETH"
                            />
                          </div>
                          <div className="col-balance">
                            <input
                              type="text"
                              value={ex.balances.USDT}
                              onChange={(e) => updateExchange(idx, {
                                balances: { ...ex.balances, USDT: parseFloat(e.target.value) || 0 }
                              })}
                              disabled={simulation.isRunning}
                              title="USDT"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="capital-labels">
                      <span></span>
                      <span>BTC</span>
                      <span>ETH</span>
                      <span>USDT</span>
                    </div>
                  </div>
                </div>

                {/* Strategy Designer */}
                <div className="module-card">
                  <div className="module-header">
                    <h4>Strategy Designer</h4>
                  </div>
                  <div className="module-content">
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={botConfig.enableTriangular}
                          onChange={(e) => updateBotConfig("enableTriangular", e.target.checked)}
                          disabled={simulation.isRunning}
                        />
                        Enable Triangular Arbitrage
                      </label>
                    </div>
                    {botConfig.enableTriangular && (
                      <div className="form-group">
                        <label>Triangular Threshold</label>
                        <div className="input-with-suffix">
                          <input
                            type="text"
                            value={botConfig.triangularThreshold}
                            onChange={(e) => updateBotConfig("triangularThreshold", parseFloat(e.target.value) || 0.1)}
                            disabled={simulation.isRunning}
                          />
                          <span>%</span>
                        </div>
                      </div>
                    )}
                    <div className="strategy-preview">
                      <span className="preview-label">Active Rule:</span>
                      <code>
                        IF spread &gt; {botConfig.minSpreadThreshold}% AFTER fees
                        THEN execute up to {botConfig.maxBalancePercent}% balance
                      </code>
                    </div>
                  </div>
                </div>

                {/* Simulation Controls */}
                <div className="module-card simulation-controls">
                  <div className="module-header">
                    <h4>Simulation Controls</h4>
                  </div>
                  <div className="module-content">
                    <div className="form-group">
                      <label>Latency Model</label>
                      <select
                        value={simulation.latencyMode}
                        onChange={(e) => setSimulation(prev => ({ ...prev, latencyMode: e.target.value as SimulationState["latencyMode"] }))}
                        disabled={simulation.isRunning}
                      >
                        <option value="constant">Constant</option>
                        <option value="random">Random Jitter</option>
                        <option value="exchange-dependent">Exchange-Dependent</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Settlement Delay (Fund Lock)</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={simulation.settlementDelayMs / 1000}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 2;
                            // Allow 0 for instant settlement, otherwise minimum 2 seconds
                            const finalVal = val === 0 ? 0 : Math.max(2, val);
                            setSimulation(prev => ({
                              ...prev,
                              settlementDelayMs: finalVal * 1000
                            }));
                          }}
                          disabled={simulation.isRunning}
                        />
                        <span>sec</span>
                      </div>
                      <span className="hint">How long funds are locked after each trade (0 = instant, min: 2s)</span>
                    </div>
                    <div className="form-group">
                      <label>Opportunity Limit (per poll)</label>
                      <div className="input-with-suffix">
                        <input
                          type="text"
                          value={opportunityLimit}
                          onChange={(e) => setOpportunityLimit(parseInt(e.target.value) || 50)}
                          disabled={simulation.isRunning}
                        />
                        <span>opps</span>
                      </div>
                      <span className="hint">Max opportunities to fetch per poll cycle</span>
                    </div>
                    {dataMode === "live" && (
                      <div className="form-group">
                        <label>Polling Interval</label>
                        <div className="input-with-suffix">
                          <input
                            type="text"
                            value={pollingInterval}
                            onChange={(e) => setPollingInterval(parseInt(e.target.value) || 200)}
                            disabled={simulation.isRunning}
                          />
                          <span>ms</span>
                        </div>
                        <span className="hint">Lower = faster but more API calls</span>
                      </div>
                    )}
                    {dataMode === "backtest" && (
                      <div className="form-group">
                        <label>Backtest Event Limit</label>
                        <div className="input-with-suffix">
                          <input
                            type="text"
                            value={backtestLimit}
                            onChange={(e) => setBacktestLimit(parseInt(e.target.value) || 500)}
                            disabled={simulation.isRunning}
                          />
                          <span>events</span>
                        </div>
                        <span className="hint">Number of historical events to load (max 10,000)</span>
                      </div>
                    )}
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={simulation.stressTestEnabled}
                          onChange={(e) => setSimulation(prev => ({ ...prev, stressTestEnabled: e.target.checked }))}
                          disabled={simulation.isRunning}
                        />
                        Enable Stress Testing
                      </label>
                      <span className="hint">Inject failures, timeouts, flash crashes</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === "monitor" && (
            <div className="live-monitor">
              {/* Funds Breakdown */}
              <div className="funds-breakdown">
                <div className="funds-header">
                  <h4>Funds Status</h4>
                  <span className="funds-total">
                    Total: ${exchanges.reduce((sum, ex) => sum + ex.balances.USDT + ex.balances.BTC * 42000 + ex.balances.ETH * 2200, 0).toLocaleString()}
                  </span>
                </div>
                <div className="funds-grid">
                  {exchanges.filter(ex => ex.connected).map(ex => {
                    const lockedUSDT = simulation.lockedFunds
                      .filter(lf => lf.exchange === ex.name && lf.asset === "USDT" && lf.unlockAt > simulation.currentTime)
                      .reduce((sum, lf) => sum + lf.amount, 0);
                    const lockedBTC = simulation.lockedFunds
                      .filter(lf => lf.exchange === ex.name && lf.asset === "BTC" && lf.unlockAt > simulation.currentTime)
                      .reduce((sum, lf) => sum + lf.amount, 0);
                    const lockedETH = simulation.lockedFunds
                      .filter(lf => lf.exchange === ex.name && lf.asset === "ETH" && lf.unlockAt > simulation.currentTime)
                      .reduce((sum, lf) => sum + lf.amount, 0);

                    const availUSDT = ex.balances.USDT - lockedUSDT;
                    const availBTC = ex.balances.BTC - lockedBTC;
                    const availETH = ex.balances.ETH - lockedETH;

                    return (
                      <div key={ex.name} className="funds-exchange">
                        <div className="funds-exchange-name">{ex.displayName}</div>
                        <div className="funds-assets">
                          <div className="funds-asset">
                            <span className="asset-label">USDT</span>
                            <span className="asset-avail">{availUSDT.toFixed(0)}</span>
                            {lockedUSDT > 0 && <span className="asset-locked">({lockedUSDT.toFixed(0)} locked)</span>}
                          </div>
                          <div className="funds-asset">
                            <span className="asset-label">BTC</span>
                            <span className="asset-avail">{availBTC.toFixed(4)}</span>
                            {lockedBTC > 0 && <span className="asset-locked">({lockedBTC.toFixed(4)} locked)</span>}
                          </div>
                          <div className="funds-asset">
                            <span className="asset-label">ETH</span>
                            <span className="asset-avail">{availETH.toFixed(2)}</span>
                            {lockedETH > 0 && <span className="asset-locked">({lockedETH.toFixed(2)} locked)</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PnL Summary */}
              <div className="pnl-chart">
                <div className="chart-header">
                  <h4>Cumulative P/L</h4>
                  <span className={`pnl-value ${simulation.totalPnL >= 0 ? "positive" : "negative"}`}>
                    ${simulation.totalPnL.toFixed(4)}
                  </span>
                </div>
                <div className="chart-area">
                  {simulation.trades.length === 0 ? (
                    <div className="chart-empty">Start simulation to see P/L chart</div>
                  ) : (
                    <div className="mini-chart">
                      {simulation.trades.slice(-50).map((trade, idx) => {
                        const cumPnL = simulation.trades.slice(0, simulation.trades.indexOf(trade) + 1).reduce((a, b) => a + b.netProfit, 0);
                        const maxPnL = Math.max(...simulation.trades.map((_, i) => simulation.trades.slice(0, i + 1).reduce((a, b) => a + b.netProfit, 0)));
                        const minPnL = Math.min(...simulation.trades.map((_, i) => simulation.trades.slice(0, i + 1).reduce((a, b) => a + b.netProfit, 0)));
                        const range = Math.max(maxPnL - minPnL, 1);
                        const height = ((cumPnL - minPnL) / range) * 100;
                        return (
                          <div
                            key={idx}
                            className={`chart-bar ${trade.netProfit >= 0 ? "positive" : "negative"}`}
                            style={{ height: `${Math.max(5, height)}%` }}
                            title={`$${cumPnL.toFixed(4)}`}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Trade Feed */}
              <div className="trade-feed">
                <div className="feed-header">
                  <h4>Executed Trades</h4>
                  <span className="trade-count">{simulation.trades.length} trades</span>
                </div>
                <div className="feed-content">
                  {simulation.trades.slice(-20).reverse().map(trade => (
                    <div
                      key={trade.id}
                      className={`trade-entry ${trade.status}`}
                      onClick={() => setSelectedTrade(trade)}
                    >
                      <div className="trade-time">
                        {new Date(trade.timestamp).toLocaleTimeString()}
                      </div>
                      <div className="trade-route">
                        <span className="badge">{trade.buyExchange}</span>
                        <span className="arrow">→</span>
                        <span className="badge">{trade.sellExchange}</span>
                      </div>
                      <div className="trade-asset">{trade.asset}</div>
                      <div className="trade-size">
                        <span className="size-amount">{trade.amount.toFixed(6)}</span>
                        <span className="size-value">${(trade.amount * trade.buyPrice).toFixed(0)}</span>
                      </div>
                      <div className={`trade-profit ${trade.netProfit >= 0 ? "positive" : "negative"}`}>
                        ${trade.netProfit.toFixed(4)}
                      </div>
                      <div className={`trade-status ${trade.status}`}>
                        {trade.status === "success" ? "OK" : trade.status === "partial" ? "PT" : "X"}
                      </div>
                    </div>
                  ))}
                  {simulation.trades.length === 0 && (
                    <div className="feed-empty">No trades yet. Start simulation to begin.</div>
                  )}
                </div>
              </div>

              {/* Real-time Logs */}
              <div className="log-panel">
                <div className="log-header">
                  <h4>System Logs</h4>
                  <button className="btn btn-ghost btn-sm" onClick={() => setLogs([])}>Clear</button>
                </div>
                <div className="log-content">
                  {logs.map((log, idx) => (
                    <div key={idx} className={`log-entry ${log.includes("SUCCESS") ? "success" : log.includes("FAILED") || log.includes("TIMEOUT") || log.includes("ERROR") ? "error" : ""}`}>
                      {log}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="analytics-panel">
              <div className="analytics-grid">
                <div className="analytics-card">
                  <span className="analytics-value">{dataMode === "backtest" ? backtestConfig.data.length : liveOpportunities.length}</span>
                  <span className="analytics-label">Opportunities</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value">{analytics.totalTrades}</span>
                  <span className="analytics-label">Total Trades</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value green">{analytics.successfulTrades}</span>
                  <span className="analytics-label">Successful</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value red">{analytics.failedTrades}</span>
                  <span className="analytics-label">Failed</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value">{analytics.winRate.toFixed(1)}%</span>
                  <span className="analytics-label">Win Rate</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value">{analytics.avgExecutionTime.toFixed(0)}ms</span>
                  <span className="analytics-label">Avg Latency</span>
                </div>
                <div className="analytics-card">
                  <span className="analytics-value">{analytics.sharpeRatio.toFixed(2)}</span>
                  <span className="analytics-label">Sharpe Ratio</span>
                </div>
              </div>

              <div className="analytics-breakdown">
                <h4>Cost Breakdown</h4>
                <div className="breakdown-bars">
                  <div className="breakdown-item">
                    <span className="breakdown-label">Trading Fees</span>
                    <div className="breakdown-bar">
                      <div className="breakdown-fill fees" style={{ width: `${Math.min(100, (analytics.totalFees / (Math.abs(simulation.totalPnL) || 1)) * 100)}%` }} />
                    </div>
                    <span className="breakdown-value">${analytics.totalFees.toFixed(4)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="breakdown-label">Slippage</span>
                    <div className="breakdown-bar">
                      <div className="breakdown-fill slippage" style={{ width: `${Math.min(100, (analytics.totalSlippage / (Math.abs(simulation.totalPnL) || 1)) * 100)}%` }} />
                    </div>
                    <span className="breakdown-value">${analytics.totalSlippage.toFixed(4)}</span>
                  </div>
                </div>
              </div>

              <div className="analytics-sensitivity">
                <h4>Data Mode Analysis</h4>
                <p className="sensitivity-note">
                  <strong>Current mode: {DATA_MODE_INFO[dataMode].title}</strong><br/>
                  {dataMode === "backtest" && `Replaying ${backtestConfig.data.length} historical opportunities. Progress: ${backtestConfig.currentIndex}/${backtestConfig.data.length}`}
                  {dataMode === "live" && `Real-time paper trading with actual market data. ${liveOpportunities.length} opportunities received.`}
                </p>
              </div>

              {/* Real opportunities from API */}
              {realOpportunities && realOpportunities.length > 0 && (
                <div className="real-opportunities">
                  <h4>Real Market Opportunities (Click for Details)</h4>
                  <div className="real-opp-list">
                    {realOpportunities.slice(0, 5).map(opp => (
                      <div
                        key={opp.id}
                        className="real-opp-item"
                        onClick={() => setSelectedOpportunity(opp)}
                      >
                        <span className="opp-asset">{opp.asset}</span>
                        <span className="opp-route">{opp.buy_exchange_name} → {opp.sell_exchange_name}</span>
                        <span className={`opp-spread ${parseFloat(opp.spread_pct) > 0.3 ? "high" : ""}`}>
                          {parseFloat(opp.spread_pct).toFixed(3)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel - Controls & Status */}
        <div className="panel control-panel">
          <div className="panel-header">
            <h3>Simulation Control</h3>
          </div>

          <div className="active-mode-display">
            <span className="mode-badge" style={{ background: DATA_MODE_INFO[dataMode].color }}>
              {DATA_MODE_INFO[dataMode].title}
            </span>
          </div>

          <div className="control-buttons">
            {!simulation.isRunning ? (
              <button
                className="btn btn-primary btn-lg full-width"
                onClick={startSimulation}
                disabled={isLoadingBacktest}
              >
                {isLoadingBacktest ? (
                  <>
                    <div className="spinner small" />
                    Loading Data...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <polygon points="5,3 19,12 5,21"/>
                    </svg>
                    Start {DATA_MODE_INFO[dataMode].title}
                  </>
                )}
              </button>
            ) : (
              <>
                <button className="btn btn-stop btn-lg" onClick={stopSimulation}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                  Stop
                </button>
                {dataMode !== "live" && (
                  <button className={`btn ${simulation.isPaused ? "btn-primary" : "btn-secondary"}`} onClick={togglePause}>
                    {simulation.isPaused ? "▶ Resume" : "⏸ Pause"}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="speed-control">
            <span className="speed-label">Playback Speed</span>
            <div className="speed-buttons">
              {[1, 5, 10, 50, 100].map(s => (
                <button
                  key={s}
                  className={`speed-btn ${simulation.speed === s ? "active" : ""}`}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
            {dataMode === "live" && (
              <p className="hint" style={{ marginTop: "0.5rem" }}>
                {botConfig.connectionType === "websocket"
                  ? "SSE mode: Real-time push (speed affects processing only)"
                  : `REST mode: Polling at ${Math.round(pollingInterval / simulation.speed)}ms intervals`
                }
              </p>
            )}
          </div>

          <div className="live-stats">
            <div className="stat-row">
              <span className="stat-label">Total P/L</span>
              <span className={`stat-value ${simulation.totalPnL >= 0 ? "positive" : "negative"}`}>
                ${simulation.totalPnL.toFixed(4)}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Trades</span>
              <span className="stat-value">{simulation.trades.length}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Win Rate</span>
              <span className="stat-value">{analytics.winRate.toFixed(1)}%</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Avg Latency</span>
              <span className="stat-value">{analytics.avgExecutionTime.toFixed(0)}ms</span>
            </div>
          </div>

        </div>
      </div>

      {/* Trade Detail Modal */}
      {selectedTrade && (
        <div className="modal-overlay" onClick={() => setSelectedTrade(null)}>
          <div className="modal-content trade-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Trade Details</h2>
              <button className="modal-close" onClick={() => setSelectedTrade(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Timestamp</span>
                  <span className="detail-value">{new Date(selectedTrade.timestamp).toLocaleString()}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Type</span>
                  <span className="detail-value">{selectedTrade.type}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Asset</span>
                  <span className="detail-value">{selectedTrade.asset}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Status</span>
                  <span className={`detail-value ${selectedTrade.status}`}>{selectedTrade.status}</span>
                </div>
              </div>
              <div className="detail-section">
                <h4>Route</h4>
                <div className="route-detail">
                  <div className="route-side">
                    <span className="side-label">BUY</span>
                    <span className="exchange">{selectedTrade.buyExchange}</span>
                    <span className="price">${selectedTrade.buyPrice.toFixed(2)}</span>
                  </div>
                  <div className="route-arrow">→</div>
                  <div className="route-side">
                    <span className="side-label">SELL</span>
                    <span className="exchange">{selectedTrade.sellExchange}</span>
                    <span className="price">${selectedTrade.sellPrice.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="detail-section">
                <h4>Financials</h4>
                <div className="financial-breakdown">
                  <div className="fin-row">
                    <span>Amount</span>
                    <span>{selectedTrade.amount.toFixed(8)} {selectedTrade.asset}</span>
                  </div>
                  <div className="fin-row">
                    <span>Gross Profit</span>
                    <span className="positive">${selectedTrade.grossProfit.toFixed(6)}</span>
                  </div>
                  <div className="fin-row">
                    <span>Fees</span>
                    <span className="negative">-${selectedTrade.fees.toFixed(6)}</span>
                  </div>
                  <div className="fin-row">
                    <span>Slippage</span>
                    <span className="negative">-${selectedTrade.slippage.toFixed(6)}</span>
                  </div>
                  <div className="fin-row">
                    <span>Latency Cost</span>
                    <span className="negative">-${selectedTrade.latencyCost.toFixed(6)}</span>
                  </div>
                  <div className="fin-row total">
                    <span>Net Profit</span>
                    <span className={selectedTrade.netProfit >= 0 ? "positive" : "negative"}>
                      ${selectedTrade.netProfit.toFixed(6)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="detail-section">
                <h4>Execution</h4>
                <div className="execution-detail">
                  <span>Execution Time: <strong>{selectedTrade.executionTimeMs}ms</strong></span>
                  {selectedTrade.sourceOpportunityId && (
                    <span style={{ marginLeft: "1rem" }}>Source ID: <strong>#{selectedTrade.sourceOpportunityId}</strong></span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real Opportunity Detail Modal */}
      {selectedOpportunity && (
        <TradeDetailModal
          opportunity={selectedOpportunity}
          onClose={() => setSelectedOpportunity(null)}
        />
      )}
    </div>
  );
}
```
