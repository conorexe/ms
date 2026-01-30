# MarketScout: 30-Step Build Guide
**Parallel Development Plan for Pearl & Conor**

---

## Overview

| Component | Owner | Tech Stack |
|-----------|-------|------------|
| Django REST API | Pearl | Python, Django, DRF, PostgreSQL |
| WebSocket Engine | Conor | C++, Boost.Beast, Boost.Asio |
| Frontend Dashboard | Pearl | React, TypeScript, TanStack Query |
| Arbitrage Detection | Conor | C++ |
| Trade Simulation | Conor | Python/C++ |
| Integration & Testing | Both | Docker, pytest, vitest |

---

## Phase 1: Foundation (Steps 1-5)

### Step 1 - Environment Setup
| Pearl | Conor |
|-------|-------|
| Create project repo structure | Install CMake, Boost, OpenSSL |
| Setup Python venv + Django project | Create C++ project with CMakeLists.txt |
| Install PostgreSQL via Docker | Verify compiler toolchain (C++17) |

```
marketscout/
├── middleware/      # Pearl
├── core-engine/     # Conor  
├── frontend/        # Pearl (later)
└── docker-compose.yml
```

### Step 2 - Base Configuration
| Pearl | Conor |
|-------|-------|
| Create Django settings.py | Create config.hpp with app constants |
| Setup DATABASE_URL env variable | Create types.hpp with shared data types |
| Create requirements.txt | Add Boost dependencies to CMakeLists.txt |

### Step 3 - Logging & Utilities
| Pearl | Conor |
|-------|-------|
| Setup Django logging config | Create logger.hpp with log macros |
| Create api/__init__.py structure | Implement LOG_INFO, LOG_DEBUG, LOG_ERROR |
| Test Django runserver works | Test basic CMake build compiles |

### Step 4 - Database Models (Pearl) / Types (Conor)
| Pearl | Conor |
|-------|-------|
| Define Exchange model | Define PriceData struct |
| Define ExchangeStatus model | Define ArbitrageOpportunity struct |
| Define PriceSnapshot model | Define ConnectionState enum |
| Define ArbitrageEvent model | Define ExchangeConfig struct |
| Run initial migrations | Validate types compile correctly |

### Step 5 - Docker Foundation
| Pearl | Conor |
|-------|-------|
| Create middleware/Dockerfile | Create core-engine/Dockerfile |
| Add PostgreSQL to docker-compose.yml | Test Docker build for C++ engine |
| Verify migrations run in container | Document build dependencies |

---

## Phase 2: Core Components (Steps 6-12)

### Step 6 - REST API Scaffolding
| Pearl | Conor |
|-------|-------|
| Create ExchangeSerializer | Implement WebSocketClient class |
| Create ExchangeViewSet | Add connect() method with SSL |
| Setup URL routing for /api/exchanges/ | Add async resolve and handshake |

### Step 7 - WebSocket Client Implementation
| Pearl | Conor |
|-------|-------|
| Create PriceSnapshotSerializer | Implement on_read() message loop |
| Create PriceSnapshotViewSet | Implement send() for subscriptions |
| Add /api/prices/ endpoint | Add close() and reconnection logic |

### Step 8 - Exchange Handlers
| Pearl | Conor |
|-------|-------|
| Create ArbitrageEventSerializer | Create exchanges/binance.hpp |
| Create ArbitrageEventViewSet | Create exchanges/coinbase.hpp |
| Add /api/opportunities/ endpoint | Create exchanges/kraken.hpp |

### Step 9 - Price Ingestion Endpoint
| Pearl | Conor |
|-------|-------|
| Implement POST /api/prices/ingest/ | Parse Binance bookTicker JSON |
| Validate and store PriceSnapshot | Parse Coinbase ticker JSON |
| Update ExchangeStatus on ingest | Parse Kraken ticker JSON |

### Step 10 - Connection Manager
| Pearl | Conor |
|-------|-------|
| Implement exchange status endpoint | Create ConnectionManager class |
| Add GET /api/exchanges/status/ | Implement addExchange() method |
| Return connected/disconnected states | Implement start()/stop() lifecycle |
| | Add reconnection with backoff |

### Step 11 - Price Tracker
| Pearl | Conor |
|-------|-------|
| Add opportunity ingest endpoint | Create PriceTracker class |
| POST /api/opportunities/ingest/ | Implement update(PriceData) |
| Validate and create ArbitrageEvent | Implement getPrice(exchange, asset) |
| | Add timestamp-based cleanup |

