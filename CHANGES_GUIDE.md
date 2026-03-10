# Changes Guide — Post-Commit 886739e8

> **15-step implementation guide** for all changes made after the last push.
> Split evenly between **Person A** (Steps 1, 3, 5, 7, 9, 11, 13, 15) and **Person B** (Steps 2, 4, 6, 8, 10, 12, 14).
> Each person has a mix of frontend and backend tasks, and a mix of difficulty levels.

---

## Summary of Assignment

| Person | Steps | Focus Areas |
|--------|-------|-------------|
| **A** | 1, 3, 5, 7, 9, 11, 13, 15 | requirements · models expansion · serializers · ML services · App.tsx · Stats · SpreadChart · Kraken + VPS |
| **B** | 2, 4, 6, 8, 10, 12, 14 | new models · migrations · views + urls · docker · client.ts · Dashboard · new frontend pages |

---

---

## STEP 1 — Person A · Backend · Easy
### Add ML Dependencies to `requirements.txt`

**File:** `src/middleware/requirements.txt`

Open the file. After the last existing line (`python-dotenv==1.0.0`), **add** the following block:

```
# ML dependencies
numpy>=1.26,<2.0
pandas>=2.1,<3.0
scikit-learn>=1.3,<1.4
scipy>=1.12,<2.0
hmmlearn>=0.3.2,<0.4
scikit-optimize==0.9.0
joblib>=1.3,<2.0
```

The final file should look like:

```
djangorestframework==3.15.1
django-cors-headers==4.3.1
django-filter==23.5
psycopg2-binary==2.9.9
python-dotenv==1.0.0

# ML dependencies
numpy>=1.26,<2.0
pandas>=2.1,<3.0
scikit-learn>=1.3,<1.4
scipy>=1.12,<2.0
hmmlearn>=0.3.2,<0.4
scikit-optimize==0.9.0
joblib>=1.3,<2.0
```

---

---

## STEP 2 — Person B · Backend · Hard
### Add 7 New Django Models to `models.py`

**File:** `src/middleware/api/models.py`

After the `SimulationLog` class (currently ends around line 152), **add** the following new model classes. Paste them in order at the end of the file:

```python
# ---------------------------------------------------------------------------
# Fee tier snapshots — daily scrape of maker/taker fees per exchange
# ---------------------------------------------------------------------------

class FeeTierSnapshot(models.Model):
    exchange            = models.ForeignKey(Exchange, on_delete=models.CASCADE, related_name="fee_tier_snapshots")
    recorded_at         = models.DateTimeField(auto_now_add=True, db_index=True)
    volume_30d_usd      = models.DecimalField(max_digits=30, decimal_places=2, null=True, blank=True)
    maker_fee           = models.DecimalField(max_digits=8, decimal_places=6)
    taker_fee           = models.DecimalField(max_digits=8, decimal_places=6)
    tier_label          = models.CharField(max_length=50, blank=True)
    native_discount     = models.BooleanField(default=False, help_text="True if fees paid in native token at a discount")
    native_discount_pct = models.FloatField(default=0.0, help_text="Discount pct when paying in native token (e.g. BNB)")

    class Meta:
        indexes = [models.Index(fields=["exchange", "recorded_at"])]

    def __str__(self):
        return f"{self.exchange.name} tier @ {self.recorded_at:%Y-%m-%d}: maker={self.maker_fee} taker={self.taker_fee}"


# ---------------------------------------------------------------------------
# Exchange clock drift — periodic NTP offset vs VPS clock
# ---------------------------------------------------------------------------

class ExchangeClockDrift(models.Model):
    exchange         = models.ForeignKey(Exchange, on_delete=models.CASCADE, related_name="clock_drift_logs")
    measured_at      = models.DateTimeField(db_index=True)
    vps_time_ns      = models.BigIntegerField(help_text="VPS wall clock at request send (nanoseconds since epoch)")
    exchange_time_ms = models.BigIntegerField(help_text="Exchange reported server time (ms since epoch)")
    offset_ms        = models.FloatField(help_text="exchange_time - vps_time in ms; positive = exchange clock ahead")
    round_trip_ms    = models.FloatField(help_text="RTT of the time API call (used to halve the offset estimate)")

    class Meta:
        indexes = [models.Index(fields=["exchange", "measured_at"])]

    def __str__(self):
        return f"{self.exchange.name} drift={self.offset_ms:.1f}ms @ {self.measured_at}"


# ---------------------------------------------------------------------------
# Order RTT measurements — echo-test latency to exchange order endpoints
# ---------------------------------------------------------------------------

class OrderRttMeasurement(models.Model):
    exchange    = models.ForeignKey(Exchange, on_delete=models.CASCADE, related_name="order_rtt_logs")
    measured_at = models.DateTimeField(db_index=True)
    endpoint    = models.CharField(max_length=200)
    send_ns     = models.BigIntegerField()
    ack_ns      = models.BigIntegerField()
    rtt_ms      = models.FloatField()
    http_status = models.IntegerField(null=True, blank=True)
    notes       = models.CharField(max_length=200, blank=True)

    class Meta:
        indexes = [models.Index(fields=["exchange", "measured_at"])]

    def __str__(self):
        return f"{self.exchange.name} order RTT={self.rtt_ms:.1f}ms @ {self.measured_at}"


# ---------------------------------------------------------------------------
# Cloudflare Worker latency probes
# One row per Worker execution — REST ping latency + bid/ask per exchange per PoP
# ---------------------------------------------------------------------------

class LatencyProbe(models.Model):
    collected_at   = models.DateTimeField(db_index=True)
    cf_colo        = models.CharField(max_length=10, db_index=True)
    cf_country     = models.CharField(max_length=5,   blank=True)
    cf_city        = models.CharField(max_length=100, blank=True)
    cf_region      = models.CharField(max_length=100, blank=True)
    cf_latitude    = models.FloatField(null=True, blank=True)
    cf_longitude   = models.FloatField(null=True, blank=True)
    cf_timezone    = models.CharField(max_length=50,  blank=True)
    cf_asn         = models.BigIntegerField(null=True, blank=True)
    worker_version = models.CharField(max_length=20,  blank=True)

    # { "binance": { "rest_ping_ms": 12.4, "ping_ok": true,
    #                "ticker_rtt_ms": 18.1, "bid": 65000.1, "ask": 65001.2,
    #                "bid_qty": 0.5, "ask_qty": 0.3,
    #                "spread_abs": 1.1, "spread_bps": 0.017, "mid_price": 65000.65 } }
    exchange_metrics = models.JSONField(default=dict)

    class Meta:
        indexes = [
            models.Index(fields=["collected_at"]),
            models.Index(fields=["cf_colo", "collected_at"]),
        ]

    def __str__(self):
        return f"Probe {self.cf_colo} @ {self.collected_at}"


# ---------------------------------------------------------------------------
# ML — User-saved strategy presets
# ---------------------------------------------------------------------------

class UserStrategy(models.Model):
    name = models.CharField(max_length=200)
    parameters = models.JSONField()           # BotConfig-compatible shape from frontend
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"UserStrategy({self.name})"


# ---------------------------------------------------------------------------
# ML — Nightly Bayesian-optimised strategy (Prong 1)
# ---------------------------------------------------------------------------

class OptimisedStrategy(models.Model):
    regime_label = models.CharField(max_length=50)       # "low_vol" | "high_vol" | "trending" | "unknown"
    regime_confidence = models.FloatField()
    parameters = models.JSONField()                      # BotConfig-compatible optimal params
    expected_hit_rate = models.FloatField()
    ci_low = models.FloatField()                         # 95% CI lower bound from GP posterior
    ci_high = models.FloatField()
    sample_size = models.PositiveIntegerField()
    generated_at = models.DateTimeField(auto_now_add=True)
    is_current = models.BooleanField(default=False, db_index=True)
    data_source = models.CharField(
        max_length=30,
        choices=SimulationLog.DATA_SOURCE_CHOICES,
        default=SimulationLog.DATA_SOURCE_LIVE_ENGINE,
        db_index=True,
    )

    class Meta:
        ordering = ["-generated_at"]

    def __str__(self):
        return f"OptimisedStrategy(regime={self.regime_label}, hit_rate={self.expected_hit_rate:.3f})"


# ---------------------------------------------------------------------------
# ML — Advisory insight for a user strategy (Prong 2)
# ---------------------------------------------------------------------------

class StrategyInsight(models.Model):
    strategy = models.ForeignKey(UserStrategy, on_delete=models.CASCADE, related_name="insights")
    generated_at = models.DateTimeField(auto_now_add=True)

    hit_rate_in_sample = models.FloatField()
    hit_rate_out_of_sample = models.FloatField()         # walk-forward TimeSeriesSplit result
    overfitting_flag = models.BooleanField(default=False)  # True if gap > 0.15

    # Permutation importance per feature present in strategy
    condition_importances = models.JSONField()
    # Per-field isotonic regression inflection + z-test result
    threshold_suggestions = models.JSONField()
    # Fields NOT in strategy ranked by mutual information with profitability
    gap_suggestions = models.JSONField()

    vs_optimised_delta_hit_rate = models.FloatField(null=True, blank=True)
    vs_optimised_delta_profit = models.DecimalField(
        max_digits=20, decimal_places=10, null=True, blank=True
    )

    class Meta:
        ordering = ["-generated_at"]
        get_latest_by = "generated_at"

    def __str__(self):
        return f"StrategyInsight(strategy={self.strategy_id}, in={self.hit_rate_in_sample:.2f}, oos={self.hit_rate_out_of_sample:.2f})"
```

