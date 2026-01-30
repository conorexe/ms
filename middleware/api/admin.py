from django.contrib import admin
from .models import Exchange, ExchangeStatus, PriceSnapshot, ArbitrageEvent, SimulationLog


@admin.register(Exchange)
class ExchangeAdmin(admin.ModelAdmin):
    list_display = ['name', 'display_name', 'maker_fee', 'taker_fee', 'is_active']
    list_filter = ['is_active']


@admin.register(ExchangeStatus)
class ExchangeStatusAdmin(admin.ModelAdmin):
    list_display = ['exchange', 'connected', 'last_message_at', 'retry_count']
    list_filter = ['connected']


@admin.register(PriceSnapshot)
class PriceSnapshotAdmin(admin.ModelAdmin):
    list_display = ['exchange', 'asset', 'bid', 'ask', 'timestamp']
    list_filter = ['exchange', 'asset']
    date_hierarchy = 'timestamp'


@admin.register(ArbitrageEvent)
class ArbitrageEventAdmin(admin.ModelAdmin):
    list_display = ['event_id', 'asset', 'buy_exchange', 'sell_exchange', 'spread_pct', 'simulated', 'profitable']
    list_filter = ['asset', 'simulated', 'profitable', 'buy_exchange', 'sell_exchange']
    date_hierarchy = 'detected_at'
    search_fields = ['event_id', 'asset']


@admin.register(SimulationLog)
class SimulationLogAdmin(admin.ModelAdmin):
    list_display = ['event', 'hour_of_day', 'day_of_week', 'created_at']