### Step 12 - Arbitrage Detector
| Pearl | Conor |
|-------|-------|
| Add query filters to viewsets | Create ArbitrageDetector class |
| Filter by asset, exchange, date | Implement checkAll() scan |
| Add pagination (PageNumberPagination) | Calculate spread_pct formula |
| | Implement callback for opportunities |

---

## Phase 3: API Client & Simulation (Steps 13-17)

### Step 13 - C++ API Client
| Pearl | Conor |
|-------|-------|
| Create simulation service module | Create ApiClient class |
| Define SimulationParams dataclass | Implement submitOpportunity() POST |
| Define SimulationResult dataclass | Implement updateExchangeStatus() POST |

### Step 14 - Trade Simulation Logic
| Pearl | Conor |
|-------|-------|
| Implement simulate_trade() function | Integrate ApiClient into main.cpp |
| Calculate gross profit | Wire detector callback to API |
| Calculate maker/taker fees | Add submission counters |
| Model slippage and latency costs | |

### Step 15 - Simulation Endpoint
| Pearl | Conor |
|-------|-------|
| Create POST /{id}/simulate/ action | Add stats logging thread |
| Accept amount, latency_ms params | Add cleanup thread |
| Store simulation results in event | Test full engine startup |
| Return detailed breakdown | |

### Step 16 - Batch Operations
| Pearl | Conor |
|-------|-------|
| Implement POST /simulate_batch/ | Add command line argument parsing |
| Process multiple simulations | --verbose, --min-spread flags |
| Return results and errors | --api-host, --api-port flags |

### Step 17 - Statistics Endpoint
| Pearl | Conor |
|-------|-------|
| Implement GET /api/opportunities/stats/ | Test engine with mock API |
| Aggregate: count, avg_spread, max_spread | Verify opportunity submission |
| Calculate profitable_count | Log API success/failure stats |
| Sum total simulated profit | |

---

## Phase 4: Frontend Foundation (Steps 18-22)

### Step 18 - React Project Setup
| Pearl | Conor |
|-------|-------|
| Create Vite + React + TypeScript project | Performance profile the detector |
| Install dependencies (react-router, tanstack-query) | Optimize checkAll() loop |
| Setup VITE_API_URL environment variable | Reduce allocations in hot path |

### Step 19 - API Client & Types
| Pearl | Conor |
|-------|-------|
| Create src/api/client.ts | Test with 3 exchanges simultaneously |
| Define TypeScript interfaces | Verify thread safety |
| Implement fetchRecentOpportunities() | Stress test reconnection logic |
| Implement fetchStats() | |

### Step 20 - Core Components
| Pearl | Conor |
|-------|-------|
| Create OpportunityTable component | Write unit tests for ArbitrageDetector |
| Create Stats component | Test spread calculation edge cases |
| Create SystemStatus component | Test with varying price inputs |

### Step 21 - Dashboard Page
| Pearl | Conor |
|-------|-------|
| Create Dashboard.tsx page | Write ConnectionManager tests |
| Integrate Stats component | Test disconnect/reconnect |
| Integrate OpportunityTable | Test invalid message handling |
| Add auto-refresh with useQuery | |

### Step 22 - Charts & Visualization
| Pearl | Conor |
|-------|-------|
| Create SpreadChart component | Profile memory usage |
| Show spread distribution | Optimize PriceTracker cleanup |
| Style with CSS variables | Test long-running stability |

---

## Phase 5: Advanced Features (Steps 23-26)

### Step 23 - Real-time Updates
| Pearl | Conor |
|-------|-------|
| Implement SSE stream endpoint | Final engine optimization pass |
| GET /api/opportunities/stream/ | Reduce logging in hot paths |
| Yield new opportunities as JSON | Add conditional debug logging |

### Step 24 - Advanced Mode Page
| Pearl | Conor |
|-------|-------|
| Create AdvancedMode.tsx page | Integration test: engine → API |
| Add filtering controls | Verify data arrives in database |
| Add manual simulation trigger | Test with real exchange data |
| Connect to SSE stream | |

### Step 25 - Trade Detail Modal
| Pearl | Conor |
|-------|-------|
| Create TradeDetailModal component | Write integration test script |
| Show full opportunity details | Test simulation round-trip |
| Show simulation results | Document engine performance |
| Add simulate button | |

### Step 26 - Export Functionality
| Pearl | Conor |
|-------|-------|
| Implement GET /export/ endpoint | Final cleanup and comments |
| Generate CSV with all fields | Code review C++ codebase |
| Add Content-Disposition header | Update README with build steps |