---

---

## STEP 3 — Person A · Backend · Hard
### Expand `Exchange` and `PriceSnapshot` Models + Add `data_source` to `SimulationLog`

**File:** `src/middleware/api/models.py`

**3a. Expand `Exchange` model** (lines 5–22): After `taker_fee` on line 10 (before `is_active`), **add** these 4 new fields:

```python
    # Real trading config — used by platform backtest engine when querying VPS data
    min_order_qty = models.DecimalField(max_digits=20, decimal_places=10, default=Decimal("0.00001"))
    lot_size = models.DecimalField(max_digits=20, decimal_places=10, default=Decimal("0.00001"))
    withdrawal_fee_base = models.DecimalField(max_digits=20, decimal_places=10, default=Decimal("0"))
    withdrawal_processing_time_seconds = models.PositiveIntegerField(
        default=600,
        help_text="Estimated withdrawal processing time in seconds (exchange-specific, manually seeded)"
    )
```

**3b. Expand `PriceSnapshot` model** (lines 38–93): After the `timestamp` field and before the `class Meta:`, **add** these new field groups:

```python
    # Timestamps
    timestamp_exchange = models.DateTimeField(null=True, blank=True)
    vps_received_at_ns = models.BigIntegerField(null=True, blank=True)
    ws_message_delay_ms = models.FloatField(null=True, blank=True)

    # Derived price metrics
    mid_price = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    spread_abs = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    spread_bps = models.FloatField(null=True, blank=True)

    # L2 order book depth
    bids_l2 = models.JSONField(null=True, blank=True)
    asks_l2 = models.JSONField(null=True, blank=True)
    bid_depth_5bps = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    ask_depth_5bps = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    bid_depth_10bps = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    ask_depth_10bps = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    order_book_imbalance = models.FloatField(null=True, blank=True)
    weighted_mid_price = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)

    # Last trade
    last_trade_price = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    last_trade_qty = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    last_trade_side = models.CharField(max_length=4, null=True, blank=True)

    # Volume / VWAP
    volume_24h = models.DecimalField(max_digits=30, decimal_places=10, null=True, blank=True)
    vwap_24h = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    num_trades_1m = models.PositiveIntegerField(null=True, blank=True)

    # Data quality
    sequence_num = models.BigIntegerField(null=True, blank=True)
    is_stale = models.BooleanField(default=False)
    data_source = models.CharField(max_length=200, default="ws_ticker")
```

**3c. Add `data_source` field to `SimulationLog`** (around line 120): At the top of the `SimulationLog` class body, **add** the constants and then a new `data_source` field after `spread_pct`:

```python
class SimulationLog(models.Model):
    DATA_SOURCE_LIVE_ENGINE   = "live_engine"
    DATA_SOURCE_BACKTEST_LOCAL  = "backtest_local"
    DATA_SOURCE_BACKTEST_REMOTE = "backtest_remote"
    DATA_SOURCE_CHOICES = [
        (DATA_SOURCE_LIVE_ENGINE,     "Live Engine"),
        (DATA_SOURCE_BACKTEST_LOCAL,  "Backtest — Local API"),
        (DATA_SOURCE_BACKTEST_REMOTE, "Backtest — Remote VPS"),
    ]

    # ... existing fields ...
    data_source = models.CharField(
        max_length=30, choices=DATA_SOURCE_CHOICES,
        default=DATA_SOURCE_LIVE_ENGINE, db_index=True,
    )
```

---

---

## STEP 4 — Person B · Backend · Easy
### Create and Apply Database Migrations 0004–0010

**Files to create** inside `src/middleware/api/migrations/`:

Create the following 7 migration files in order. Each one builds on the previous. Run them in sequence after creating each file.

**Migration 0004** — `0004_latencyprobe_backtestjob_backtesttrade.py`: Creates `LatencyProbe`, `BacktestJob`, and `BacktestTrade` models.

**Migration 0005** — `0005_pricesnapshot_verbose_fields.py`: Adds all the new `PriceSnapshot` verbose fields (timestamp_exchange, vps_received_at_ns, spread_bps, bids_l2, etc.).

**Migration 0006** — `0006_settlement_feetier_clockdrift_orderrtt.py`: Creates `FeeTierSnapshot`, `ExchangeClockDrift`, and `OrderRttMeasurement` models.

**Migration 0007** — `0007_seed_settlement_times.py`: Data migration — seeds settlement times for existing exchanges.

**Migration 0008** — `0008_add_engine_detected_at.py`: Adds `engine_detected_at` field to `ArbitrageEvent`.

**Migration 0009** — `0009_userstrategy_optimisedstrategy_strategyinsight.py`: Creates `UserStrategy`, `OptimisedStrategy`, and `StrategyInsight` models.

**Migration 0010** — `0010_data_source_fields.py`: Adds `data_source` field to `PriceSnapshot` and `SimulationLog`.

To generate all migrations automatically (after completing Steps 2 and 3), run:

```bash
cd src/middleware
python manage.py makemigrations api
python manage.py migrate
```

This will detect all model changes from Steps 2 and 3 and generate the correct migration files automatically.

---

---

## STEP 5 — Person A · Backend · Medium
### Update `serializers.py` — New Imports, PriceSnapshot `__all__`, and New Serializer Classes

**File:** `src/middleware/api/serializers.py`

**5a. Replace the import block** at lines 1–3:

