import csv
import json
import logging
import time
from decimal import Decimal
from datetime import timedelta

from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.renderers import BaseRenderer
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter

from .models import Exchange, ExchangeStatus, PriceSnapshot, ArbitrageEvent
from .serializers import (
    ExchangeSerializer,
    PriceSnapshotSerializer,
    ArbitrageEventSerializer,
    ArbitrageEventIngestSerializer,
    SimulateRequestSerializer,
    PriceIngestSerializer,
    ExchangeStatusUpdateSerializer,
)
from .services.simulation import simulate_trade, SimulationParams

logger = logging.getLogger(__name__)


class EventStreamRenderer(BaseRenderer):
    """Custom renderer for Server-Sent Events."""
    media_type = 'text/event-stream'
    format = 'txt'
    
    def render(self, data, media_type=None, renderer_context=None):
        return data


class ExchangeViewSet(viewsets.ModelViewSet):
    queryset = Exchange.objects.prefetch_related('status').all()
    serializer_class = ExchangeSerializer
    filterset_fields = ['is_active']

    @action(detail=False, methods=['get'])
    def status(self, request):
        """Get status of all exchanges."""
        exchanges = self.get_queryset()
        data = []
        for ex in exchanges:
            status_obj = getattr(ex, 'status', None)
            data.append({
                'name': ex.name,
                'display_name': ex.display_name,
                'connected': status_obj.connected if status_obj else False,
                'last_message_at': status_obj.last_message_at if status_obj else None,
                'retry_count': status_obj.retry_count if status_obj else 0,
            })
        return Response(data)

    @action(detail=False, methods=['post'])
    def update_status(self, request):
        """Update exchange connection status (from C++ engine)."""
        serializer = ExchangeStatusUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        exchange, _ = Exchange.objects.get_or_create(
            name=data['exchange'],
            defaults={'display_name': data['exchange'].title()}
        )

        status_obj, _ = ExchangeStatus.objects.get_or_create(exchange=exchange)
        status_obj.connected = data['connected']
        if data['connected']:
            status_obj.last_message_at = timezone.now()
            status_obj.retry_count = 0
            status_obj.last_error = ''
        else:
            status_obj.retry_count += 1
            status_obj.last_error = data.get('error', '')
        status_obj.save()

        return Response({'status': 'updated'})


class PriceSnapshotViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PriceSnapshot.objects.select_related('exchange').all()
    serializer_class = PriceSnapshotSerializer
    filterset_fields = ['exchange', 'asset']
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']

    @action(detail=False, methods=['post'])
    def ingest(self, request):
        """Ingest price data from C++ engine."""
        serializer = PriceIngestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        exchange, _ = Exchange.objects.get_or_create(
            name=data['exchange'],
            defaults={'display_name': data['exchange'].title()}
        )

        snapshot = PriceSnapshot.objects.create(
            exchange=exchange,
            asset=data['asset'],
            bid=data['bid'],
            ask=data['ask'],
            bid_qty=data.get('bid_qty', 0),
            ask_qty=data.get('ask_qty', 0),
            timestamp=data['timestamp'],
        )

        # Update exchange status
        status_obj, _ = ExchangeStatus.objects.get_or_create(exchange=exchange)
        status_obj.connected = True
        status_obj.last_message_at = timezone.now()
        status_obj.save()

        return Response(PriceSnapshotSerializer(snapshot).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def latest(self, request):
        """Get latest price for each exchange/asset pair."""
        asset = request.query_params.get('asset')
        if not asset:
            return Response({'error': 'asset parameter required'}, status=400)

        exchanges = Exchange.objects.filter(is_active=True)
        result = []
        for ex in exchanges:
            snapshot = PriceSnapshot.objects.filter(
                exchange=ex, asset=asset
            ).order_by('-timestamp').first()
            if snapshot:
                result.append(PriceSnapshotSerializer(snapshot).data)

        return Response(result)


class ArbitrageEventViewSet(viewsets.ModelViewSet):
    queryset = ArbitrageEvent.objects.select_related('buy_exchange', 'sell_exchange').all()
    serializer_class = ArbitrageEventSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['asset', 'simulated', 'profitable', 'buy_exchange', 'sell_exchange']
    ordering_fields = ['detected_at', 'spread_pct', 'net_profit']
    ordering = ['-detected_at']

    @action(detail=False, methods=['post'])
    def ingest(self, request):
        """Ingest arbitrage opportunity from C++ engine."""
        serializer = ArbitrageEventIngestSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(f"Invalid ingest data: {serializer.errors}")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        # Get or create exchanges
        buy_ex, _ = Exchange.objects.get_or_create(
            name=data['buy_exchange'],
            defaults={'display_name': data['buy_exchange'].title()}
        )
        sell_ex, _ = Exchange.objects.get_or_create(
            name=data['sell_exchange'],
            defaults={'display_name': data['sell_exchange'].title()}
        )

        # Check for duplicate
        if ArbitrageEvent.objects.filter(event_id=data['event_id']).exists():
            return Response({'error': 'Duplicate event_id'}, status=status.HTTP_409_CONFLICT)

        # Create event
        event = ArbitrageEvent.objects.create(
            event_id=data['event_id'],
            asset=data['asset'],
            buy_exchange=buy_ex,
            sell_exchange=sell_ex,
            buy_price=data['buy_price'],
            sell_price=data['sell_price'],
            buy_qty_available=data.get('buy_qty', 0),
            sell_qty_available=data.get('sell_qty', 0),
            spread_pct=data['spread_pct'],
            spread_absolute=data['spread_absolute'],
            detected_at=data.get('timestamp', timezone.now()),
        )

        logger.info(f"Ingested arbitrage event: {event.event_id}, spread={event.spread_pct}%")
        return Response(ArbitrageEventSerializer(event).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def simulate(self, request, pk=None):
        """Simulate trade execution for an opportunity."""
        event = self.get_object()

        if event.simulated:
            return Response({'error': 'Already simulated'}, status=status.HTTP_400_BAD_REQUEST)

        params_serializer = SimulateRequestSerializer(data=request.data)
        if not params_serializer.is_valid():
            return Response(params_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        params_data = params_serializer.validated_data
        params = SimulationParams(
            trade_amount=params_data['amount'],
            latency_ms=params_data['latency_ms'],
        )

        result = simulate_trade(
            buy_price=event.buy_price,
            sell_price=event.sell_price,
            buy_fee_rate=event.buy_exchange.taker_fee,
            sell_fee_rate=event.sell_exchange.taker_fee,
            buy_qty_available=event.buy_qty_available or Decimal("10.0"),
            sell_qty_available=event.sell_qty_available or Decimal("10.0"),
            params=params,
        )

        event.simulated = True
        event.simulated_at = timezone.now()
        event.trade_amount = params.trade_amount
        event.gross_profit = result.gross_profit
        event.total_fees = result.buy_fee + result.sell_fee
        event.slippage_cost = result.slippage_cost
        event.latency_cost = result.latency_cost
        event.net_profit = result.net_profit
        event.profitable = result.profitable
        event.save()

        logger.info(f"Simulated event {event.event_id}: profit={event.net_profit}, profitable={event.profitable}")

        return Response({
            **ArbitrageEventSerializer(event).data,
            'simulation_details': {
                'gross_profit': str(result.gross_profit),
                'buy_fee': str(result.buy_fee),
                'sell_fee': str(result.sell_fee),
                'slippage_cost': str(result.slippage_cost),
                'latency_cost': str(result.latency_cost),
                'net_profit': str(result.net_profit),
                'profitable': result.profitable,
            }
        })

    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get events from last N minutes (default 5)."""
        minutes = int(request.query_params.get('minutes', 5))
        cutoff = timezone.now() - timedelta(minutes=minutes)
        events = self.queryset.filter(detected_at__gte=cutoff)[:100]
        return Response(ArbitrageEventSerializer(events, many=True).data)

    @action(detail=False, methods=['get'])
    def poll(self, request):
        """Fast polling endpoint - returns opportunities since given ID."""
        since_id = int(request.query_params.get('since_id', 0))
        limit = int(request.query_params.get('limit', 50))
        include_simulated = request.query_params.get('include_simulated', 'false').lower() == 'true'
        
        # Get opportunities with ID > since_id
        events = self.queryset.filter(id__gt=since_id)
        
        # Optionally filter to only unsimulated
        if not include_simulated:
            events = events.filter(simulated=False)
        
        events_list = list(events.order_by('id')[:limit])
        
        data = ArbitrageEventSerializer(events_list, many=True).data
        
        # Include latest ID for next poll
        latest_id = events_list[-1].id if events_list else since_id
        
        return Response({
            'opportunities': data,
            'latest_id': latest_id,
            'count': len(data),
        })

    @action(detail=False, methods=['post'])
    def simulate_batch(self, request):
        """Simulate multiple opportunities in a single request for speed."""
        items = request.data.get('items', [])
        if not items:
            return Response({'error': 'No items provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        results = []
        errors = []
        
        for item in items:
            opp_id = item.get('id')
            amount = Decimal(str(item.get('amount', 1)))
            latency_ms = item.get('latency_ms', 100)
            
            try:
                event = ArbitrageEvent.objects.select_related(
                    'buy_exchange', 'sell_exchange'
                ).get(id=opp_id)
                
                if event.simulated:
                    errors.append({'id': opp_id, 'error': 'Already simulated'})
                    continue
                
                params = SimulationParams(
                    trade_amount=amount,
                    latency_ms=latency_ms,
                )
                
                result = simulate_trade(
                    buy_price=event.buy_price,
                    sell_price=event.sell_price,
                    buy_fee_rate=event.buy_exchange.taker_fee,
                    sell_fee_rate=event.sell_exchange.taker_fee,
                    buy_qty_available=event.buy_qty_available or Decimal("10.0"),
                    sell_qty_available=event.sell_qty_available or Decimal("10.0"),
                    params=params,
                )
                
                event.simulated = True
                event.simulated_at = timezone.now()
                event.trade_amount = params.trade_amount
                event.gross_profit = result.gross_profit
                event.total_fees = result.buy_fee + result.sell_fee
                event.slippage_cost = result.slippage_cost
                event.latency_cost = result.latency_cost
                event.net_profit = result.net_profit
                event.profitable = result.profitable
                event.save()
                
                results.append(ArbitrageEventSerializer(event).data)
                
            except ArbitrageEvent.DoesNotExist:
                errors.append({'id': opp_id, 'error': 'Not found'})
            except Exception as e:
                errors.append({'id': opp_id, 'error': str(e)})
        
        return Response({
            'results': results,
            'errors': errors,
            'simulated_count': len(results),
        })

    @action(detail=False, methods=['get'], renderer_classes=[EventStreamRenderer])
    def stream(self, request):
        """Server-Sent Events stream for real-time opportunity updates."""
        def event_stream():
            last_id = int(request.query_params.get('since_id', 0))
            
            while True:
                # Check for new unsimulated opportunities - no limit, stream all new events
                # Must convert to list before accessing elements - .last() doesn't work on sliced querysets
                events_list = list(ArbitrageEvent.objects.filter(
                    id__gt=last_id,
                    simulated=False
                ).select_related('buy_exchange', 'sell_exchange').order_by('id'))
                
                if events_list:
                    last_id = events_list[-1].id
                    data = ArbitrageEventSerializer(events_list, many=True).data
                    yield f"data: {json.dumps({'opportunities': data, 'latest_id': last_id})}\n\n"
                else:
                    # Send heartbeat to keep connection alive
                    yield f": heartbeat\n\n"
                
                time.sleep(0.1)  # 100ms polling interval server-side
        
        response = StreamingHttpResponse(
            event_stream(),
            content_type='text/event-stream'
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get summary statistics."""
        from django.db.models import Avg, Count, Sum, Max, Min

        total = self.queryset.count()
        recent_cutoff = timezone.now() - timedelta(hours=24)
        recent = self.queryset.filter(detected_at__gte=recent_cutoff)

        simulated = self.queryset.filter(simulated=True)
        profitable_count = simulated.filter(profitable=True).count()

        stats = {
            'total_opportunities': total,
            'last_24h_count': recent.count(),
            'simulated_count': simulated.count(),
            'profitable_count': profitable_count,
            'avg_spread': self.queryset.aggregate(avg=Avg('spread_pct'))['avg'],
            'max_spread': self.queryset.aggregate(max=Max('spread_pct'))['max'],
            'total_simulated_profit': simulated.aggregate(sum=Sum('net_profit'))['sum'],
        }
        return Response(stats)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Export opportunities as CSV."""
        queryset = self.filter_queryset(self.get_queryset())

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="opportunities.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Event ID', 'Timestamp', 'Asset', 'Buy Exchange', 'Sell Exchange',
            'Buy Price', 'Sell Price', 'Spread %',
            'Simulated', 'Net Profit', 'Profitable'
        ])

        for opp in queryset[:5000]:
            writer.writerow([
                opp.event_id,
                opp.detected_at.isoformat(),
                opp.asset,
                opp.buy_exchange.name,
                opp.sell_exchange.name,
                opp.buy_price,
                opp.sell_price,
                opp.spread_pct,
                opp.simulated,
                opp.net_profit or '',
                opp.profitable if opp.simulated else '',
            ])

        return response