---

## Phase 6: Integration & Polish (Steps 27-30)

### Step 27 - Docker Compose Integration
| Pearl | Conor |
|-------|-------|
| Add frontend service to docker-compose | Add engine service to docker-compose |
| Configure service dependencies | Set STARTUP_DELAY for API readiness |
| Test full stack locally | Test engine container build |

### Step 28 - End-to-End Testing
| Pearl | Conor |
|-------|-------|
| Write Django API tests | Run engine against live exchanges |
| Test ingest endpoints | Verify opportunities detected |
| Test simulation endpoint | Test graceful shutdown |

### Step 29 - Frontend Polish
| Pearl | Conor |
|-------|-------|
| Add loading states and spinners | Final performance benchmarks |
| Add error handling UI | Document engine metrics |
| Responsive CSS adjustments | |

### Step 30 - Documentation & Launch
| Pearl | Conor |
|-------|-------|
| Write API documentation table | Write engine CLI documentation |
| Document environment variables | Document exchange configurations |
| Create README.md quickstart | Final integration test |

**BOTH**: Full docker-compose up --build test, verify all services communicate

---

## Dependency Graph

```
Pearl's Track                           Conor's Track
─────────────                           ─────────────
[Django Setup] ──────────────────────── [C++ Project Setup]
     │                                        │
     ▼                                        ▼
[Database Models]                       [Types & Config]
     │                                        │
     ▼                                        ▼
[REST Endpoints] ◄────── sync point ──► [WebSocket Client]
     │                                        │
     ▼                                        ▼
[Ingest Endpoints] ◄───────────────────► [Exchange Handlers]
     │                                        │
     ▼                                        ▼
[Simulation Service]                    [Arbitrage Detector]
     │                                        │
     ▼                                        ▼
[Stats/Export] ◄───────────────────────► [API Client]
     │                                        │
     ▼                                        │
[React Frontend]                              │
     │                                        │
     ▼                                        │
[Dashboard + Charts] ◄── integration ──► [Engine Main Loop]
     │                                        │
     └─────────────► Docker Compose ◄─────────┘
```

---

## Key Sync Points

| Step | Pearl Needs | Conor Needs |
|------|-------------|-------------|
| 9 | — | API ingest endpoint spec |
| 11 | — | Ingest endpoint working |
| 13 | — | Simulation params agreed |
| 27 | Engine Dockerfile | API running in Docker |

---

## File Ownership

### Pearl Owns:
- `middleware/**` (Django API)
- `frontend/**` (React dashboard)
- `docker-compose.yml` (orchestration)

### Conor Owns:
- `core-engine/**` (C++ engine)
- `core-engine/Dockerfile`

### Shared:
- `README.md`
- `.env.example`
- Integration test scripts

---

## Success Criteria

- [ ] Engine connects to 3 exchanges via WebSocket
- [ ] Arbitrage opportunities detected and submitted to API
- [ ] API stores and serves opportunities with filtering
- [ ] Simulation calculates fees, slippage, latency
- [ ] Dashboard displays real-time opportunities
- [ ] Charts visualize spread distribution
- [ ] Full stack runs via `docker-compose up`
- [ ] Export to CSV works
- [ ] All tests pass

---

## Timeline Estimate

Assuming both developers work full-time:

- **Week 1**: Steps 1-5 (Foundation)
- **Week 2**: Steps 6-12 (Core Components)
- **Week 3**: Steps 13-17 (API Client & Simulation)
- **Week 4**: Steps 18-22 (Frontend Foundation)
- **Week 5**: Steps 23-26 (Advanced Features)
- **Week 6**: Steps 27-30 (Integration & Polish)

**Total: 6 weeks for MVP**

---

## Development Tips

### For Pearl (Backend & Frontend):
- Use Django REST Framework's serializers for validation
- Implement pagination early to handle large datasets
- Use TanStack Query for efficient data fetching
- Test API endpoints with curl/Postman before frontend integration

### For Conor (C++ Engine):
- Use `std::shared_ptr` for WebSocket clients to manage lifecycle
- Implement exponential backoff for reconnections
- Use thread-safe data structures for PriceTracker
- Profile early and often - arbitrage detection is performance-critical

### Communication:
- Sync daily on progress
- Share API endpoint contracts early (Step 9)
- Review each other's Docker builds before final integration
- Test integration points immediately when both sides are ready
