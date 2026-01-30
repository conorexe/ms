from rest_framework import serializers
from .models import Exchange, ExchangeStatus, PriceSnapshot, ArbitrageEvent, SimulationLog


class ExchangeStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeStatus
        fields = ['connected', 'last_message_at', 'last_error', 'retry_count', 'updated_at']


class ExchangeSerializer(serializers.ModelSerializer):
    status = ExchangeStatusSerializer(read_only=True)

    class Meta:
        model = Exchange
        fields = [
            'id', 'name', 'display_name', 'websocket_url',
            'maker_fee', 'taker_fee', 'is_active', 'status', 'created_at'
        ]


class PriceSnapshotSerializer(serializers.ModelSerializer):
    exchange_name = serializers.CharField(source='exchange.name', read_only=True)

    class Meta:
        model = PriceSnapshot
        fields = [
            'id', 'exchange', 'exchange_name', 'asset',
            'bid', 'ask', 'bid_qty', 'ask_qty', 'timestamp', 'received_at'
        ]


class ArbitrageEventSerializer(serializers.ModelSerializer):
    buy_exchange_name = serializers.CharField(source='buy_exchange.name', read_only=True)
    sell_exchange_name = serializers.CharField(source='sell_exchange.name', read_only=True)
    buy_exchange_fee = serializers.DecimalField(
        source='buy_exchange.taker_fee', max_digits=8, decimal_places=6, read_only=True
    )
    sell_exchange_fee = serializers.DecimalField(
        source='sell_exchange.taker_fee', max_digits=8, decimal_places=6, read_only=True
    )

    class Meta:
        model = ArbitrageEvent
        fields = [
            'id', 'event_id', 'detected_at', 'asset',
            'buy_exchange', 'sell_exchange',
            'buy_exchange_name', 'sell_exchange_name',
            'buy_exchange_fee', 'sell_exchange_fee',
            'buy_price', 'sell_price',
            'buy_qty_available', 'sell_qty_available',
            'spread_pct', 'spread_absolute',
            'simulated', 'simulated_at', 'trade_amount',
            'gross_profit', 'total_fees', 'slippage_cost', 'latency_cost',
            'net_profit', 'profitable'
        ]


class ArbitrageEventIngestSerializer(serializers.Serializer):
    """For receiving events from the C++ engine."""
    event_id = serializers.CharField(max_length=100)
    asset = serializers.CharField(max_length=20)
    buy_exchange = serializers.CharField(max_length=50)
    sell_exchange = serializers.CharField(max_length=50)
    buy_price = serializers.DecimalField(max_digits=20, decimal_places=8)
    sell_price = serializers.DecimalField(max_digits=20, decimal_places=8)
    buy_qty = serializers.DecimalField(max_digits=20, decimal_places=8, default=0)
    sell_qty = serializers.DecimalField(max_digits=20, decimal_places=8, default=0)
    spread_pct = serializers.DecimalField(max_digits=10, decimal_places=6)
    spread_absolute = serializers.DecimalField(max_digits=20, decimal_places=8)
    timestamp = serializers.DateTimeField(required=False)


class SimulateRequestSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=20, decimal_places=8, default=1.0)
    latency_ms = serializers.IntegerField(default=100, min_value=1, max_value=10000)


class SimulationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimulationLog
        fields = '__all__'


class PriceIngestSerializer(serializers.Serializer):
    """For receiving price updates from the C++ engine."""
    exchange = serializers.CharField(max_length=50)
    asset = serializers.CharField(max_length=20)
    bid = serializers.DecimalField(max_digits=20, decimal_places=8)
    ask = serializers.DecimalField(max_digits=20, decimal_places=8)
    bid_qty = serializers.DecimalField(max_digits=20, decimal_places=8, default=0)
    ask_qty = serializers.DecimalField(max_digits=20, decimal_places=8, default=0)
    timestamp = serializers.DateTimeField()


class ExchangeStatusUpdateSerializer(serializers.Serializer):
    """For updating exchange connection status from the C++ engine."""
    exchange = serializers.CharField(max_length=50)
    connected = serializers.BooleanField()
    error = serializers.CharField(required=False, allow_blank=True)
