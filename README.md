# MarketScout - Crypto Arbitrage Detection System

A real-time cryptocurrency arbitrage detection and paper trading simulation system.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  C++ Engine     │────▶│  Django API      │◀────│  React Frontend │
│  (WebSockets)   │     │  (REST/Storage)  │     │  (Dashboard)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  Exchanges:     │     │  PostgreSQL      │
│  • Binance      │     │  (Data Storage)  │
│  • Coinbase     │     └──────────────────┘
│  • Kraken       │
└─────────────────┘
```

## Features

- **Real-time Data Collection**: WebSocket connections to multiple exchanges
- **Arbitrage Detection**: Identifies price discrepancies across exchanges
- **Paper Trading Simulation**: Models fees, slippage, and latency
- **Live Dashboard**: Real-time visualization with filtering and export

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.11+
- Node.js 18+
- CMake 3.16+ and Boost (for C++ engine)

### Using Docker (Recommended)

```bash
cd marketscout
docker-compose up --build
```

This starts:
- PostgreSQL on port 5432
- Django API on http://localhost:8000
- React frontend on http://localhost:5173

### Manual Setup

1. **Database**:
```bash
docker-compose up db
```

2. **Django API** (new terminal):
```bash
cd middleware
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_data  # Optional: add sample data
python manage.py runserver
```

3. **React Frontend** (new terminal):
```bash
cd frontend
npm install
npm run dev
```

4. **C++ Engine** (new terminal):
```bash
cd core-engine
mkdir build && cd build
cmake ..
cmake --build .
./engine --api-host localhost --api-port 8000
```

## Project Structure

```
marketscout/
├── core-engine/           # C++ WebSocket client & arbitrage detector
│   ├── src/
│   │   ├── main.cpp
│   │   ├── websocket_client.cpp
│   │   ├── price_tracker.cpp
│   │   ├── arbitrage_detector.cpp
│   │   ├── api_client.cpp
│   │   └── exchanges/     # Exchange-specific handlers
│   └── tests/
├── middleware/            # Django REST API
│   ├── api/
│   │   ├── models.py      # Database models
│   │   ├── views.py       # API endpoints
│   │   ├── serializers.py
│   │   └── services/      # Simulation
│   └── marketscout/       # Django settings
├── frontend/              # React dashboard
│   └── src/
│       ├── api/           # API client
│       ├── components/    # UI components
│       └── pages/         # Dashboard & Advanced Mode
└── docker-compose.yml
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/opportunities/` | GET | List all opportunities |
| `/api/opportunities/recent/` | GET | Recent opportunities (last N minutes) |
| `/api/opportunities/ingest/` | POST | Submit new opportunity (from engine) |
| `/api/opportunities/{id}/simulate/` | POST | Run paper trade simulation |
| `/api/opportunities/stats/` | GET | Aggregate statistics |
| `/api/opportunities/export/` | GET | Export as CSV |
| `/api/exchanges/status/` | GET | Exchange connection status |

## Configuration

### C++ Engine Options

```bash
./engine [options]
  -v, --verbose       Enable debug logging
  --min-spread <pct>  Minimum spread % to report (default: 0.1)
  --api-host <host>   Django API host (default: localhost)
  --api-port <port>   Django API port (default: 8000)
```

### Environment Variables

```bash
# middleware/.env
DATABASE_URL=postgres://user:pass@localhost:5432/marketscout
DEBUG=True
SECRET_KEY=your-secret-key

# frontend/.env
VITE_API_URL=http://localhost:8000/api
```

## Management Commands

```bash
# Seed sample data
python manage.py seed_data --count 100
```

## Testing

```bash
# Django tests
cd middleware
python manage.py test

# C++ tests
cd core-engine/build
ctest

# Frontend (add vitest)
cd frontend
npm test
```

## Exchange WebSocket Endpoints

| Exchange | URL | Format |
|----------|-----|--------|
| Binance | wss://stream.binance.com:9443/ws | bookTicker |
| Coinbase | wss://ws-feed.exchange.coinbase.com | ticker |
| Kraken | wss://ws.kraken.com | ticker |

## License

MIT
