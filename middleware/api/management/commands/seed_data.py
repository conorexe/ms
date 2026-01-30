from django.core.management.base import BaseCommand
from django.utils import timezone
from api.models import Exchange, ExchangeStatus, ArbitrageEvent
from decimal import Decimal
import random
import uuid
from datetime import timedelta


class Command(BaseCommand):
    help = 'Seeds database with sample exchanges and arbitrage opportunities'

    def add_arguments(self, parser):
        parser.add_argument(
            '--count',
            type=int,
            default=100,
            help='Number of sample opportunities to create'
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing data before seeding'
        )

    def handle(self, *args, **options):
        if options['clear']:
            self.stdout.write('Clearing existing data...')
            ArbitrageEvent.objects.all().delete()
            Exchange.objects.all().delete()

        # Create exchanges
        exchanges_data = [
            ('binance', 'Binance', Decimal('0.0010'), Decimal('0.0010')),
            ('coinbase', 'Coinbase', Decimal('0.0015'), Decimal('0.0025')),
            ('kraken', 'Kraken', Decimal('0.0016'), Decimal('0.0026')),
        ]

        exchanges = []
        for name, display_name, maker_fee, taker_fee in exchanges_data:
            ex, created = Exchange.objects.get_or_create(
                name=name,
                defaults={
                    'display_name': display_name,
                    'maker_fee': maker_fee,
                    'taker_fee': taker_fee,
                }
            )
            # Create status
            ExchangeStatus.objects.get_or_create(
                exchange=ex,
                defaults={'connected': True}
            )
            exchanges.append(ex)
            if created:
                self.stdout.write(f'  Created exchange: {name}')

        # Create sample opportunities
        assets = ['BTC/USDT', 'ETH/USDT', 'BTC/USD', 'ETH/USD']
        base_prices = {
            'BTC/USDT': 45000,
            'ETH/USDT': 2500,
            'BTC/USD': 45000,
            'ETH/USD': 2500,
        }

        count = options['count']
        self.stdout.write(f'Creating {count} sample opportunities...')

        created_count = 0
        now = timezone.now()

        for i in range(count):
            asset = random.choice(assets)
            base_price = base_prices[asset]
            
            # Random exchanges (different buy and sell)
            buy_ex = random.choice(exchanges)
            sell_ex = random.choice([e for e in exchanges if e != buy_ex])
            
            # Generate realistic spread (0.05% to 0.8%)
            spread_pct = Decimal(str(random.uniform(0.05, 0.8)))
            
            # Calculate prices
            buy_price = Decimal(str(base_price + random.uniform(-100, 100)))
            spread_abs = buy_price * spread_pct / 100
            sell_price = buy_price + spread_abs
            
            # Random quantities
            buy_qty = Decimal(str(random.uniform(0.1, 5.0)))
            sell_qty = Decimal(str(random.uniform(0.1, 5.0)))
            
            # Random time in the past 24 hours
            detected_at = now - timedelta(
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59),
                seconds=random.randint(0, 59)
            )
            
            # Maybe simulate some
            simulated = random.random() < 0.3
            
            event = ArbitrageEvent.objects.create(
                event_id=f'seed_{uuid.uuid4().hex[:12]}',
                detected_at=detected_at,
                asset=asset,
                buy_exchange=buy_ex,
                sell_exchange=sell_ex,
                buy_price=buy_price.quantize(Decimal('0.00000001')),
                sell_price=sell_price.quantize(Decimal('0.00000001')),
                buy_qty_available=buy_qty.quantize(Decimal('0.00000001')),
                sell_qty_available=sell_qty.quantize(Decimal('0.00000001')),
                spread_pct=spread_pct.quantize(Decimal('0.000001')),
                spread_absolute=spread_abs.quantize(Decimal('0.00000001')),
                viability_score=Decimal(str(random.uniform(30, 90))).quantize(Decimal('0.01')),
                simulated=simulated,
            )
            
            if simulated:
                # Calculate simulated profit
                trade_amount = Decimal('1.0')
                gross = (sell_price - buy_price) * trade_amount
                fees = (buy_price * buy_ex.taker_fee + sell_price * sell_ex.taker_fee) * trade_amount
                slippage = buy_price * Decimal('0.0005') * trade_amount
                latency = buy_price * Decimal('0.0001') * trade_amount
                net = gross - fees - slippage - latency
                
                event.simulated_at = detected_at + timedelta(seconds=random.randint(1, 60))
                event.trade_amount = trade_amount
                event.gross_profit = gross.quantize(Decimal('0.00000001'))
                event.total_fees = fees.quantize(Decimal('0.00000001'))
                event.slippage_cost = slippage.quantize(Decimal('0.00000001'))
                event.latency_cost = latency.quantize(Decimal('0.00000001'))
                event.net_profit = net.quantize(Decimal('0.00000001'))
                event.profitable = net > 0
                event.save()
            
            created_count += 1

        self.stdout.write(
            self.style.SUCCESS(f'Successfully created {created_count} sample opportunities')
        )