**Delete:**
```python
from .models import Exchange, PriceSnapshot, ArbitrageEvent
```

**Add:**
```python
from .models import (
    ArbitrageEvent,
    Exchange,
    LatencyProbe,
    OptimisedStrategy,
    PriceSnapshot,
    StrategyInsight,
    UserStrategy,
)
```

**5b. Update `ExchangeSerializer`** — add 3 new fields to the `fields` list (after `taker_fee`, before `is_active`):

```python
            "min_order_qty",
            "lot_size",
            "withdrawal_fee_base",
```

**5c. Update `PriceSnapshotSerializer`** — replace the explicit `fields` list with `__all__` and add `exchange_name`:

**Delete this block:**
```python
class PriceSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceSnapshot
        fields = [
            "exchange",
            "asset",
            "bid",
            "ask",
            "bid_qty",
            "ask_qty",
            "timestamp",
        ]
```

**Add:**
```python
class PriceSnapshotSerializer(serializers.ModelSerializer):
    exchange_name = serializers.CharField(source="exchange.name", read_only=True)

    class Meta:
        model = PriceSnapshot
        fields = "__all__"
```

**5d. Add computed fields to `ArbitrageEventSerializer`** — add 4 fields after `total_fees` (around line 67):

```python
    spread_absolute = serializers.SerializerMethodField()
    buy_qty_available = serializers.SerializerMethodField()
    sell_qty_available = serializers.SerializerMethodField()
    simulated_at = serializers.SerializerMethodField()
```

And add their method implementations (returning `None` or computed values as appropriate):

```python
    def get_spread_absolute(self, obj):
        return None

    def get_buy_qty_available(self, obj):
        return float(obj.buy_qty) if obj.buy_qty else None

    def get_sell_qty_available(self, obj):
        return float(obj.sell_qty) if obj.sell_qty else None

    def get_simulated_at(self, obj):
        logs = obj.simulation_logs.order_by("-id").first()
        return logs.created_at.isoformat() if logs else None
```

**5e. Append the three new serializer classes** at the end of the file:

```python
# ---------------------------------------------------------------------------
# Latency Probe — Cloudflare Worker ingest + query
# ---------------------------------------------------------------------------

class LatencyProbeIngestSerializer(serializers.Serializer):
    collected_at     = serializers.DateTimeField()
    cf_colo          = serializers.CharField(max_length=10)
    cf_country       = serializers.CharField(max_length=5,   required=False, default="")
    cf_city          = serializers.CharField(max_length=100, required=False, default="")
    cf_region        = serializers.CharField(max_length=100, required=False, default="")
    cf_latitude      = serializers.FloatField(required=False, allow_null=True, default=None)
    cf_longitude     = serializers.FloatField(required=False, allow_null=True, default=None)
    cf_timezone      = serializers.CharField(max_length=50,  required=False, default="")
    cf_asn           = serializers.IntegerField(required=False, allow_null=True, default=None)
    worker_version   = serializers.CharField(max_length=20,  required=False, default="")
    exchange_metrics = serializers.DictField(required=False, default=dict)


class LatencyProbeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LatencyProbe
        fields = "__all__"


# ---------------------------------------------------------------------------
# ML — User strategy, optimised strategy, insight
# ---------------------------------------------------------------------------

class UserStrategySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserStrategy
        fields = "__all__"


class OptimisedStrategySerializer(serializers.ModelSerializer):
    class Meta:
        model = OptimisedStrategy
        fields = "__all__"


class StrategyInsightSerializer(serializers.ModelSerializer):
    class Meta:
        model = StrategyInsight
        fields = "__all__"
```

---

---

## STEP 6 — Person B · Backend · Hard
### Add New ViewSets to `views.py` and Register Routes in `urls.py`

**File A:** `src/middleware/api/views.py`

**6a.** Update the import on line 19 — **delete:**
```python
from .models import ArbitrageEvent, Exchange, ExchangeStatus, PriceSnapshot, SimulationLog
```
**Add:**
```python
import os

from .models import ArbitrageEvent, Exchange, ExchangeStatus, LatencyProbe, OptimisedStrategy, PriceSnapshot, SimulationLog, StrategyInsight, UserStrategy
```

**6b.** Add the new serializer imports to the existing import block:

```python
    LatencyProbeIngestSerializer,
    LatencyProbeSerializer,
    OptimisedStrategySerializer,
    StrategyInsightSerializer,
    UserStrategySerializer,
```

**6c.** Add 2 new actions to `PriceSnapshotViewSet` — paste after the existing actions inside the class:

```python
    @action(detail=False, methods=["get"])
    def backtest_data(self, request):
        from django.db.models import Count
        qs = PriceSnapshot.objects.select_related("exchange").order_by("timestamp")
        start = request.query_params.get("start")
        end = request.query_params.get("end")
        exchanges_param = request.query_params.get("exchanges", "")
        assets_param = request.query_params.get("assets", "")
        min_spread_bps = request.query_params.get("min_spread_bps")
        try:
            limit = min(int(request.query_params.get("limit", 5000)), 50000)
        except (TypeError, ValueError):
            limit = 5000
        if start:
            try: qs = qs.filter(timestamp__gte=start)
            except Exception: pass
        if end:
            try: qs = qs.filter(timestamp__lte=end)
            except Exception: pass
        if exchanges_param:
            names = [n.strip().lower() for n in exchanges_param.split(",") if n.strip()]
            if names: qs = qs.filter(exchange__name__in=names)
        if assets_param:
            assets = [a.strip() for a in assets_param.split(",") if a.strip()]
            if assets: qs = qs.filter(asset__in=assets)
        if min_spread_bps:
            try: qs = qs.filter(spread_bps__gte=float(min_spread_bps))
            except (TypeError, ValueError): pass
        rows = list(qs[:limit])
        return Response({"count": len(rows), "snapshots": PriceSnapshotSerializer(rows, many=True).data})

    @action(detail=False, methods=["get"])
    def backtest_metadata(self, request):
        from django.db import connection
        from django.core.cache import cache
        cached = cache.get("backtest_metadata")
        if cached is not None:
            return Response(cached)
        with connection.cursor() as cur:
            cur.execute("""
                SELECT
                    (SELECT reltuples::bigint FROM pg_class WHERE relname = 'api_pricesnapshot') AS approx_total,
                    (SELECT MIN(timestamp) FROM api_pricesnapshot) AS earliest,
                    (SELECT MAX(timestamp) FROM api_pricesnapshot) AS latest
            """)
            row = cur.fetchone()
            approx_total, earliest, latest = row
            if not approx_total:
                return Response({"total_snapshots": 0, "exchanges": [], "assets": [], "date_range": None})
            cur.execute("""
                SELECT e.name, e.display_name, COUNT(p.id) AS cnt
                FROM api_pricesnapshot p
                JOIN api_exchange e ON e.id = p.exchange_id
                GROUP BY e.id, e.name, e.display_name ORDER BY cnt DESC
            """)
            exchange_rows = cur.fetchall()
            cur.execute("""
                SELECT asset, COUNT(*) AS cnt FROM api_pricesnapshot GROUP BY asset ORDER BY cnt DESC
            """)
            asset_rows = cur.fetchall()
        result = {
            "total_snapshots": int(approx_total),
            "date_range": {"earliest": earliest.isoformat() if earliest else None, "latest": latest.isoformat() if latest else None},
            "exchanges": [{"name": r[0], "display_name": r[1], "count": r[2]} for r in exchange_rows],
            "assets": [{"asset": r[0], "count": r[1]} for r in asset_rows],
        }
        cache.set("backtest_metadata", result, 120)
        return Response(result)
```

