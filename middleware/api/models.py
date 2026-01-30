from django.db import models
from django.utils import timezone
from decimal import Decimal


class Exchange(models.Model):
    name = models.CharField(max_length=50, unique=True)
    display_name = models.CharField(max_length=100)
    websocket_url = models.URLField(blank=True)
    maker_fee = models.DecimalField(max_digits=8, decimal_places=6, default=Decimal("0.001"))
    taker_fee = models.DecimalField(max_digits=8, decimal_places=6, default=Decimal("0.001"))
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]


class ExchangeStatus(models.Model):
    exchange = models.OneToOneField(Exchange, on_delete=models.CASCADE, related_name="status")
    connected = models.BooleanField(default=False)
    last_message_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    retry_count = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        status = "connected" if self.connected else "disconnected"
        return f"{self.exchange.name}: {status}"


class PriceSnapshot(models.Model):
    exchange = models.ForeignKey(Exchange, on_delete=models.CASCADE, related_name="prices")
    asset = models.CharField(max_length=20, db_index=True)
    bid = models.DecimalField(max_digits=20, decimal_places=8)
    ask = models.DecimalField(max_digits=20, decimal_places=8)
    bid_qty = models.DecimalField(max_digits=20, decimal_places=8, default=0)
    ask_qty = models.DecimalField(max_digits=20, decimal_places=8, default=0)
    timestamp = models.DateTimeField(db_index=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["asset", "exchange", "-timestamp"]),
            models.Index(fields=["-timestamp"]),
        ]
        get_latest_by = "timestamp"

    def __str__(self):
        return f"{self.exchange.name} {self.asset}: {self.bid}/{self.ask}"


class ArbitrageEvent(models.Model):
    event_id = models.CharField(max_length=100, unique=True, db_index=True)
    detected_at = models.DateTimeField(default=timezone.now, db_index=True)
    asset = models.CharField(max_length=20, db_index=True)

    buy_exchange = models.ForeignKey(
        Exchange, on_delete=models.CASCADE, related_name="buy_opportunities"
    )
    sell_exchange = models.ForeignKey(
        Exchange, on_delete=models.CASCADE, related_name="sell_opportunities"
    )

    buy_price = models.DecimalField(max_digits=20, decimal_places=8)
    sell_price = models.DecimalField(max_digits=20, decimal_places=8)
    buy_qty_available = models.DecimalField(max_digits=20, decimal_places=8, default=0)
    sell_qty_available = models.DecimalField(max_digits=20, decimal_places=8, default=0)

    spread_pct = models.DecimalField(max_digits=10, decimal_places=6)
    spread_absolute = models.DecimalField(max_digits=20, decimal_places=8)

    # Simulation results
    simulated = models.BooleanField(default=False)
    simulated_at = models.DateTimeField(null=True, blank=True)
    trade_amount = models.DecimalField(max_digits=20, decimal_places=8, null=True)
    gross_profit = models.DecimalField(max_digits=20, decimal_places=8, null=True)
    total_fees = models.DecimalField(max_digits=20, decimal_places=8, null=True)
    slippage_cost = models.DecimalField(max_digits=20, decimal_places=8, null=True)
    latency_cost = models.DecimalField(max_digits=20, decimal_places=8, null=True)
    net_profit = models.DecimalField(max_digits=20, decimal_places=8, null=True)
    profitable = models.BooleanField(null=True)

    class Meta:
        ordering = ["-detected_at"]
        indexes = [
            models.Index(fields=["asset", "-detected_at"]),
            models.Index(fields=["-spread_pct"]),
            models.Index(fields=["simulated", "-detected_at"]),
        ]

    def __str__(self):
        return f"{self.event_id}: {self.asset} {self.spread_pct}%"


class SimulationLog(models.Model):
    """Detailed log for ML training data."""
    event = models.OneToOneField(ArbitrageEvent, on_delete=models.CASCADE, related_name="sim_log")
    
    market_volatility = models.DecimalField(max_digits=10, decimal_places=6, null=True)
    buy_book_depth = models.DecimalField(max_digits=20, decimal_places=8, null=True)
    sell_book_depth = models.DecimalField(max_digits=20, decimal_places=8, null=True)
    
    detection_latency_ms = models.IntegerField(null=True)
    
    hour_of_day = models.IntegerField()
    day_of_week = models.IntegerField()
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"SimLog for {self.event.event_id}"