**6d.** Append 3 new ViewSet classes after the last existing ViewSet:

```python
class LatencyProbeViewSet(ReadOnlyModelViewSet):
    queryset = LatencyProbe.objects.all().order_by("-collected_at")
    serializer_class = LatencyProbeSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        cf_colo = self.request.query_params.get("cf_colo")
        cf_country = self.request.query_params.get("cf_country")
        if cf_colo:
            qs = qs.filter(cf_colo__iexact=cf_colo)
        if cf_country:
            qs = qs.filter(cf_country__iexact=cf_country)
        return qs

    @action(detail=False, methods=["post"])
    def ingest(self, request):
        secret = os.environ.get("PROBE_SECRET", "")
        if secret and request.headers.get("X-Probe-Secret") != secret:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        ser = LatencyProbeIngestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        probe = LatencyProbe.objects.create(**ser.validated_data)
        return Response({"id": probe.id, "ok": True}, status=status.HTTP_201_CREATED)


class OptimisedStrategyViewSet(ReadOnlyModelViewSet):
    queryset = OptimisedStrategy.objects.all()
    serializer_class = OptimisedStrategySerializer

    @action(detail=False, methods=["get"])
    def current(self, request):
        source = request.query_params.get("source", SimulationLog.DATA_SOURCE_LIVE_ENGINE)
        obj = (
            OptimisedStrategy.objects.filter(is_current=True, data_source=source).first()
            or OptimisedStrategy.objects.filter(is_current=True).first()
        )
        if obj is None:
            return Response(
                {"detail": "No optimised strategy yet. Run python manage.py run_nightly_ml first."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(OptimisedStrategySerializer(obj).data)


class UserStrategyViewSet(ModelViewSet):
    queryset = UserStrategy.objects.all()
    serializer_class = UserStrategySerializer

    @action(detail=True, methods=["post"])
    def analyse(self, request, pk=None):
        from api.services.ml.insights import InsightGenerator
        from api.services.ml.features import InsufficientDataError
        strategy = self.get_object()
        generator = InsightGenerator()
        try:
            insight = generator.generate(strategy)
            insight.save()
        except InsufficientDataError as e:
            return Response(
                {"status": "insufficient_data", "detail": f"Only {e.available} rows match (minimum {e.required} required).", "available": e.available, "min_required": e.required},
                status=status.HTTP_202_ACCEPTED,
            )
        except Exception as e:
            return Response({"detail": f"Insight generation failed: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response(StrategyInsightSerializer(insight).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def insight(self, request, pk=None):
        strategy = self.get_object()
        latest = StrategyInsight.objects.filter(strategy=strategy).order_by("-generated_at").first()
        if latest is None:
            return Response({"detail": "No insight yet. POST to /analyse/ to generate one."}, status=status.HTTP_404_NOT_FOUND)
        return Response(StrategyInsightSerializer(latest).data)

    @action(detail=False, methods=["post"])
    def validate(self, request):
        from api.services.ml.evaluator import validate_expression, conditions_to_expression
        expression = request.data.get("expression", "")
        if not expression or not expression.strip():
            return Response({"valid": False, "error": "Expression cannot be empty", "line": 0, "col": 0})
        result = validate_expression(expression)
        if result.get("valid"):
            result["rendered"] = conditions_to_expression(result["conditions"], result.get("logic", "AND"))
        return Response(result)
```

---

**File B:** `src/middleware/api/urls.py`

**Delete the entire file contents** and **replace with:**

```python
from rest_framework.routers import DefaultRouter

from .views import (
    ArbitrageEventViewSet,
    ExchangeViewSet,
    LatencyProbeViewSet,
    OptimisedStrategyViewSet,
    PriceSnapshotViewSet,
    UserStrategyViewSet,
)

router = DefaultRouter()
router.register(r"exchanges",     ExchangeViewSet,          basename="exchanges")
router.register(r"prices",        PriceSnapshotViewSet,     basename="prices")
router.register(r"opportunities", ArbitrageEventViewSet,    basename="opportunities")
router.register(r"probes",        LatencyProbeViewSet,      basename="probes")
router.register(r"ml/optimised",  OptimisedStrategyViewSet, basename="ml-optimised")
router.register(r"strategies",    UserStrategyViewSet,      basename="strategies")

urlpatterns = router.urls
```

---

---

## STEP 7 — Person A · Backend · Hard
### Create the ML Services Package

Create the following directory structure and files:

```
src/middleware/api/services/
src/middleware/api/services/__init__.py          (empty)
src/middleware/api/services/ml/
src/middleware/api/services/ml/__init__.py       (empty)
src/middleware/api/services/ml/features.py
src/middleware/api/services/ml/insights.py
src/middleware/api/services/ml/evaluator.py
src/middleware/api/services/ml/regime.py
src/middleware/api/services/ml/optimiser.py
src/middleware/api/services/ml/runner.py
```

Also create the management command package:

```
src/middleware/api/management/
src/middleware/api/management/__init__.py        (empty)
src/middleware/api/management/commands/
src/middleware/api/management/commands/__init__.py  (empty)
src/middleware/api/management/commands/run_nightly_ml.py
```

**`run_nightly_ml.py`** — full content:

```python
"""
Management command: run_nightly_ml

Runs the nightly Bayesian ML optimisation pipeline and persists the result
as the current OptimisedStrategy record.

Usage:
  python manage.py run_nightly_ml
  python manage.py run_nightly_ml --asset ETH/USDT --n-calls 30
  python manage.py run_nightly_ml --dry-run
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run nightly Bayesian ML optimisation and update OptimisedStrategy"

    def add_arguments(self, parser):
        parser.add_argument("--asset", default="BTC/USDT", help="Asset pair to optimise for (default: BTC/USDT)")
        parser.add_argument("--n-calls", type=int, default=60, help="Number of Bayesian optimisation iterations (default: 60)")
        parser.add_argument("--dry-run", action="store_true", help="Run the full pipeline but do not write results to the database")

    def handle(self, *args, **options):
        from api.services.ml.runner import run_nightly_optimisation
        from api.services.ml.features import InsufficientDataError

        asset = options["asset"]
        n_calls = options["n_calls"]
        dry_run = options["dry_run"]
        self.stdout.write(f"Starting ML pipeline: asset={asset}, n_calls={n_calls}, dry_run={dry_run}")

        try:
            result = run_nightly_optimisation(asset=asset, n_calls=n_calls, dry_run=dry_run)
        except InsufficientDataError as e:
            self.stderr.write(self.style.WARNING(
                f"Insufficient data: {e.available} SimulationLog rows available, "
                f"{e.required} required. Run more simulations first."
            ))
            raise SystemExit(0)
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"ML pipeline failed: {e}"))
            raise SystemExit(1)

        prefix = "[DRY RUN] " if dry_run else ""
        self.stdout.write(self.style.SUCCESS(
            f"{prefix}Optimisation complete:\n"
            f"  regime       = {result['regime_label']} (confidence {result['regime_confidence']:.1%})\n"
            f"  hit_rate     = {result['expected_hit_rate']:.1%} [{result['ci_low']:.1%} – {result['ci_high']:.1%}]\n"
            f"  sample_size  = {result['sample_size']}\n"
            f"  parameters   = {result['parameters']}"
        ))
```

**`runner.py`** — full content:

```python
"""
Nightly ML pipeline runner.
Orchestrates:
  1. Regime detection (HMM on PriceSnapshot)
  2. Bayesian GP optimisation (produces OptimisedStrategy)
"""

import logging
logger = logging.getLogger(__name__)


def run_nightly_optimisation(asset: str = "BTC/USDT", n_calls: int = 60, dry_run: bool = False) -> dict:
    from django.db import transaction
    from api.models import OptimisedStrategy
    from api.services.ml.features import build_regime_feature_matrix, InsufficientDataError
    from api.services.ml.regime import RegimeDetector
    from api.services.ml.optimiser import BayesianOptimiser

    logger.info("=== Nightly ML pipeline START (asset=%s, n_calls=%d, dry_run=%s) ===", asset, n_calls, dry_run)

    X_regime = build_regime_feature_matrix(asset, lookback_hours=48)
    detector = RegimeDetector()
    if X_regime.shape[0] >= 10:
        detector.fit(X_regime)
        regime_label, regime_confidence = detector.predict_current_regime(X_regime)
        if not dry_run:
            detector.save(asset)
    else:
        logger.warning("Insufficient PriceSnapshot rows for regime detection (%d rows). Setting regime to 'unknown'.", X_regime.shape[0])
        regime_label, regime_confidence = "unknown", 0.0

    logger.info("Regime: label=%s, confidence=%.3f", regime_label, regime_confidence)

    optimiser = BayesianOptimiser(regime_label=regime_label, n_calls=n_calls)
    try:
        result = optimiser.run()
    except InsufficientDataError:
        logger.error("Insufficient SimulationLog data. Exiting without updating OptimisedStrategy.")
        raise
    except Exception as exc:
        logger.error("BayesianOptimiser.run() failed: %s", exc, exc_info=True)
        raise RuntimeError(f"Bayesian optimisation failed: {exc}") from exc

    result["regime_confidence"] = regime_confidence

    if dry_run:
        logger.info("DRY RUN — not writing to DB. Result: %s", result)
        return result

    with transaction.atomic():
        OptimisedStrategy.objects.filter(is_current=True).update(is_current=False)
        obj = OptimisedStrategy.objects.create(
            regime_label=result["regime_label"],
            regime_confidence=result["regime_confidence"],
            parameters=result["parameters"],
            expected_hit_rate=result["expected_hit_rate"],
            ci_low=result["ci_low"],
            ci_high=result["ci_high"],
            sample_size=result["sample_size"],
            is_current=True,
        )

    logger.info("=== Nightly ML pipeline DONE: OptimisedStrategy id=%d, hit_rate=%.3f ===", obj.id, obj.expected_hit_rate)
    return result
```

The `features.py`, `insights.py`, `evaluator.py`, `regime.py`, and `optimiser.py` files already exist at `src/middleware/api/services/ml/` — they should be kept as-is.

---

---

## STEP 8 — Person B · Backend · Easy
### Update `docker-compose.yml` — Add VPS Env Var and `ml-worker` Service

**File:** `src/docker-compose.yml`

**8a.** Add `VITE_VPS_API_URL` to the frontend service `environment` block. **Find** the `frontend` service environment block (around line 58) and **add** after `VITE_API_URL`:

```yaml
      VITE_VPS_API_URL: http://77.42.92.181/api
```

**8b.** After the `core-engine` service block (around line 74), **add** the new `ml-worker` service:

```yaml
  ml-worker:
    build:
      context: ./middleware
      dockerfile: Dockerfile
    container_name: marketscout_ml_worker
    command: >
      sh -c "echo '0 2 * * * cd /app && python manage.py run_nightly_ml >> /app/logs/ml.log 2>&1' | crontab - && crond -f"
    volumes:
      - ./middleware:/app
    env_file:
      - ./middleware/.env
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
```

---

---

## STEP 9 — Person A · Frontend · Medium
### Refactor `App.tsx` — Theme Toggle, New Routes, Probes Import

**File:** `src/frontend/src/App.tsx`

**Delete the entire file** and **replace with:**

```tsx
import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "./pages/Dashboard";
import AdvancedMode from "./pages/AdvancedMode";
import Probes from "./pages/Probes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000,
      retry: 1,
    },
  },
});

function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("ms-theme") as "dark" | "light") || "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ms-theme", theme);
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <nav className="nav">
          <a className="nav-brand" href="/">
            MarketScout
          </a>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              Monitor
            </NavLink>
            <NavLink to="/simulate" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              Simulate
            </NavLink>
            <NavLink to="/probes" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              Probes
            </NavLink>
          </div>
          <div className="nav-right">
            <button
              className="theme-toggle"
              onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/simulate" element={<AdvancedMode />} />
            <Route path="/advanced" element={<AdvancedMode />} />
            <Route path="/probes" element={<Probes />} />
          </Routes>
        </main>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
```

---

---

## STEP 10 — Person B · Frontend · Hard
### Expand `client.ts` — VPS API, Backtest, ML, and Probe Functions

**File:** `src/frontend/src/api/client.ts`

**10a.** After the existing `API_BASE` constant at the top of the file, **add** the VPS base URL:

```typescript
export const VPS_API_BASE = (import.meta as any).env?.VITE_VPS_API_URL ?? "http://77.42.92.181/api";
```

**10b.** Add the following new types. Append them after the existing type definitions:

```typescript
// --- Backtest data types ---
export interface BacktestSnapshot {
  id: number;
  exchange: number;
  exchange_name: string;
  asset: string;
  bid: string;
  ask: string;
  bid_qty: string;
  ask_qty: string;
  timestamp: string;
  spread_bps: number | null;
  mid_price: string | null;
  bids_l2: [number, number][] | null;
  asks_l2: [number, number][] | null;
  data_source: string;
}

export interface BacktestDataParams {
  start?: string;
  end?: string;
  exchanges?: string[];
  assets?: string[];
  min_spread_bps?: number;
  limit?: number;
}

export interface BacktestMetadata {
  total_snapshots: number;
  date_range: { earliest: string | null; latest: string | null } | null;
  exchanges: { name: string; display_name: string; count: number }[];
  assets: { asset: string; count: number }[];
}

// --- ML types ---
export interface StrategyCondition {
  field: string;
  operator: string;
  value: number | string | (number | string)[];
}

export interface StrategyParameters {
  conditions: StrategyCondition[];
  logic: "AND" | "OR";
}

export interface OptimisedStrategy {
  id: number;
  regime_label: string;
  regime_confidence: number;
  parameters: StrategyParameters;
  expected_hit_rate: number;
  ci_low: number;
  ci_high: number;
  sample_size: number;
  generated_at: string;
  is_current: boolean;
  data_source: string;
}

export interface UserStrategy {
  id: number;
  name: string;
  parameters: StrategyParameters;
  created_at: string;
  updated_at: string;
}

export interface StrategyInsight {
  id: number;
  strategy: number;
  generated_at: string;
  hit_rate_in_sample: number;
  hit_rate_out_of_sample: number;
  overfitting_flag: boolean;
  condition_importances: Record<string, number>;
  threshold_suggestions: Record<string, { inflection: number; z_stat: number; p_value: number; n_below: number; n_above: number; hit_rate_below: number; hit_rate_above: number }>;
  gap_suggestions: { field: string; mutual_info: number }[];
  vs_optimised_delta_hit_rate: number | null;
  vs_optimised_delta_profit: string | null;
}

export interface InsufficientDataResponse {
  status: "insufficient_data";
  detail: string;
  available: number;
  min_required: number;
}

export interface ValidateExpressionResponse {
  valid: boolean;
  conditions?: StrategyCondition[];
  logic?: string;
  condition_count?: number;
  rendered?: string;
  error?: string;
  line?: number;
  col?: number;
}

// --- Latency probe types ---
export interface LatencyProbeExchangeMetric {
  rest_ping_ms: number;
  ping_ok: boolean;
  ticker_rtt_ms: number;
  bid: number;
  ask: number;
  spread_bps: number;
  mid_price: number;
}

export interface LatencyProbe {
  id: number;
  collected_at: string;
  cf_colo: string;
  cf_country: string;
  cf_city: string;
  cf_region: string;
  cf_latitude: number | null;
  cf_longitude: number | null;
  cf_timezone: string;
  worker_version: string;
  exchange_metrics: Record<string, LatencyProbeExchangeMetric>;
}

export interface PaginatedProbesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: LatencyProbe[];
}
```

**10c.** Add the new API functions at the end of the file:

```typescript
// ---------------------------------------------------------------------------
// Backtest data (VPS)
// ---------------------------------------------------------------------------

export async function fetchBacktestData(params: BacktestDataParams): Promise<{ count: number; snapshots: BacktestSnapshot[] }> {
  const p = new URLSearchParams();
  if (params.start)  p.set("start", params.start);
  if (params.end)    p.set("end", params.end);
  if (params.exchanges?.length) p.set("exchanges", params.exchanges.join(","));
  if (params.assets?.length)    p.set("assets", params.assets.join(","));
  if (params.min_spread_bps != null) p.set("min_spread_bps", String(params.min_spread_bps));
  if (params.limit != null)     p.set("limit", String(params.limit));
  const res = await fetch(`${VPS_API_BASE}/prices/backtest_data/?${p}`);
  if (!res.ok) throw new Error(`Backtest data fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchBacktestMetadata(): Promise<BacktestMetadata> {
  const res = await fetch(`${VPS_API_BASE}/prices/backtest_metadata/`);
  if (!res.ok) throw new Error(`Backtest metadata fetch failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// ML Strategy APIs
// ---------------------------------------------------------------------------

export async function fetchCurrentOptimisedStrategy(source?: string): Promise<OptimisedStrategy> {
  const p = source ? `?source=${encodeURIComponent(source)}` : "";
  const res = await fetch(`${API_BASE}/ml/optimised/current/${p}`);
  if (!res.ok) throw new Error(`Optimised strategy fetch failed: ${res.status}`);
  return res.json();
}

export async function createUserStrategy(name: string, parameters: StrategyParameters): Promise<UserStrategy> {
  const res = await fetch(`${API_BASE}/strategies/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parameters }),
  });
  if (!res.ok) throw new Error(`Create strategy failed: ${res.status}`);
  return res.json();
}

export async function analyseStrategy(id: number): Promise<StrategyInsight | InsufficientDataResponse> {
  const res = await fetch(`${API_BASE}/strategies/${id}/analyse/`, { method: "POST" });
  if (!res.ok && res.status !== 202) throw new Error(`Analyse strategy failed: ${res.status}`);
  return res.json();
}

export async function fetchStrategyInsight(id: number): Promise<StrategyInsight> {
  const res = await fetch(`${API_BASE}/strategies/${id}/insight/`);
  if (!res.ok) throw new Error(`Fetch insight failed: ${res.status}`);
  return res.json();
}

export async function validateStrategyExpression(expression: string): Promise<ValidateExpressionResponse> {
  const res = await fetch(`${API_BASE}/strategies/validate/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expression }),
  });
  if (!res.ok) throw new Error(`Validate expression failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Latency Probes
// ---------------------------------------------------------------------------

export async function fetchLatencyProbes(params?: { cf_colo?: string; cf_country?: string; limit?: number }): Promise<PaginatedProbesResponse> {
  const p = new URLSearchParams();
  if (params?.cf_colo)    p.set("cf_colo", params.cf_colo);
  if (params?.cf_country) p.set("cf_country", params.cf_country);
  if (params?.limit)      p.set("limit", String(params.limit));
  const res = await fetch(`${API_BASE}/probes/?${p}`);
  if (!res.ok) throw new Error(`Probes fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchSimulationCount(strategyId: number): Promise<{ count: number; min_required: number }> {
  const res = await fetch(`${API_BASE}/strategies/${strategyId}/insight/`);
  if (res.status === 404) return { count: 0, min_required: 50 };
  if (!res.ok) throw new Error(`Simulation count check failed: ${res.status}`);
  const data = await res.json();
  return { count: data.sample_size ?? 0, min_required: 50 };
}
```

---

---

## STEP 11 — Person A · Frontend · Easy-Medium
### Update `Stats.tsx` — Add Profitable Count and Max Spread Cards

**File:** `src/frontend/src/components/Stats.tsx`

**11a.** On line 1, **delete:**
```typescript
import { useQuery } from "@tanstack/react-query";
```
**Add:**
```typescript
import { useQuery, keepPreviousData } from "@tanstack/react-query";
```

**11b.** In the `useQuery` call (around line 10), **add** `placeholderData` after `refetchInterval`:
```typescript
    placeholderData: keepPreviousData,
```

**11c.** Replace the entire component body's render section. **Delete:**
```tsx
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
```

**Add:**
```tsx
  const displayed = stats;
  const totalCards = hideProfitStat ? 5 : 6;

  if (isLoading && !displayed) {
    return (
      <div className="stats-grid">
        {[...Array(totalCards)].map((_, i) => (
          <div key={i} className="stat-card">
            <span className="stat-value">—</span>
            <span className="stat-label">Loading...</span>
          </div>
        ))}
      </div>
    );
  }

  if (!displayed) return null;
```

**11d.** After the `formatProfit` helper function (around line 47), **add** the profitable rate calculation:

```typescript
  const profitableRate =
    displayed.total_opportunities > 0
      ? ((displayed.profitable_count / displayed.total_opportunities) * 100).toFixed(1)
      : null;
```

**11e.** In the JSX return, after the "Last 24 Hours" card, **add** the new "Profitable" card and update the "Avg Spread" card. Replace the section from the third `stat-card` onwards:

```tsx
      <div className="stat-card">
        <span className="stat-value" style={{ color: "var(--accent-green)" }}>
          {formatNumber(displayed.profitable_count)}
          {profitableRate && (
            <span style={{ fontSize: "0.875rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: "0.375rem" }}>
              ({profitableRate}%)
            </span>
          )}
        </span>
        <span className="stat-label">Profitable</span>
      </div>
      <div className="stat-card">
        <span className="stat-value" style={{ color: "var(--accent-green)" }}>
          {formatPercent(displayed.avg_spread)}
        </span>
        <span className="stat-label">Avg Spread</span>
      </div>
      <div className="stat-card">
        <span className="stat-value" style={{ color: "var(--accent-yellow)" }}>
          {formatPercent(displayed.max_spread)}
        </span>
        <span className="stat-label">Max Spread</span>
      </div>
```

Also update all `stats.` references to `displayed.` and update the profit card's color to use CSS variables:
```tsx
          style={{
            color: parseFloat(displayed.total_simulated_profit || "0") >= 0
              ? "var(--accent-green)"
              : "var(--accent-red)",
          }}
```

---

---

## STEP 12 — Person B · Frontend · Medium
### Overhaul `Dashboard.tsx` — Pair Chips Filter, Export CSV, `hasFilters`

**File:** `src/frontend/src/pages/Dashboard.tsx`

**12a.** Update the import line at the top — **add** `getExportUrl` to the import:

```typescript
import { fetchRecentOpportunities, getExportUrl, ArbitrageEvent } from "../api/client";
```

**12b.** Replace the `pairFilter` state with a `Set`-based filter. **Delete:**
```typescript
  const [pairFilter, setPairFilter] = useState<string>("all");
```
**Add:**
```typescript
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set());
```

**12c.** Update the filter logic that uses `pairFilter`. **Delete:**
```typescript
    if (pairFilter !== "all") {
      filtered = filtered.filter(
        (o) => `${o.buy_exchange_name}→${o.sell_exchange_name}` === pairFilter
      );
    }
  }, [opportunities, minSpread, pairFilter]);
```
**Add:**
```typescript
    if (selectedPairs.size > 0) {
      filtered = filtered.filter(
        (o) => selectedPairs.has(`${o.buy_exchange_name}→${o.sell_exchange_name}`)
      );
    }
  }, [opportunities, minSpread, selectedPairs]);

  const hasFilters = minSpread !== "" || selectedPairs.size > 0;

  const togglePair = (pair: string) => {
    setSelectedPairs((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(pair)) next.delete(pair);
      else next.add(pair);
      return next;
    });
  };

  const clearFilters = () => {
    setMinSpread("");
    setSelectedPairs(new Set());
  };

  const exportUrl = getExportUrl();
  const isExchangeConnected = !error;
```

**12d.** Update the page header to rename "Dashboard" to "Monitor" and add the Export CSV button. **Delete:**
```tsx
        <h1 className="page-title">Dashboard</h1>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Auto-refresh 3s
        </span>
```
**Add:**
```tsx
        <h1 className="page-title">Monitor</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Auto-refresh 3s
          </span>
          <a href={exportUrl} download className="btn btn-secondary btn-sm">
            Export CSV
          </a>
        </div>
```

**12e.** Replace the pair `<select>` filter with visual chip buttons. **Delete:**
```tsx
              <div className="filter-group">
                <label className="filter-label">Pair</label>
                <select
                  className="filter-select"
                  value={pairFilter}
                  onChange={(e) => setPairFilter(e.target.value)}
                >
                  <option value="all">All pairs</option>
                  {pairs.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
```
**Add:**
```tsx
              <div className="filter-group">
                <label className="filter-label">Pairs</label>
                <div className="pair-chips">
                  {pairs.map((p) => (
                    <button
                      key={p}
                      className={`pair-chip${selectedPairs.has(p) ? " active" : ""}`}
                      onClick={() => togglePair(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
```

**12f.** Update the clear-filters condition and `<OpportunityTable>` props. **Delete:**
```tsx
              {(minSpread || pairFilter !== "all") && (
```
**Add:**
```tsx
              {hasFilters && (
```

Update the `<OpportunityTable>` invocation to pass the new props:
```tsx
          <OpportunityTable
            opportunities={filtered}
            onSelect={setSelected}
            hasFilters={hasFilters}
            isExchangeConnected={isExchangeConnected}
          />
```

---

---

## STEP 13 — Person A · Frontend · Hard
### Refactor `SpreadChart.tsx` — Dual View Toggle (Line + Heatmap)

**File:** `src/frontend/src/components/SpreadChart.tsx`

**13a.** After the `spreadColor` function (line 25), **add** the color palette constant:

```typescript
const LINE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#ec4899", "#84cc16"];
```

**13b.** Inside the `SpreadChart` component, add the `view` state after the existing `tooltip` state:

```typescript
  const [view, setView] = useState<"line" | "heat">("line");
```

**13c.** Update the empty-state title from `"Spread Heatmap"` to `"Spread Chart"` (line 54).

**13d.** After computing `grid` (around line 75), **add** the `renderLineChart` function:

```typescript
  const renderLineChart = () => {
    const W = 280, H = 120, PL = 32, PR = 8, PT = 8, PB = 20;
    const chartW = W - PL - PR;
    const chartH = H - PT - PB;

    const allSpreads = Object.values(grid).flatMap(arr => arr.filter((v): v is number => v !== null));
    const maxSpread = Math.max(0.01, ...allSpreads);

    const px = (i: number) => PL + (i / (BUCKETS - 1)) * chartW;
    const py = (s: number) => PT + (1 - s / maxSpread) * chartH;

    return (
      <div className="spread-line-chart">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
          {[0, 0.5, 1].map((t) => {
            const y = PT + t * chartH;
            const val = maxSpread * (1 - t);
            return (
              <g key={t}>
                <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#2a2a2a" strokeWidth="1" />
                <text x={PL - 3} y={y + 3} textAnchor="end" fontSize="7" fill="#555">
                  {val.toFixed(2)}
                </text>
              </g>
            );
          })}
          {buckets.map((b, i) => (
            i % 3 === 0 || i === BUCKETS - 1 ? (
              <text key={i} x={px(i)} y={H - 2} textAnchor="middle" fontSize="7" fill="#555">
                {bucketLabel(b, i)}
              </text>
            ) : null
          ))}
          {pairs.map((pair, pi) => {
            const color = LINE_COLORS[pi % LINE_COLORS.length];
            const pts = buckets.map((_, bi) => grid[pair][bi]);
            const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
            for (let i = 0; i < pts.length - 1; i++) {
              if (pts[i] !== null && pts[i + 1] !== null) {
                segments.push({ x1: px(i), y1: py(pts[i]!), x2: px(i + 1), y2: py(pts[i + 1]!) });
              }
            }
            return segments.map((s, si) => (
              <line key={`${pair}-${si}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={color} strokeWidth="1.5" opacity="0.85" strokeLinecap="round" />
            ));
          })}
        </svg>
        <div className="spread-line-legend">
          {pairs.map((pair, pi) => (
            <span key={pair} style={{ color: LINE_COLORS[pi % LINE_COLORS.length], fontSize: "0.65rem" }}>
              {pair}
            </span>
          ))}
        </div>
      </div>
    );
  };
```

**13e.** Replace the final `return` block in the component. **Delete** the existing heatmap-only return and **replace** with:

```tsx
  return (
    <div className="card" style={{ position: "relative" }}>
      <div className="card-header">
        <h3 className="card-title">Spread Chart</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div className="chart-view-toggle">
            <button className={view === "line" ? "active" : ""} onClick={() => setView("line")} title="Line chart">∿</button>
            <button className={view === "heat" ? "active" : ""} onClick={() => setView("heat")} title="Heatmap">▦</button>
          </div>
          <span className="panel-badge">last {BUCKETS} min</span>
        </div>
      </div>

      {view === "line" ? renderLineChart() : (
        <div className="heatmap-wrap">
          <div className="heatmap-grid" style={{ gridTemplateColumns: `auto repeat(${BUCKETS}, 1fr)` }}>
            <div className="heatmap-corner" />
            {buckets.map((b, i) => (
              <div key={i} className="heatmap-col-label">{bucketLabel(b, i)}</div>
            ))}
            {pairs.map((pair) => (
              <>
                <div key={`lbl-${pair}`} className="heatmap-row-label">{pair}</div>
                {buckets.map((b, bi) => {
                  const spread = grid[pair][bi];
                  return (
                    <div
                      key={`${pair}-${bi}`}
                      className="heatmap-cell"
                      style={{ background: spreadColor(spread) }}
                      onMouseEnter={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const cardRect = (e.currentTarget as HTMLElement).closest(".card")!.getBoundingClientRect();
                        setTooltip({ pair, bucket: b, spread, x: rect.left - cardRect.left + rect.width / 2, y: rect.top - cardRect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </>
            ))}
          </div>
        </div>
      )}

      {view === "heat" && tooltip && (
        <div className="heatmap-tooltip" style={{ left: tooltip.x, top: tooltip.y - 8, transform: "translate(-50%,-100%)" }}>
          <strong>{tooltip.pair}</strong>
          <br />
          {new Date(tooltip.bucket).toLocaleTimeString()}
          <br />
          {tooltip.spread != null ? `${tooltip.spread.toFixed(4)}%` : "—"}
        </div>
      )}
    </div>
  );
```

---

---

## STEP 14 — Person B · Frontend · Hard
### Create New Frontend Components and Pages + Update `TradeDetailModal.tsx`

**14a. Create `src/frontend/src/vite-env.d.ts`** — full content:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_VPS_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

**14b. Update `TradeDetailModal.tsx`** — add accessibility and sticky profit bar.

At the top of the file, **add** to the existing imports:
```typescript
import { useEffect, useRef } from "react";
```

Inside the component body (before the return), **add**:
```typescript
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const netProfit = grossProfit - totalEstimatedFees;
  const displayNetProfit = opportunity.net_profit
    ? parseFloat(opportunity.net_profit)
    : netProfit;
  const displayIsProfitable = opportunity.net_profit
    ? opportunity.profitable
    : netProfit >= 0;
```

Replace the `modal-overlay` opening tag and `modal-header` block. **Delete:**
```tsx
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            Trade Analysis
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
```

**Add:**
```tsx
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Trade analysis for ${opportunity.asset}`}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-profit-bar" style={{ background: displayIsProfitable ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)" }}>
          <div className="modal-profit-bar-left">
            <span className="asset-badge">{opportunity.asset}</span>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Trade Analysis</span>
          </div>
          <div className="modal-profit-bar-right">
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginRight: "0.5rem" }}>
              {opportunity.simulated ? "Net Profit (simulated)" : "Est. Net Profit"}
            </span>
            <span
              className="modal-net-profit-value"
              style={{ color: displayIsProfitable ? "var(--accent-green)" : "var(--accent-red)" }}
            >
              {displayNetProfit >= 0 ? "+" : ""}${Math.abs(displayNetProfit).toFixed(6)}
            </span>
          </div>
          <button
            ref={closeRef}
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
```

**14c. Create `src/frontend/src/pages/Probes.tsx`** — new file.

This page displays Cloudflare Worker latency probe measurements with a world map and expandable table rows. The file already exists in your working tree at `src/frontend/src/pages/Probes.tsx` — keep it as-is.

**14d. Create `src/frontend/src/components/InsightsPanel.tsx`** — new file.

This component displays ML strategy insights (walk-forward validation, condition importances, threshold suggestions). The file already exists at `src/frontend/src/components/InsightsPanel.tsx` — keep it as-is.

**14e. Create `src/frontend/src/components/StrategyBuilder.tsx`** — new file.

This component is a dual-mode strategy editor (visual form + DSL code editor). The file already exists at `src/frontend/src/components/StrategyBuilder.tsx` — keep it as-is.

**14f. Create `src/frontend/src/components/RunCompare.tsx`** — new file.

This component compares multiple saved simulation runs side-by-side. The file already exists at `src/frontend/src/components/RunCompare.tsx` — keep it as-is.

**14g. Create `src/frontend/src/components/StrategyEditor.tsx`** — new file.

This component handles editing and creating user strategy presets. The file already exists at `src/frontend/src/components/StrategyEditor.tsx` — keep it as-is.

---

---

## STEP 15 — Person A · Backend + C++ · Medium
### Fix `kraken.hpp` USDT→USD Conversion + Create VPS Pipeline Files

**15a. Fix `src/core-engine/src/exchange websockets/kraken.hpp`**

**Delete** the default parameter value (line 8) and the subscribe_msg block:

```cpp
inline ExchangeConfig getKrakenConfig(
    const std::string& asset = "BTC/USD") {
```
and (line 22):
```cpp
        asset + R"("]}})";
```

**Add** the updated default and conversion logic:

```cpp
inline ExchangeConfig getKrakenConfig(
    const std::string& asset = "BTC/USDT") {
    ExchangeConfig config;
    config.name = "kraken";
    config.host = "ws.kraken.com";
    config.port = 443;
    config.path = "/v2";
    config.assets = {asset};

    // Kraken uses USD not USDT as its primary quote — convert e.g. "BTC/USDT" → "BTC/USD"
    auto sym = asset;
    auto pos = sym.find("/USDT");
    if (pos != std::string::npos) sym.replace(pos, 5, "/USD");

    // kraken needs sub msg sent after connect, not path based like binance
    config.subscribe_msg =
        R"({"method":"subscribe","params":{)"
        R"("channel":"ticker","symbol":[")" +
        sym + R"("]}})";
    return config;
}
```

**15b. Create the VPS pipeline directory and files.**

Create the directory `backtest_data_pipeline/` at the repo root and add the following files. They already exist in your working tree — keep them as-is:

- `backtest_data_pipeline/collector.py` — persistent WebSocket data collection from 7 exchanges
- `backtest_data_pipeline/order_rtt_probe.py` — measures order endpoint round-trip latency
- `backtest_data_pipeline/fee_tier_scraper.py` — daily fee tier scraper per exchange
- `backtest_data_pipeline/book_walk.py` — realistic L2 order fill simulator
- `backtest_data_pipeline/worker.js` — Cloudflare Worker for geo-distributed latency probes
- `backtest_data_pipeline/wrangler.toml` — Cloudflare Workers deployment config
- `backtest_data_pipeline/vps_setup.sh` — one-time VPS initialization script

To deploy the Cloudflare Worker (from inside `backtest_data_pipeline/`):
```bash
wrangler deploy
```

To initialize the VPS:
```bash
scp backtest_data_pipeline/*.py user@77.42.92.181:/opt/marketscout/
ssh user@77.42.92.181 "bash /opt/marketscout/vps_setup.sh"
```

---

---

## Verification Checklist

After all 15 steps are complete:

### Backend
```bash
cd src/middleware
pip install -r requirements.txt
python manage.py migrate
python manage.py run_nightly_ml --dry-run
python manage.py runserver
```

Verify endpoints:
- `GET /api/probes/` → returns paginated probe list
- `GET /api/ml/optimised/current/` → 404 on cold start (expected)
- `GET /api/strategies/` → returns empty list
- `POST /api/strategies/validate/` with `{"expression": "spread_pct >= 0.3"}` → `{"valid": true}`
- `GET /api/prices/backtest_metadata/` → returns metadata object

### Frontend
```bash
cd src/frontend
npm install
npm run dev
```

Verify:
- Theme toggle (☀/☾) appears in nav and persists on reload
- "Monitor", "Simulate", "Probes" tabs all navigate correctly
- Stats panel shows 6 cards including "Profitable" and "Max Spread"
- SpreadChart has ∿/▦ toggle buttons; line view renders SVG lines
- Dashboard pair filter shows clickable chips instead of dropdown
- "Export CSV" button appears in Monitor header
- Trade detail modal closes on Escape key; profit bar shows net profit
- `/probes` page loads and shows world map + probe table

### Docker (full stack)
```bash
cd src
docker compose up --build
```
Verify `marketscout_ml_worker` container starts and its cron is scheduled.
