# MarketScout: 30-Step Build Guide (Detailed File References)
**Parallel Development Plan for Pearl & Conor**

---

## Overview

| Component | Owner | Tech Stack |
|-----------|-------|------------|
| Django REST API | Pearl | Python, Django, DRF, PostgreSQL |
| WebSocket Engine | Conor | C++, Boost.Beast, Boost.Asio |
| Frontend Dashboard | Pearl | React, TypeScript, TanStack Query |
| Arbitrage Detection | **Both** | C++ (Conor), Python (Pearl) |
| Trade Simulation | Pearl | Python/Django |
| Integration & Testing | Both | Docker, pytest, vitest |

---

## Phase 1: Foundation (Steps 1-5)

### Step 1 - Environment Setup

**Overview**: This step establishes the foundational project structure and development environments for both developers. Pearl sets up the Django/Python backend infrastructure with database connectivity, while Conor prepares the C++ build toolchain. Critical to ensure both environments work independently before integration. Keep directory structure clean and consistent with the architecture diagram.

**Pearl's Tasks:**

- **Create project repo structure**
  - **File**: `./` (project root)
  - **Action**: Initialize repository with structure:
    ```
    marketscout/
    ├── middleware/      # Django API
    ├── core-engine/     # C++ engine
    ├── frontend/        # React app
    ├── .gitignore
    └── docker-compose.yml
    ```
  - **Context**: Set up .gitignore for Python (`__pycache__/`, `*.pyc`, `venv/`), Node (`node_modules/`), and C++ (`build/`, `*.o`)

- **Setup Python venv + Django project**
  - **Files**: 
    - `middleware/manage.py` (will be created)
    - `middleware/marketscout/` (Django project directory)
  - **Commands**:
    ```bash
    cd middleware
    python -m venv venv
    source venv/bin/activate  # or venv\Scripts\activate on Windows
    pip install django djangorestframework
    django-admin startproject marketscout .
    python manage.py startapp api
    ```
  - **Context**: Creates Django project with main app called `api`

- **Install PostgreSQL via Docker**
  - **File**: `docker-compose.yml` (create new)
  - **Content**:
    ```yaml
    version: '3.8'
    services:
      db:
        image: postgres:15-alpine
        environment:
          POSTGRES_DB: marketscout
          POSTGRES_USER: ms_user
          POSTGRES_PASSWORD: ms_secure_pass_2024
        ports:
          - "5433:5432"
        volumes:
          - pgdata:/var/lib/postgresql/data
    volumes:
      pgdata:
    ```
  - **Reference**: See existing `docker-compose.yml` lines 1-16

**Conor's Tasks:**

- **Install CMake, Boost, OpenSSL**
  - **System-level**: No file reference
  - **Verification command**:
    ```bash
    cmake --version  # Should be 3.16+
    # Check Boost installation
    # Check OpenSSL installation
    ```
  - **Context**: Ubuntu: `sudo apt install cmake libboost-all-dev libssl-dev`

- **Create C++ project with CMakeLists.txt**
  - **File**: `core-engine/CMakeLists.txt` (create new, ~60 lines)
  - **Content**: Define project, set C++17, find Boost/OpenSSL packages
  - **Reference**: See existing `core-engine/CMakeLists.txt` lines 1-60
  - **Key sections**:
    - Lines 1-6: Project setup and C++ standard
    - Lines 9-11: Find required packages
    - Lines 25-32: Source files list
    - Lines 34-47: Executable and linking

- **Verify compiler toolchain (C++17)**
  - **File**: `core-engine/src/main.cpp` (create simple test)
  - **Content**:
    ```cpp
    #include <iostream>
    int main() {
        std::cout << "MarketScout Engine - Build test\n";
        return 0;
    }
    ```
  - **Build commands**:
    ```bash
    mkdir build && cd build
    cmake ..
    cmake --build .
    ./engine
    ```

---

### Step 2 - Base Configuration

**Overview**: Configures core settings and dependencies for both stacks. Django needs database connections, CORS for frontend communication, and DRF for API serialization. C++ requires strongly-typed configuration structures and Boost/OpenSSL linking. Environment variables ensure portability across development/production. Version-pin all dependencies to prevent compatibility issues during deployment.

**Pearl's Tasks:**

- **Create Django settings.py**
  - **File**: `middleware/marketscout/settings.py` (modify Django-generated file)
  - **Lines to modify**:
    - Line 13-24: Add to `INSTALLED_APPS`:
      ```python
      'rest_framework',
      'corsheaders',
      'django_filters',
      'api',
      ```
    - Line 26-35: Add CORS to `MIDDLEWARE` (first item)
    - Lines 80-100: Configure `DATABASES` with PostgreSQL
    - Lines 110-130: Add `LOGGING` configuration
  - **Reference**: Existing file at `middleware/marketscout/settings.py`

- **Setup DATABASE_URL env variable**
  - **File**: `middleware/.env` (create new)
  - **Content**:
    ```
    DATABASE_URL=postgres://ms_user:ms_secure_pass_2024@localhost:5433/marketscout
    SECRET_KEY=your-secret-key-change-in-production
    DEBUG=True
    ALLOWED_HOSTS=localhost,127.0.0.1,*
    ```
  - **File**: `middleware/.env.example` (create template)
  - **Install**: Add `python-dotenv` to requirements

- **Create requirements.txt**
  - **File**: `middleware/requirements.txt` (create new, ~10 lines)
  - **Content**:
    ```
    django==4.2.9
    djangorestframework==3.14.0
    django-cors-headers==4.3.1
    django-filter==23.5
    psycopg2-binary==2.9.9
    python-dotenv==1.0.0
    ```
  - **Reference**: Existing file at `middleware/requirements.txt` lines 1-9

**Conor's Tasks:**

- **Create config.hpp with app constants**
  - **File**: `core-engine/src/config.hpp` (create new, ~40 lines)
  - **Content**: Define Config struct with singleton pattern
  - **Reference**: Existing file at `core-engine/src/config.hpp`
  - **Key sections**:
    ```cpp
    struct Config {
        std::string api_host = "localhost";
        std::string api_port = "8000";
        double min_spread_pct = 0.1;
        // ...
    };
    Config& getConfig();  // Singleton getter
    ```

- **Create types.hpp with shared data types**
  - **File**: `core-engine/src/types.hpp` (create new, ~80 lines)
  - **Content**: Define structs for PriceData, ArbitrageOpportunity, etc.
  - **Reference**: Existing file at `core-engine/src/types.hpp`
  - **Key structs** (lines 10-80):
    - `PriceData` (lines 10-20)
    - `ArbitrageOpportunity` (lines 22-35)
    - `ConnectionState` enum (lines 37-42)
    - `ExchangeConfig` (lines 44-55)

- **Add Boost dependencies to CMakeLists.txt**
  - **File**: `core-engine/CMakeLists.txt`
  - **Lines to add**: 9-11 (find_package statements)
  - **Lines to add**: 41-47 (target_link_libraries)
  - **Reference**: Lines 9-11, 41-47 in existing CMakeLists.txt

---

### Step 3 - Logging & Utilities

**Overview**: Implements comprehensive logging for debugging and monitoring across both systems. Django logging captures API requests, errors, and business logic events. C++ logger provides thread-safe, performance-optimized logging for high-frequency events. Both should use consistent log levels (DEBUG, INFO, ERROR) and timestamps for correlation during debugging. File-based logs persist for troubleshooting production issues.

**Pearl's Tasks:**

- **Setup Django logging config**
  - **File**: `middleware/marketscout/settings.py`
  - **Lines**: Add after line 130 (end of file)
  - **Content**:
    ```python
    LOGGING = {
        'version': 1,
        'disable_existing_loggers': False,
        'formatters': {
            'verbose': {
                'format': '{levelname} {asctime} {module} {message}',
                'style': '{',
            },
        },
        'handlers': {
            'file': {
                'level': 'INFO',
                'class': 'logging.FileHandler',
                'filename': BASE_DIR / 'logs' / 'marketscout.log',
                'formatter': 'verbose',
            },
            'console': {
                'level': 'DEBUG',
                'class': 'logging.StreamHandler',
                'formatter': 'verbose',
            },
        },
        'loggers': {
            'api': {
                'handlers': ['file', 'console'],
                'level': 'DEBUG',
                'propagate': False,
            },
        },
    }
    ```
  - **Also create**: `middleware/logs/` directory

- **Create api/__init__.py structure**
  - **File**: `middleware/api/__init__.py` (already exists, keep empty or add version)
  - **Files to verify exist**:
    - `middleware/api/models.py`
    - `middleware/api/views.py`
    - `middleware/api/serializers.py`
    - `middleware/api/urls.py`
  - **Reference**: Existing files in `middleware/api/`

- **Test Django runserver works**
  - **Commands**:
    ```bash
    cd middleware
    python manage.py migrate
    python manage.py createsuperuser
    python manage.py runserver
    ```
  - **Verify**: Navigate to http://localhost:8000/admin/
  - **Context**: Should see Django admin interface

**Conor's Tasks:**

- **Create logger.hpp with log macros**
  - **File**: `core-engine/src/logger.hpp` (create new, ~80 lines)
  - **Content**: Logger singleton class with thread-safe output
  - **Reference**: Existing file at `core-engine/src/logger.hpp`
  - **Key sections**:
    - Lines 8-15: LogLevel enum
    - Lines 17-45: Logger class (singleton pattern)
    - Lines 47-80: LOG_* macros

- **Implement LOG_INFO, LOG_DEBUG, LOG_ERROR**
  - **File**: `core-engine/src/logger.hpp`
  - **Lines**: 47-80 (macro definitions)
  - **Example usage**:
    ```cpp
    LOG_INFO("Starting engine v", VERSION);
    LOG_DEBUG("Price update: ", exchange, " ", asset);
    LOG_ERROR("Connection failed: ", error_msg);
    ```

- **Test basic CMake build compiles**
  - **File**: `core-engine/src/main.cpp`
  - **Modify**: Add logger includes and test logging
  - **Build**:
    ```bash
    cd build
    cmake ..
    make
    ./engine
    ```
  - **Expected output**: Log messages with timestamps

---

### Step 4 - Database Models (Pearl) / Types (Conor)

**Overview**: Defines the core data structures for the entire system. Django models provide persistent storage with foreign keys and indexes for efficient queries. C++ structs enable fast in-memory operations with type safety. Both must represent the same business entities (exchanges, prices, opportunities) with matching field types. DecimalField precision (8 decimal places) critical for accurate financial calculations.

**Pearl's Tasks:**

- **Define Exchange model**
  - **File**: `middleware/api/models.py`
  - **Lines**: 1-20 (create Exchange class)
  - **Reference**: Existing file lines 6-20
  - **Content**:
    ```python
    class Exchange(models.Model):
        name = models.CharField(max_length=50, unique=True)
        display_name = models.CharField(max_length=100)
        websocket_url = models.URLField(blank=True)
        maker_fee = models.DecimalField(max_digits=8, decimal_places=6, default=Decimal("0.001"))
        taker_fee = models.DecimalField(max_digits=8, decimal_places=6, default=Decimal("0.001"))
        is_active = models.BooleanField(default=True)
        created_at = models.DateTimeField(auto_now_add=True)
    ```

- **Define ExchangeStatus model**
  - **File**: `middleware/api/models.py`
  - **Lines**: 22-33 (after Exchange model)
  - **Reference**: Lines 22-33 in existing models.py
  - **Content**: OneToOne with Exchange, connection tracking fields

- **Define PriceSnapshot model**
  - **File**: `middleware/api/models.py`
  - **Lines**: 35-54
  - **Reference**: Lines 35-54 in existing models.py
  - **Key fields**: exchange (FK), asset, bid, ask, bid_qty, ask_qty, timestamp
  - **Indexes**: Lines 46-49 (composite indexes for queries)

- **Define ArbitrageEvent model**
  - **File**: `middleware/api/models.py`
  - **Lines**: 56-97
  - **Reference**: Lines 56-97 in existing models.py
  - **Key fields**: event_id, asset, buy/sell exchanges, prices, spread, simulation results

- **Run initial migrations**
  - **Commands**:
    ```bash
    python manage.py makemigrations
    python manage.py migrate
    ```
  - **Creates**: `middleware/api/migrations/0001_initial.py`
  - **Reference**: Existing file at `middleware/api/migrations/0001_initial.py`

**Conor's Tasks:**

- **Define PriceData struct**
  - **File**: `core-engine/src/types.hpp`
  - **Lines**: 10-20
  - **Reference**: Lines 10-20 in existing types.hpp
  - **Members**: exchange, asset, bid, ask, bid_qty, ask_qty, timestamp

- **Define ArbitrageOpportunity struct**
  - **File**: `core-engine/src/types.hpp`
  - **Lines**: 22-35
  - **Reference**: Lines 22-35 in existing types.hpp
  - **Members**: event_id, asset, exchanges, prices, spread_pct, spread_absolute

- **Define ConnectionState enum**
  - **File**: `core-engine/src/types.hpp`
  - **Lines**: 37-45
  - **Values**: Disconnected, Connecting, Connected, Reconnecting, Failed

- **Define ExchangeConfig struct**
  - **File**: `core-engine/src/types.hpp`
  - **Lines**: 47-60
  - **Members**: name, host, port, path, assets[], subscribe_message_template

- **Validate types compile correctly**
  - **Test file**: `core-engine/tests/test_types.cpp` (create new)
  - **Content**: Instantiate all structs, test serialization
  - **Build**: Add to CMakeLists.txt tests section

---

### Step 5 - Docker Foundation

**Overview**: Containerizes each component for consistent deployment and development. Multi-stage Docker builds minimize production image sizes. PostgreSQL healthcheck ensures database ready before migrations run. Each service isolated but networked for communication. This foundation enables one-command deployment and prevents "works on my machine" issues. Document any platform-specific build quirks encountered.

**Pearl's Tasks:**

- **Create middleware/Dockerfile**
  - **File**: `middleware/Dockerfile` (create new, ~20 lines)
  - **Reference**: Existing file at `middleware/Dockerfile`
  - **Content**: Multi-stage build with Python 3.11, copy requirements, install deps, copy code
  - **Key lines**:
    - Line 1: `FROM python:3.11-slim`
    - Lines 5-7: Copy and install requirements
    - Lines 10-15: Copy Django code, expose port 8000

- **Add PostgreSQL to docker-compose.yml**
  - **File**: `docker-compose.yml` (update from Step 1)
  - **Lines**: 1-16 (db service definition)
  - **Reference**: Existing lines 1-16 in docker-compose.yml
  - **Add**: healthcheck (lines 12-16)

- **Verify migrations run in container**
  - **Commands**:
    ```bash
    docker-compose up -d db
    docker-compose run middleware python manage.py migrate
    ```
  - **Verify**: Check PostgreSQL tables created

**Conor's Tasks:**

- **Create core-engine/Dockerfile**
  - **File**: `core-engine/Dockerfile` (create new, ~30 lines)
  - **Reference**: Existing file at `core-engine/Dockerfile`
  - **Multi-stage**:
    - Lines 1-15: Builder stage (CMake, Boost, compile)
    - Lines 17-30: Runtime stage (minimal libs, copy binary)

- **Test Docker build for C++ engine**
  - **Commands**:
    ```bash
    cd core-engine
    docker build -t marketscout-engine .
    docker run marketscout-engine --help
    ```
  - **Verify**: Engine binary runs in container

- **Document build dependencies**
  - **File**: `core-engine/README.md` (create new)
  - **Sections**:
    - Prerequisites (CMake 3.16+, Boost 1.70+, OpenSSL 1.1+)
    - Build instructions
    - Common errors and solutions

---

## Phase 2: Core Components (Steps 6-12)

### Step 6 - REST API Scaffolding

**Overview**: Creates the REST API foundation using Django REST Framework patterns. ViewSets provide CRUD operations, serializers handle validation, routers generate URL patterns automatically. This establishes the communication layer between C++ engine and frontend. URL structure follows RESTful conventions (/api/exchanges/, /api/prices/). Test endpoints return empty results initially—data ingestion comes later steps.

**Pearl's Tasks:**

- **Create ExchangeSerializer**
  - **File**: `middleware/api/serializers.py`
  - **Lines**: 1-20 (create class)
  - **Reference**: Existing file, search for `ExchangeSerializer` class
  - **Content**:
    ```python
    class ExchangeSerializer(serializers.ModelSerializer):
        status = serializers.SerializerMethodField()
        
        class Meta:
            model = Exchange
            fields = ['id', 'name', 'display_name', 'websocket_url', 
                     'maker_fee', 'taker_fee', 'is_active', 'status']
    ```

- **Create ExchangeViewSet**
  - **File**: `middleware/api/views.py`
  - **Lines**: 40-60 (create class)
  - **Reference**: Lines 41-87 in existing views.py
  - **Content**: ModelViewSet with queryset, serializer_class

- **Setup URL routing for /api/exchanges/**
  - **File**: `middleware/api/urls.py`
  - **Lines**: 1-15
  - **Reference**: Existing urls.py
  - **Content**:
    ```python
    from rest_framework.routers import DefaultRouter
    router = DefaultRouter()
    router.register(r'exchanges', ExchangeViewSet, basename='exchanges')
    urlpatterns = router.urls
    ```
  - **File**: `middleware/marketscout/urls.py`
  - **Add**: `path('api/', include('api.urls'))`

**Conor's Tasks:**

- **Implement WebSocketClient class**
  - **File**: `core-engine/src/websocket_client.hpp` (create new, ~65 lines)
  - **Reference**: Existing file at `core-engine/src/websocket_client.hpp`
  - **Key sections**:
    - Lines 20-25: Callback typedefs
    - Lines 27-40: Public methods (connect, send, close)
    - Lines 42-64: Private members and methods

- **Add connect() method with SSL**
  - **File**: `core-engine/src/websocket_client.cpp` (create new)
  - **Function**: `void WebSocketClient::connect(...)` (~50 lines)
  - **Reference**: Existing websocket_client.cpp, connect implementation
  - **Steps**: Resolve DNS → TCP connect → SSL handshake → WS handshake

- **Add async resolve and handshake**
  - **File**: `core-engine/src/websocket_client.cpp`
  - **Functions**: 
    - `on_resolve()` (~20 lines)
    - `on_connect()` (~15 lines)
    - `on_ssl_handshake()` (~15 lines)
    - `on_handshake()` (~20 lines)

---

### Step 7 - WebSocket Client Implementation

**Overview**: Implements bidirectional WebSocket communication for real-time price data. C++ client handles SSL/TLS connections asynchronously using Boost.Beast. Read loop continuously processes messages without blocking. Write queue manages subscription requests. Connection lifecycle (resolve→connect→handshake→read/write) critical for reliability. Error handling and reconnection logic prevent permanent failures from temporary network issues.

**Pearl's Tasks:**

- **Create PriceSnapshotSerializer**
  - **File**: `middleware/api/serializers.py`
  - **Lines**: After ExchangeSerializer (~line 25)
  - **Reference**: Search for `PriceSnapshotSerializer` in serializers.py
  - **Fields**: exchange, asset, bid, ask, bid_qty, ask_qty, timestamp

- **Create PriceSnapshotViewSet**
  - **File**: `middleware/api/views.py`
  - **Lines**: ~89-144 (after ExchangeViewSet)
  - **Reference**: Lines 89-144 in existing views.py
  - **Type**: ReadOnlyModelViewSet with filtering and pagination

- **Add /api/prices/ endpoint**
  - **File**: `middleware/api/urls.py`
  - **Line**: Add to router (after exchanges)
  - **Code**: `router.register(r'prices', PriceSnapshotViewSet)`

**Conor's Tasks:**

- **Implement on_read() message loop**
  - **File**: `core-engine/src/websocket_client.cpp`
  - **Function**: `void WebSocketClient::do_read()` and `on_read()`
  - **Lines**: ~100-140
  - **Logic**: Async read → parse → callback → queue next read

- **Implement send() for subscriptions**
  - **File**: `core-engine/src/websocket_client.cpp`
  - **Functions**: `send()` and `do_write()`
  - **Lines**: ~150-180
  - **Logic**: Queue message → async write → handle completion

- **Add close() and reconnection logic**
  - **File**: `core-engine/src/websocket_client.cpp`
  - **Function**: `void WebSocketClient::close()`
  - **Lines**: ~200-220
  - **Logic**: Send close frame, cleanup, exponential backoff for reconnect

---

### Step 8 - Exchange Handlers

**Overview**: Implements exchange-specific integration logic. Each exchange (Binance, Coinbase, Kraken) has unique WebSocket URLs, message formats, and subscription protocols. Exchange handlers normalize these differences into consistent PriceData structures. Django serializers prepare for opportunity ingestion. This abstraction layer allows adding new exchanges without changing core detection logic. Document each exchange's API quirks.

**Pearl's Tasks:**

- **Create ArbitrageEventSerializer**
  - **File**: `middleware/api/serializers.py`
  - **Lines**: ~50-80 (after PriceSnapshotSerializer)
  - **Reference**: Search for `ArbitrageEventSerializer`
  - **Nested**: Include exchange objects, format decimals

- **Create ArbitrageEventViewSet**
  - **File**: `middleware/api/views.py`
  - **Lines**: 146-434 (large class with many actions)
  - **Reference**: Lines 146-434 in existing views.py
  - **Includes**: ingest, simulate, stats, export actions

- **Add /api/opportunities/ endpoint**
  - **File**: `middleware/api/urls.py`
  - **Add**: `router.register(r'opportunities', ArbitrageEventViewSet)`

**Conor's Tasks:**

- **Create exchanges/binance.hpp**
  - **File**: `core-engine/src/exchanges/binance.hpp` (create new)
  - **Reference**: Existing file at `core-engine/src/exchanges/binance.hpp`
  - **Function**: `ExchangeConfig getBinanceConfig(std::vector<std::string> assets)`
  - **Lines**: ~15-25 (function implementation)

- **Create exchanges/coinbase.hpp**
  - **File**: `core-engine/src/exchanges/coinbase.hpp`
  - **Reference**: Existing file
  - **Function**: `ExchangeConfig getCoinbaseConfig(...)`

- **Create exchanges/kraken.hpp**
  - **File**: `core-engine/src/exchanges/kraken.hpp`
  - **Reference**: Existing file
  - **Function**: `ExchangeConfig getKrakenConfig(...)`

---

### Step 9 - Price Ingestion Endpoint

**Overview**: Establishes the data flow from C++ engine to Django database. POST /api/prices/ingest/ receives real-time price updates and persists them. Exchange status tracking provides system health monitoring. This is the first integration point between C++ and Django—coordinate on JSON payload structure. Validation ensures data quality (positive prices, valid timestamps). Fast ingestion critical as prices arrive continuously.

**Pearl's Tasks:**

- **Implement POST /api/prices/ingest/**
  - **File**: `middleware/api/views.py`
  - **Class**: PriceSnapshotViewSet
  - **Method**: `@action(detail=False, methods=['post']) def ingest(self, request)`
  - **Lines**: ~96-126 in existing views.py
  - **Logic**: Validate → Create Exchange if needed → Create PriceSnapshot → Update status

- **Validate and store PriceSnapshot**
  - **File**: `middleware/api/serializers.py`
  - **Add**: `PriceIngestSerializer` class
  - **Validation**: Positive prices, valid timestamp, required fields

- **Update ExchangeStatus on ingest**
  - **File**: `middleware/api/views.py`
  - **Lines**: 119-123 (in ingest method)
  - **Logic**: get_or_create ExchangeStatus, set connected=True, update timestamp

**Conor's Tasks:**

- **Parse Binance bookTicker JSON**
  - **File**: `core-engine/src/exchanges/binance.cpp` (create new)
  - **Reference**: Existing file
  - **Function**: `PriceData parseBinanceMessage(const std::string& json)`
  - **Lines**: ~30-60
  - **Fields**: Extract 's', 'b', 'B', 'a', 'A' from JSON

- **Parse Coinbase ticker JSON**
  - **File**: `core-engine/src/exchanges/coinbase.cpp`
  - **Function**: `PriceData parseCoinbaseMessage(...)`
  - **Format**: Different structure (type: "ticker")

- **Parse Kraken ticker JSON**
  - **File**: `core-engine/src/exchanges/kraken.cpp`
  - **Function**: `PriceData parseKrakenMessage(...)`
  - **Format**: Array format [channelID, data, channelName, pair]

---

### Step 10 - Connection Manager

**Overview**: Manages multiple simultaneous WebSocket connections to different exchanges. ConnectionManager orchestrates lifecycle (start/stop) and monitors health of all connections. Exponential backoff prevents thundering herd during reconnections. Status endpoint provides real-time visibility into connection health for operations monitoring. Thread-safe design handles concurrent callbacks from multiple WebSocket clients. Graceful shutdown ensures clean disconnects.

**Pearl's Tasks:**

- **Implement exchange status endpoint**
  - **File**: `middleware/api/views.py`
  - **Class**: ExchangeViewSet
  - **Method**: `@action(detail=False, methods=['get']) def status(self, request)`
  - **Lines**: 46-60 in existing views.py
  - **Returns**: List of all exchanges with connection status

- **Add GET /api/exchanges/status/**
  - **Route**: Automatic via @action decorator
  - **URL**: `/api/exchanges/status/`
  - **Response**: JSON array with exchange status objects

- **Return connected/disconnected states**
  - **File**: `middleware/api/views.py`
  - **Lines**: 52-59 (in status method)
  - **Format**: Include name, connected, last_message_at, retry_count

**Conor's Tasks:**

- **Create ConnectionManager class**
  - **File**: `core-engine/src/connection_manager.hpp` (create new)
  - **Reference**: Existing file at `core-engine/src/connection_manager.hpp`
  - **Lines**: ~20-50 (class definition)
  - **Members**: map of exchange name → WebSocketClient shared_ptr

- **Implement addExchange() method**
  - **File**: `core-engine/src/connection_manager.cpp`
  - **Lines**: ~30-50
  - **Logic**: Accept ExchangeConfig, create WebSocketClient, store in map

- **Implement start()/stop() lifecycle**
  - **File**: `core-engine/src/connection_manager.cpp`
  - **Functions**: 
    - `void start()` (~20 lines)
    - `void stop()` (~15 lines)
  - **Logic**: Iterate connections, call connect/close on each

- **Add reconnection with backoff**
  - **File**: `core-engine/src/connection_manager.cpp`
  - **Logic in**: Error callbacks
  - **Formula**: delay = min(initial * 2^retries, max_delay)

---

### Step 11 - Price Tracker

**Overview**: Implements in-memory storage for latest prices from each exchange-asset pair. PriceTracker enables fast lookups during arbitrage detection without database queries. Thread-safe map handles concurrent updates from multiple WebSocket threads. Timestamp-based cleanup prevents memory leaks from stale data. Opportunity ingestion endpoint receives detected arbitrage from C++ engine. Event ID uniqueness prevents duplicate opportunity records.

**Pearl's Tasks:**

- **Add opportunity ingest endpoint**
  - **File**: `middleware/api/views.py`
  - **Class**: ArbitrageEventViewSet
  - **Method**: `def ingest(self, request)` at lines 154-194
  - **Reference**: Lines 154-194 in existing views.py
  - **Logic**: Validate → Create exchanges → Check duplicates → Create event

- **POST /api/opportunities/ingest/**
  - **Route**: Via @action decorator
  - **Serializer**: ArbitrageEventIngestSerializer
  - **Validation**: event_id unique, spread_pct > 0, buy_price < sell_price

- **Validate and create ArbitrageEvent**
  - **File**: `middleware/api/views.py`
  - **Lines**: 175-191 (event creation logic)
  - **Check**: Duplicate event_id (line 175-176)
  - **Create**: ArbitrageEvent with all fields (lines 179-191)

**Conor's Tasks:**

- **Create PriceTracker class**
  - **File**: `core-engine/src/price_tracker.hpp` (create new)
  - **Reference**: Existing file at `core-engine/src/price_tracker.hpp`
  - **Lines**: ~15-40 (class definition)
  - **Members**: `std::map<std::pair<std::string, std::string>, PriceData>` with mutex

- **Implement update(PriceData)**
  - **File**: `core-engine/src/price_tracker.cpp`
  - **Function**: `bool PriceTracker::update(const PriceData& price)`
  - **Lines**: ~15-30
  - **Logic**: Lock mutex, update map entry, return true if updated

- **Implement getPrice(exchange, asset)**
  - **File**: `core-engine/src/price_tracker.cpp`
  - **Function**: `std::optional<PriceData> getPrice(...)`
  - **Lines**: ~35-50
  - **Logic**: Lock, find in map, return optional

- **Add timestamp-based cleanup**
  - **File**: `core-engine/src/price_tracker.cpp`
  - **Function**: `void cleanup(std::chrono::seconds max_age)`
  - **Lines**: ~55-75
  - **Logic**: Iterate map, remove stale entries

---

### Step 12 - Arbitrage Detection (Both Work on Detection Logic)

**Overview**: **CRITICAL COLLABORATION STEP**. Both developers implement identical arbitrage detection algorithms in different languages. C++ version provides real-time detection with <10ms latency. Python version validates results and serves as backup. Spread calculation formula MUST match exactly: `spread_pct = (sell_price - buy_price) / buy_price * 100`. Coordinate closely—pair program or sync daily. Document shared algorithm specification. Validation endpoint cross-checks implementations.

**Pearl's Tasks:**

- **Create Python arbitrage detector service**
  - **File**: `middleware/api/services/detector.py` (create new)
  - **Lines**: 1-120 (full implementation)
  - **Class**: `ArbitrageDetector`
  - **Method**: `detect_opportunities(price_snapshots, threshold=0.1)`
  - **Algorithm**:
    ```python
    def detect_opportunities(self, price_snapshots, threshold=0.1):
        # Group prices by asset
        # For each asset, compare all exchange pairs
        # Calculate spread_pct = (sell_price - buy_price) / buy_price * 100
        # Filter by threshold
        # Return list of opportunities
    ```

- **Implement detection algorithm in Python**
  - **File**: `middleware/api/services/detector.py`
  - **Lines**: ~25-80 (algorithm implementation)
  - **Steps**:
    1. Query latest PriceSnapshot for each exchange
    2. Nested loop: compare all exchange pairs
    3. Calculate spread_pct (MUST MATCH C++ formula exactly)
    4. Filter spread_pct >= threshold
    5. Return opportunities with all details

- **Add detection validation endpoint**
  - **File**: `middleware/api/views.py`
  - **Add new**: `@action(detail=False, methods=['post']) def validate(self, request)`
  - **Location**: In ArbitrageEventViewSet, after ingest
  - **Logic**: 
    - Run Python detector on recent prices
    - Compare with C++ engine submissions
    - Return accuracy metrics

- **Add query filters to viewsets**
  - **File**: `middleware/api/views.py`
  - **Class**: ArbitrageEventViewSet
  - **Lines**: 148-152 (filter configuration)
  - **Reference**: Lines 149-152 in existing views.py
  - **Filters**: asset, simulated, profitable, buy_exchange, sell_exchange

**Conor's Tasks:**

- **Create C++ ArbitrageDetector class**
  - **File**: `core-engine/src/arbitrage_detector.hpp` (create new)
  - **Reference**: Existing file at `core-engine/src/arbitrage_detector.hpp`
  - **Lines**: ~15-45 (class definition)
  - **Constructor**: Accept PriceTracker& and min_spread_pct
  - **Members**: callback function, opportunities_found counter

- **Implement checkAll() scan in C++**
  - **File**: `core-engine/src/arbitrage_detector.cpp`
  - **Function**: `void ArbitrageDetector::checkAll()`
  - **Lines**: ~30-100 (main detection logic)
  - **Reference**: Existing implementation
  - **Algorithm** (MUST MATCH Python):
    ```cpp
    void checkAll() {
        // Get all unique assets from tracker
        for each asset:
            // Get prices from all exchanges
            for (i = 0; i < exchanges.size(); i++):
                for (j = i+1; j < exchanges.size(); j++):
                    // Compare exchange[i] vs exchange[j]
                    spread_pct = (sell_price - buy_price) / buy_price * 100
                    if (spread_pct >= min_spread_pct):
                        // Create opportunity, invoke callback
    }
    ```

- **Calculate spread_pct formula**
  - **File**: `core-engine/src/arbitrage_detector.cpp`
  - **Lines**: ~70-85 (spread calculation)
  - **Formula**: `spread_pct = (sell_price - buy_price) / buy_price * 100.0`
  - **Also calculate**: `spread_absolute = sell_price - buy_price`
  - **Precision**: Round to 4 decimal places
  - **IMPORTANT**: This formula must match Python implementation exactly

- **Implement callback for opportunities**
  - **File**: `core-engine/src/arbitrage_detector.cpp`
  - **Lines**: ~90-110 (callback invocation)
  - **Logic**:
    1. Generate unique event_id (UUID or timestamp+hash)
    2. Create ArbitrageOpportunity struct
    3. Invoke callback function
    4. Catch exceptions to prevent crashes
    5. Increment opportunities_found counter

**Cross-validation Files:**
- Create shared test file: `tests/test_detection_algorithm.py` for both to verify
- Document algorithm: `docs/DETECTION_ALGORITHM.md` with exact formula and examples

---

## Phase 3: API Client & Simulation (Steps 13-17)

### Step 13 - C++ API Client

**Overview**: Bridges C++ engine and Django API via HTTP. ApiClient handles JSON serialization and HTTP requests for opportunity submission. Simulation service models realistic trading costs (fees, slippage, latency). Dataclasses provide type-safe parameter passing. This enables paper trading analysis without real money. Coordinate on SimulationParams structure—both need same fields. Async HTTP prevents blocking detector thread.

**Pearl's Tasks:**

- **Create simulation service module**
  - **File**: `middleware/api/services/__init__.py` (exists)
  - **File**: `middleware/api/services/simulation.py` (create new)
  - **Reference**: Existing file at `middleware/api/services/simulation.py`
  - **Lines**: 1-150 (full simulation implementation)

- **Define SimulationParams dataclass**
  - **File**: `middleware/api/services/simulation.py`
  - **Lines**: ~8-15
  - **Content**:
    ```python
    @dataclass
    class SimulationParams:
        trade_amount: Decimal
        latency_ms: int = 100
        slippage_bps: int = 5
        price_impact_rate: Decimal = Decimal("0.001")
    ```

- **Define SimulationResult dataclass**
  - **File**: `middleware/api/services/simulation.py`
  - **Lines**: ~18-30
  - **Fields**: gross_profit, buy_fee, sell_fee, slippage_cost, latency_cost, net_profit, profitable

**Conor's Tasks:**

- **Create ApiClient class**
  - **File**: `core-engine/src/api_client.hpp` (create new)
  - **Reference**: Existing file at `core-engine/src/api_client.hpp`
  - **Lines**: ~20-50 (class definition)
  - **Members**: base_url, submitted_count, failed_count

- **Implement submitOpportunity() POST**
  - **File**: `core-engine/src/api_client.cpp`
  - **Function**: `bool ApiClient::submitOpportunity(const ArbitrageOpportunity& opp)`
  - **Lines**: ~40-100
  - **Logic**: Serialize to JSON → POST to /api/opportunities/ingest/ → Handle response

- **Implement updateExchangeStatus() POST**
  - **File**: `core-engine/src/api_client.cpp`
  - **Function**: `void ApiClient::updateExchangeStatus(...)`
  - **Lines**: ~110-150
  - **Endpoint**: POST /api/exchanges/update_status/

---

### Step 14 - Trade Simulation Logic

**Overview**: Implements paper trading simulation with realistic cost modeling. Calculates gross profit, then subtracts exchange fees (maker/taker), slippage (market impact), and latency costs (price movement during execution). Models help predict actual profitability before real trading. Use Decimal type for financial precision—never floats for money. Simulation results guide which opportunities worth pursuing. Counters track API submission success rates.

**Pearl's Tasks:**

- **Implement simulate_trade() function**
  - **File**: `middleware/api/services/simulation.py`
  - **Function**: `def simulate_trade(buy_price, sell_price, ...)`
  - **Lines**: ~35-120
  - **Reference**: Existing implementation in simulation.py
  - **Returns**: SimulationResult object

- **Calculate gross profit**
  - **File**: `middleware/api/services/simulation.py`
  - **Lines**: ~50-55 (in simulate_trade function)
  - **Formula**: `gross_profit = (sell_price - buy_price) * amount`

- **Calculate maker/taker fees**
  - **File**: `middleware/api/services/simulation.py`
  - **Lines**: ~60-70
  - **Formula**: 
    ```python
    buy_fee = buy_price * amount * buy_fee_rate
    sell_fee = sell_price * amount * sell_fee_rate
    ```

- **Model slippage and latency costs**
  - **File**: `middleware/api/services/simulation.py`
  - **Lines**: ~75-100
  - **Formulas**: Complex slippage and latency models

**Conor's Tasks:**

- **Integrate ApiClient into main.cpp**
  - **File**: `core-engine/src/main.cpp`
  - **Lines**: Add around line 58 (after detector setup)
  - **Reference**: Lines 58-70 in existing main.cpp
  - **Code**: `ApiClient api(config.api_host, config.api_port);`

- **Wire detector callback to API**
  - **File**: `core-engine/src/main.cpp`
  - **Lines**: 61-70 (detector callback lambda)
  - **Reference**: Lines 61-70 in existing main.cpp
  - **Logic**: `detector.setCallback([&api](const ArbitrageOpportunity& opp) { api.submitOpportunity(opp); });`

- **Add submission counters**
  - **File**: `core-engine/src/api_client.hpp`
  - **Lines**: Add member variables and getters
  - **Getters**: `int getSubmittedCount()`, `int getFailedCount()`

---

### Step 15 - Simulation Endpoint

**Overview**: Exposes simulation functionality via REST API for manual testing and frontend triggering. POST /{id}/simulate/ runs paper trade calculations on detected opportunities. Stores results in database for historical analysis. Prevents re-simulation (idempotent). Returns detailed breakdown for transparency. Background threads in engine (stats, cleanup) maintain system health. Test complete engine startup to verify all components working together.

**Pearl's Tasks:**

- **Create POST /{id}/simulate/ action**
  - **File**: `middleware/api/views.py`
  - **Class**: ArbitrageEventViewSet
  - **Method**: `@action(detail=True, methods=['post']) def simulate(self, request, pk=None)`
  - **Lines**: 196-248 in existing views.py
  - **Reference**: Lines 196-248

- **Accept amount, latency_ms params**
  - **File**: `middleware/api/serializers.py`
  - **Add**: `SimulateRequestSerializer` class
  - **Fields**: amount (Decimal), latency_ms (int)
  - **Validation**: amount > 0, latency_ms in range 0-10000

- **Store simulation results in event**
  - **File**: `middleware/api/views.py`
  - **Lines**: 224-233 (in simulate method)
  - **Update**: event.simulated, event.simulated_at, all cost fields

- **Return detailed breakdown**
  - **File**: `middleware/api/views.py`
  - **Lines**: 237-248 (response construction)
  - **Include**: ArbitrageEventSerializer + simulation_details nested dict

**Conor's Tasks:**

- **Add stats logging thread**
  - **File**: `core-engine/src/main.cpp`
  - **Lines**: 130-142 (stats thread)
  - **Reference**: Lines 130-142 in existing main.cpp
  - **Logs**: Tracked prices, opportunities found, API stats

- **Add cleanup thread**
  - **File**: `core-engine/src/main.cpp`
  - **Lines**: 123-128 (cleanup thread)
  - **Reference**: Lines 123-128 in existing main.cpp
  - **Logic**: Call tracker.cleanup(60s) every 30 seconds

- **Test full engine startup**
  - **Run**: `./build/engine --verbose`
  - **Verify**: All threads start, connections establish, no crashes

---

### Step 16 - Batch Operations

**Overview**: Optimizes simulation of multiple opportunities with single API call. Batch endpoint reduces HTTP overhead for bulk operations. Command-line arguments provide runtime configuration without recompilation. Verbose mode enables detailed debugging. Min-spread threshold filters noise. API host/port flexibility supports different deployment environments. Partial success handling ensures some simulations succeed even if others fail.

**Pearl's Tasks:**

- **Implement POST /simulate_batch/**
  - **File**: `middleware/api/views.py`
  - **Class**: ArbitrageEventViewSet
  - **Method**: `@action(detail=False, methods=['post']) def simulate_batch(self, request)`
  - **Lines**: 285-346 in existing views.py
  - **Reference**: Lines 285-346

- **Process multiple simulations**
  - **File**: `middleware/api/views.py`
  - **Lines**: 293-340 (iteration loop)
  - **Logic**: Iterate items, simulate each, collect results and errors

- **Return results and errors**
  - **File**: `middleware/api/views.py`
  - **Lines**: 342-346 (response)
  - **Format**: {results: [], errors: [], simulated_count: N}

**Conor's Tasks:**

- **Add command line argument parsing**
  - **File**: `core-engine/src/main.cpp`
  - **Lines**: 28-48 (argument parsing loop)
  - **Reference**: Lines 28-48 in existing main.cpp
  - **Arguments**: --verbose, --min-spread, --api-host, --api-port

- **--verbose, --min-spread flags**
  - **File**: `core-engine/src/main.cpp`
  - **Lines**: 30-33 (verbose), 32-35 (min-spread)
  - **Logic**: Set Logger level, update config.min_spread_pct

- **--api-host, --api-port flags**
  - **File**: `core-engine/src/main.cpp`
  - **Lines**: 34-39
  - **Logic**: Update config values from argv

---

### Step 17 - Statistics Endpoint

**Overview**: Provides aggregate analytics for dashboard visualization and system monitoring. Database aggregations compute metrics efficiently (count, average, max, sum). Statistics include total opportunities, spread distribution, profitability rate, cumulative profit. Recent (24h) metrics show current system performance. Mock API testing validates engine behavior before live integration. Counters in engine expose operational metrics.

**Pearl's Tasks:**

- **Implement GET /api/opportunities/stats/**
  - **File**: `middleware/api/views.py`
  - **Class**: ArbitrageEventViewSet
  - **Method**: `@action(detail=False, methods=['get']) def stats(self, request)`
  - **Lines**: 380-401 in existing views.py
  - **Reference**: Lines 380-401

- **Aggregate: count, avg_spread, max_spread**
  - **File**: `middleware/api/views.py`
  - **Lines**: 385-398 (aggregation queries)
  - **Uses**: Django ORM aggregate functions (Avg, Max, Count, Sum)

- **Calculate profitable_count**
  - **File**: `middleware/api/views.py`
  - **Lines**: 390-391
  - **Query**: Filter simulated=True and profitable=True

- **Sum total simulated profit**
  - **File**: `middleware/api/views.py`
  - **Line**: 399
  - **Query**: `simulated.aggregate(sum=Sum('net_profit'))['sum']`

**Conor's Tasks:**

- **Test engine with mock API**
  - **Tool**: Use Postman, curl, or Python mock server
  - **Test**: POST to /api/opportunities/ingest/ returns 201
  - **Verify**: Engine handles 4xx/5xx responses

- **Verify opportunity submission**
  - **File to check**: Engine logs
  - **Look for**: ">>> ARBITRAGE DETECTED <<<" messages
  - **Verify**: API receives POST requests

- **Log API success/failure stats**
  - **File**: `core-engine/src/main.cpp`
  - **Lines**: 138-140 (in stats thread)
  - **Output**: "API submissions: X (failed: Y)"

---

## Phase 4: Frontend Foundation (Steps 18-22)

### Step 18 - React Project Setup

**Overview**: Initializes modern React development environment with TypeScript for type safety. Vite provides fast build times and hot module replacement. TanStack Query handles caching and automatic refetching. React Router enables multi-page navigation. Environment variables configure API endpoint per deployment. While frontend starts, Conor optimizes C++ detector performance targeting <10ms execution for real-time responsiveness.

**Pearl's Tasks:**

- **Create Vite + React + TypeScript project**
  - **Commands**:
    ```bash
    npm create vite@latest frontend -- --template react-ts
    cd frontend
    ```
  - **Files created**: package.json, tsconfig.json, vite.config.ts, src/main.tsx, src/App.tsx

- **Install dependencies (react-router, tanstack-query)**
  - **File**: `frontend/package.json`
  - **Commands**:
    ```bash
    npm install react-router-dom @tanstack/react-query axios date-fns recharts
    npm install -D @types/node
    ```
  - **Reference**: Existing package.json lines 11-20 (dependencies)

- **Setup VITE_API_URL environment variable**
  - **File**: `frontend/.env` (create new)
  - **Content**: `VITE_API_URL=http://localhost:8000/api`
  - **File**: `frontend/.env.example`
  - **Usage in code**: `import.meta.env.VITE_API_URL`

**Conor's Tasks:**

- **Performance profile the detector**
  - **File**: `core-engine/src/arbitrage_detector.cpp`
  - **Add**: Timing code using `std::chrono::high_resolution_clock`
  - **Target**: checkAll() should execute in <10ms

- **Optimize checkAll() loop**
  - **File**: `core-engine/src/arbitrage_detector.cpp`
  - **Lines**: Review entire checkAll() implementation
  - **Optimize**: Minimize allocations, use const references

- **Reduce allocations in hot path**
  - **File**: `core-engine/src/arbitrage_detector.cpp`
  - **Use**: Pre-allocated buffers, string_view, move semantics
  - **Profile**: Use valgrind --tool=massif

---

### Step 19 - API Client & Types

**Overview**: Creates TypeScript API client mirroring backend endpoints with type-safe interfaces. Axios handles HTTP requests with proper error handling. TypeScript interfaces match Django model structures preventing runtime errors. API functions return typed promises for compile-time checking. Parallel to frontend work, C++ undergoes stress testing with multiple exchanges ensuring thread safety and reconnection stability under production conditions.

**Pearl's Tasks:**

- **Create src/api/client.ts**
  - **File**: `frontend/src/api/client.ts` (create new)
  - **Reference**: Existing file at `frontend/src/api/client.ts` (~200 lines)
  - **Lines**: Full implementation with all API functions

- **Define TypeScript interfaces**
  - **File**: `frontend/src/api/client.ts`
  - **Lines**: 1-50 (interface definitions)
  - **Interfaces**: ArbitrageEvent, Exchange, ExchangeStatus, StatsResponse

- **Implement fetchRecentOpportunities()**
  - **File**: `frontend/src/api/client.ts`
  - **Function**: `export async function fetchRecentOpportunities(minutes: number = 5)`
  - **Lines**: ~60-70
  - **Endpoint**: GET `/api/opportunities/recent/?minutes=${minutes}`

- **Implement fetchStats()**
  - **File**: `frontend/src/api/client.ts`
  - **Function**: `export async function fetchStats()`
  - **Lines**: ~110-120
  - **Endpoint**: GET `/api/opportunities/stats/`

**Conor's Tasks:**

- **Test with 3 exchanges simultaneously**
  - **File**: `core-engine/src/main.cpp`
  - **Lines**: 96-98 (addExchange calls)
  - **Verify**: All three connect, no race conditions

- **Verify thread safety**
  - **Tool**: Compile with `-fsanitize=thread`
  - **Files to check**: price_tracker.cpp, connection_manager.cpp
  - **Run**: Stress test with high message frequency

- **Stress test reconnection logic**
  - **Test**: Kill WebSocket connections, verify reconnect
  - **Check**: Exponential backoff works, retry_count increments

---

### Step 20 - Core Components & Detection Tests

**Overview**: Builds reusable UI components for data visualization and monitoring. OpportunityTable displays opportunities with formatting and interactions. Stats cards show key metrics. SystemStatus monitors exchange connectivity. **Critical**: Python detector tests validate algorithm matches C++ implementation—cross-language validation prevents divergence. Components use consistent styling and handle loading/error states. C++ tests ensure edge cases handled correctly.

**Pearl's Tasks:**

- **Create OpportunityTable component**
  - **File**: `frontend/src/components/OpportunityTable.tsx` (create new)
  - **Reference**: Existing file (~200 lines)
  - **Props**: opportunities[], onRowClick, showSimulate, hideProfit
  - **Lines**: Full table implementation with formatting

- **Create Stats component**
  - **File**: `frontend/src/components/Stats.tsx` (create new)
  - **Reference**: Existing file (~150 lines)
  - **Lines**: Full implementation with metric cards

- **Create SystemStatus component**
  - **File**: `frontend/src/components/SystemStatus.tsx` (create new)
  - **Reference**: Existing file (~100 lines)
  - **Lines**: Exchange status indicators with auto-refresh

- **Write Python detector tests**
  - **File**: `middleware/api/tests/test_detector.py` (create new)
  - **Lines**: 1-150 (full test suite)
  - **Tests**:
    - Test detect_opportunities() with mock data
    - Test spread calculation matches C++
    - Test threshold filtering
    - Cross-validate against database opportunities

**Conor's Tasks:**

- **Write unit tests for C++ ArbitrageDetector**
  - **File**: `core-engine/tests/test_detector.cpp` (exists)
  - **Reference**: Existing file
  - **Lines**: ~50-150 (test cases)
  - **Tests**: Mock PriceTracker, test detection, test thresholds

- **Test spread calculation edge cases**
  - **File**: `core-engine/tests/test_detector.cpp`
  - **Add tests**: Zero prices, equal prices, extreme spreads
  - **Verify**: Matches Python implementation

- **Test with varying price inputs**
  - **File**: `core-engine/tests/test_detector.cpp`
  - **Add tests**: Many exchanges, many assets, rapid updates

---

### Step 21 - Dashboard Page

**Overview**: Assembles components into main dashboard view with auto-refresh for real-time monitoring. useQuery hooks manage data fetching with 3-second intervals. Loading states provide user feedback during API calls. Error boundaries handle failures gracefully. Dashboard emphasizes recent opportunities for quick decision-making. Connection tests validate WebSocket robustness—disconnects, reconnects, malformed messages must not crash system.

**Pearl's Tasks:**

- **Create Dashboard.tsx page**
  - **File**: `frontend/src/pages/Dashboard.tsx` (create new)
  - **Reference**: Existing file at `frontend/src/pages/Dashboard.tsx` (~75 lines)
  - **Lines**: Full component with useQuery hooks

- **Integrate Stats component**
  - **File**: `frontend/src/pages/Dashboard.tsx`
  - **Line**: 28 (render Stats)
  - **Code**: `<Stats hideProfitStat />`

- **Integrate OpportunityTable**
  - **File**: `frontend/src/pages/Dashboard.tsx`
  - **Lines**: 51-58 (render table with loading/error states)
  - **Props**: opportunities={data}, showSimulate=false

- **Add auto-refresh with useQuery**
  - **File**: `frontend/src/pages/Dashboard.tsx`
  - **Lines**: 13-17 (useQuery config)
  - **Config**: refetchInterval: 3000 (3 seconds)

**Conor's Tasks:**

- **Write ConnectionManager tests**
  - **File**: `core-engine/tests/test_connection_manager.cpp` (create new)
  - **Tests**: addExchange, start, stop, error handling

- **Test disconnect/reconnect**
  - **Test**: Simulate network failures
  - **Verify**: Reconnection attempts, backoff works

- **Test invalid message handling**
  - **Test**: Send malformed JSON
  - **Verify**: Errors logged, connection stays stable

---

### Step 22 - Charts & Visualization

**Overview**: Adds data visualization using Recharts for spread distribution analysis. Bar charts bin opportunities by spread ranges revealing market patterns. CSS variables enable consistent theming and future dark mode support. Memory profiling ensures C++ engine stable during extended operations—no leaks from continuous WebSocket processing. Cleanup optimization prevents unbounded memory growth. Long-running stability tests validate production readiness.

**Pearl's Tasks:**

- **Create SpreadChart component**
  - **File**: `frontend/src/components/SpreadChart.tsx` (create new)
  - **Reference**: Existing file (~120 lines)
  - **Install**: `npm install recharts`
  - **Lines**: Full BarChart implementation with spread distribution

- **Show spread distribution**
  - **File**: `frontend/src/components/SpreadChart.tsx`
  - **Lines**: ~40-80 (chart rendering)
  - **Bins**: 0-0.5%, 0.5-1%, 1-2%, 2%+

- **Style with CSS variables**
  - **File**: `frontend/src/index.css`
  - **Lines**: Add around line 10 (after base styles)
  - **Variables**:
    ```css
    :root {
      --primary: #3b82f6;
      --accent-green: #10b981;
      --accent-red: #ef4444;
      --accent-yellow: #f59e0b;
      --background: #0f172a;
      --border: #334155;
    }
    ```

**Conor's Tasks:**

- **Profile memory usage**
  - **Tool**: `valgrind --leak-check=full ./engine`
  - **Monitor**: RSS over 30+ minutes
  - **Verify**: No leaks, memory plateaus

- **Optimize PriceTracker cleanup**
  - **File**: `core-engine/src/price_tracker.cpp`
  - **Function**: cleanup() method
  - **Benchmark**: Measure execution time

- **Test long-running stability**
  - **Test**: Run engine for several hours
  - **Monitor**: Memory, CPU, logs
  - **Verify**: No crashes, reconnection still works

---

## Phase 5: Advanced Features (Steps 23-26)

### Step 23 - Real-time Updates

**Overview**: Implements Server-Sent Events for push-based real-time updates eliminating polling overhead. SSE stream sends new opportunities as detected with automatic reconnection. Heartbeats keep connection alive through firewalls/proxies. Concurrent with SSE implementation, final C++ optimization focuses on hot paths—minimize allocations in detector loop, conditional debug logging avoids string formatting overhead when not needed. Production performance verified.

**Pearl's Tasks:**

- **Implement SSE stream endpoint**
  - **File**: `middleware/api/views.py`
  - **Class**: ArbitrageEventViewSet
  - **Method**: `@action(detail=False, methods=['get'], renderer_classes=[EventStreamRenderer]) def stream(self, request)`
  - **Lines**: 348-378 in existing views.py
  - **Reference**: Lines 348-378

- **GET /api/opportunities/stream/**
  - **File**: `middleware/api/views.py`
  - **Lines**: 351-370 (event_stream generator)
  - **Logic**: Poll DB every 100ms, yield new opportunities

- **Yield new opportunities as JSON**
  - **File**: `middleware/api/views.py`
  - **Lines**: 364-365 (yield statement)
  - **Format**: `data: {json}\n\n` (SSE format)

**Conor's Tasks:**

- **Final engine optimization pass**
  - **Files**: All .cpp files in src/
  - **Review**: Minimize allocations, use move semantics
  - **Profile**: One final profiling run

- **Reduce logging in hot paths**
  - **File**: `core-engine/src/main.cpp`, price_tracker.cpp
  - **Change**: Make debug logs conditional
  - **Measure**: Throughput with/without debug logging

- **Add conditional debug logging**
  - **File**: `core-engine/src/logger.hpp`
  - **Add**: `isDebugEnabled()` method
  - **Use**: `if (Logger::instance().isDebugEnabled()) LOG_DEBUG(...)`

---

### Step 24 - Advanced Mode Page

**Overview**: Creates comprehensive simulation environment with filtering, manual simulation triggers, and advanced analytics. Filters enable focusing on specific assets/exchanges/spreads. EventSource connects to SSE stream for real-time updates. Manual simulation supports what-if analysis with custom parameters. Integration testing validates end-to-end data flow: live exchange → C++ detector → Django API → PostgreSQL. Verify database contains expected data.

**Pearl's Tasks:**

- **Create AdvancedMode.tsx page**
  - **File**: `frontend/src/pages/AdvancedMode.tsx` (create new)
  - **Reference**: Existing file (~1600 lines - very complex)
  - **Note**: This is a fully-featured simulation environment

- **Add filtering controls**
  - **File**: `frontend/src/pages/AdvancedMode.tsx`
  - **Lines**: ~200-400 (filter panel implementation)
  - **Controls**: Asset dropdown, exchange checkboxes, date pickers, spread sliders

- **Add manual simulation trigger**
  - **File**: `frontend/src/pages/AdvancedMode.tsx`
  - **Lines**: ~500-700 (simulation logic)
  - **Modal**: Shows parameters, calls simulate endpoint

- **Connect to SSE stream**
  - **File**: `frontend/src/pages/AdvancedMode.tsx`
  - **Lines**: Look for EventSource usage
  - **Logic**: Connect to /api/opportunities/stream/, handle messages

**Conor's Tasks:**

- **Integration test: engine → API**
  - **File**: `tests/integration_test.py` (create new in project root)
  - **Lines**: ~100 lines
  - **Logic**: Start services, wait for submissions, verify DB

- **Verify data arrives in database**
  - **Tool**: psql or pgAdmin
  - **Query**: `SELECT * FROM api_arbitrageevent ORDER BY detected_at DESC LIMIT 10;`
  - **Verify**: event_id, spread_pct, exchanges populated

- **Test with real exchange data**
  - **Run**: `./engine` connected to live exchanges
  - **Monitor**: Logs for price updates
  - **Note**: Real opportunities may be rare

---

### Step 25 - Trade Detail Modal

**Overview**: Provides detailed opportunity inspection with comprehensive information display. Modal shows all prices, quantities, spreads, and simulation breakdowns. Simulate button enables on-demand paper trading from UI. Raw JSON view aids debugging. Integration tests validate full simulation workflow. Performance documentation captures baseline metrics (latency, throughput, resource usage) establishing monitoring thresholds for production alerting.

**Pearl's Tasks:**

- **Create TradeDetailModal component**
  - **File**: `frontend/src/components/TradeDetailModal.tsx` (create new)
  - **Reference**: Existing file (~200 lines)
  - **Lines**: Full modal implementation with details

- **Show full opportunity details**
  - **File**: `frontend/src/components/TradeDetailModal.tsx`
  - **Lines**: ~50-120 (details rendering)
  - **Display**: event_id, timestamps, prices, quantities, spread

- **Show simulation results**
  - **File**: `frontend/src/components/TradeDetailModal.tsx`
  - **Lines**: ~130-180 (simulation results section)
  - **Display**: Breakdown table with all costs

- **Add simulate button**
  - **File**: `frontend/src/components/TradeDetailModal.tsx`
  - **Lines**: ~190-200 (simulate button and form)
  - **Logic**: Show if !simulated, open form, call API

**Conor's Tasks:**

- **Write integration test script**
  - **File**: `tests/test_simulation_roundtrip.py` (create new)
  - **Lines**: ~80 lines
  - **Logic**: POST opportunity, call simulate, verify results

- **Test simulation round-trip**
  - **Run**: Python script or manual testing
  - **Verify**: net_profit calculation correct, profitable flag accurate

- **Document engine performance**
  - **File**: `core-engine/PERFORMANCE.md` (create new)
  - **Sections**:
    - Throughput metrics
    - Latency measurements
    - Resource usage
    - Tuning recommendations

---

### Step 26 - Export Functionality

**Overview**: Enables data export for external analysis and record-keeping. CSV format universally compatible with Excel, Google Sheets, data analysis tools. Filters apply to export maintaining consistency with UI. Limit prevents memory issues from huge exports. Code cleanup prepares C++ codebase for maintenance—documentation, removing dead code, consistent style. Code review catches potential issues (memory leaks, race conditions, exception safety).

**Pearl's Tasks:**

- **Implement GET /export/ endpoint**
  - **File**: `middleware/api/views.py`
  - **Class**: ArbitrageEventViewSet
  - **Method**: `@action(detail=False, methods=['get']) def export(self, request)`
  - **Lines**: 403-434 in existing views.py
  - **Reference**: Lines 403-434

- **Generate CSV with all fields**
  - **File**: `middleware/api/views.py`
  - **Lines**: 411-431 (CSV writing loop)
  - **Headers**: Event ID, Timestamp, Asset, Exchanges, Prices, Spread, Profit

- **Add Content-Disposition header**
  - **File**: `middleware/api/views.py`
  - **Lines**: 408-409
  - **Header**: `Content-Disposition: attachment; filename="opportunities.csv"`

**Conor's Tasks:**

- **Final cleanup and comments**
  - **Files**: All .cpp and .hpp files
  - **Add**: File-level documentation comments
  - **Remove**: Dead code, debug prints

- **Code review C++ codebase**
  - **Check**: Memory leaks, exception safety, thread safety
  - **Tool**: cppcheck, clang-tidy
  - **Fix**: Any warnings or issues

- **Update README with build steps**
  - **File**: `core-engine/README.md`
  - **Sections**: Prerequisites, build instructions, common errors

---

## Phase 6: Integration & Polish (Steps 27-30)

### Step 27 - Docker Compose Integration

**Overview**: Unifies all services into single-command deployment orchestration. Service dependencies ensure correct startup order (db→middleware→frontend/engine). Healthchecks prevent premature connections. Restart policies enable automatic recovery. Network isolation with service names enables container-to-container communication. STARTUP_DELAY compensates for initialization time. Full-stack testing verifies all components communicate correctly through Docker networking.

**Pearl's Tasks:**

- **Add frontend service to docker-compose**
  - **File**: `docker-compose.yml`
  - **Lines**: Add after middleware service (~line 32)
  - **Reference**: Lines 33-40 in existing docker-compose.yml
  - **Content**:
    ```yaml
    frontend:
      build: ./frontend
      ports:
        - "5173:5173"
      environment:
        VITE_API_URL: http://localhost:8000/api
      depends_on:
        - middleware
    ```

- **Configure service dependencies**
  - **File**: `docker-compose.yml`
  - **Lines**: Update throughout
  - **Add**: healthcheck for db, depends_on conditions

- **Test full stack locally**
  - **Command**: `docker-compose up --build`
  - **Verify**: All services start, check logs, test in browser

**Conor's Tasks:**

- **Add engine service to docker-compose**
  - **File**: `docker-compose.yml`
  - **Lines**: 42-50 in existing file
  - **Reference**: Lines 42-50
  - **Content**:
    ```yaml
    engine:
      build: ./core-engine
      depends_on:
        - middleware
      environment:
        API_BASE_URL: http://middleware:8000
        STARTUP_DELAY: "20"
      restart: unless-stopped
    ```

- **Set STARTUP_DELAY for API readiness**
  - **File**: `core-engine/Dockerfile`
  - **Add**: Entrypoint script that sleeps before starting engine
  - **Alternative**: Implement health check polling in engine

- **Test engine container build**
  - **Command**: `docker-compose build engine`
  - **Verify**: Build succeeds, image size reasonable
  - **Test**: `docker-compose up engine`

---

### Step 28 - End-to-End Testing

**Overview**: Comprehensive testing validates entire system functionality. Django tests cover API endpoints, serializers, business logic with test database. C++ tests against live exchanges validate real-world behavior—connection stability, message parsing, data quality. Long-running tests ensure no degradation over time. Graceful shutdown verification prevents data loss. Test coverage targets >80% for confidence in production deployment.

**Pearl's Tasks:**

- **Write Django API tests**
  - **File**: `middleware/api/tests/__init__.py` (create directory)
  - **Files**: 
    - `test_views.py` (~200 lines)
    - `test_serializers.py` (~100 lines)
    - `test_services.py` (~150 lines)
  - **Run**: `python manage.py test`

- **Test ingest endpoints**
  - **File**: `middleware/api/tests/test_views.py`
  - **Lines**: ~20-60 (ingest test methods)
  - **Tests**: Valid data, validation errors, duplicates

- **Test simulation endpoint**
  - **File**: `middleware/api/tests/test_views.py`
  - **Lines**: ~100-150 (simulation tests)
  - **Tests**: Valid params, already simulated, calculations

**Conor's Tasks:**

- **Run engine against live exchanges**
  - **Run**: `./engine --verbose`
  - **Monitor**: For 1+ hours
  - **Document**: Any issues or API changes

- **Verify opportunities detected**
  - **Check**: Logs for detection messages
  - **Verify**: spread_pct calculations manually
  - **Test**: API receives submissions

- **Test graceful shutdown**
  - **Test**: Send SIGINT (Ctrl+C)
  - **Verify**: Signal handler works, threads stop cleanly
  - **Check**: No segfaults, final stats logged

---

### Step 29 - Frontend Polish

**Overview**: Enhances user experience with polished interactions and error handling. Loading states prevent confusion during data fetches. ErrorBoundary catches React errors gracefully. Responsive design ensures mobile/tablet compatibility. Performance benchmarks establish baseline expectations for production monitoring. Metrics documentation enables observability through Prometheus/Grafana integration. Touch targets sized appropriately for mobile interaction.

**Pearl's Tasks:**

- **Add loading states and spinners**
  - **Files**: All components
  - **Add**: Loading component, skeleton UI
  - **Show**: While isLoading, during refetches

- **Add error handling UI**
  - **File**: `frontend/src/App.tsx`
  - **Add**: ErrorBoundary component
  - **Lines**: Wrap Routes in ErrorBoundary

- **Responsive CSS adjustments**
  - **File**: `frontend/src/index.css`
  - **Add**: Media queries for mobile/tablet
  - **Test**: Various screen sizes

**Conor's Tasks:**

- **Final performance benchmarks**
  - **Measure**: End-to-end latency, throughput, resources
  - **Document**: In PERFORMANCE.md
  - **Baseline**: For production monitoring

- **Document engine metrics**
  - **File**: `core-engine/METRICS.md` (create new)
  - **Content**: CPU, memory, messages/sec, opportunities/hour
  - **Include**: Prometheus/Grafana integration hints

---

### Step 30 - Documentation & Launch

**Overview**: Finalizes documentation for maintenance and onboarding. API documentation enables frontend developers and integrations. Environment variable documentation prevents configuration errors. Quickstart enables rapid deployment. CLI documentation supports operational troubleshooting. Exchange integration guide facilitates adding new markets. Final integration test verifies all success criteria met. Complete system verification from clean state confirms production-ready deployment. 🎉

**Pearl's Tasks:**

- **Write API documentation table**
  - **File**: `README.md` or `docs/API.md`
  - **Section**: API Endpoints
  - **Reference**: Existing README.md lines 112-122
  - **Content**: All endpoints with methods, params, examples

- **Document environment variables**
  - **File**: `middleware/.env.example`
  - **File**: `frontend/.env.example`
  - **Content**: All variables with descriptions

- **Create README.md quickstart**
  - **File**: `README.md` (root)
  - **Reference**: Existing README.md lines 29-82
  - **Sections**: Prerequisites, Quick Start, Project Structure

**Conor's Tasks:**

- **Write engine CLI documentation**
  - **File**: `core-engine/README.md`
  - **Section**: Command-line flags
  - **Include**: Examples, exit codes

- **Document exchange configurations**
  - **File**: `core-engine/docs/EXCHANGES.md` (create new)
  - **Content**: How to add exchanges, ExchangeConfig structure
  - **List**: Supported exchanges and quirks

- **Final integration test**
  - **Run**: `docker-compose up --build`
  - **Test**: Full workflow end-to-end
  - **Verify**: All success criteria met
  - **Celebrate**: 🎉

---

## File Reference Quick Index

### Django/Python Files
- `middleware/marketscout/settings.py` - Django configuration
- `middleware/api/models.py` - Database models (Exchange, PriceSnapshot, ArbitrageEvent)
- `middleware/api/views.py` - API endpoints (viewsets and actions)
- `middleware/api/serializers.py` - DRF serializers
- `middleware/api/services/simulation.py` - Trade simulation logic
- `middleware/api/services/detector.py` - **Python arbitrage detector** (Step 12)
- `middleware/requirements.txt` - Python dependencies

### C++ Files
- `core-engine/CMakeLists.txt` - Build configuration
- `core-engine/src/main.cpp` - Entry point, setup all components
- `core-engine/src/types.hpp` - Core data structures
- `core-engine/src/config.hpp` - Configuration struct
- `core-engine/src/logger.hpp` - Logging macros
- `core-engine/src/websocket_client.{hpp,cpp}` - WebSocket client implementation
- `core-engine/src/price_tracker.{hpp,cpp}` - Thread-safe price storage
- `core-engine/src/arbitrage_detector.{hpp,cpp}` - **C++ arbitrage detector** (Step 12)
- `core-engine/src/api_client.{hpp,cpp}` - HTTP client for Django API
- `core-engine/src/connection_manager.{hpp,cpp}` - Manages multiple WS connections
- `core-engine/src/exchanges/binance.{hpp,cpp}` - Binance-specific logic
- `core-engine/src/exchanges/coinbase.{hpp,cpp}` - Coinbase-specific logic
- `core-engine/src/exchanges/kraken.{hpp,cpp}` - Kraken-specific logic

### Frontend Files
- `frontend/package.json` - Node dependencies
- `frontend/src/main.tsx` - Entry point
- `frontend/src/App.tsx` - Main app component with routing
- `frontend/src/api/client.ts` - API client functions
- `frontend/src/pages/Dashboard.tsx` - Main dashboard page
- `frontend/src/pages/AdvancedMode.tsx` - Advanced simulation mode
- `frontend/src/components/OpportunityTable.tsx` - Table component
- `frontend/src/components/Stats.tsx` - Statistics cards
- `frontend/src/components/SystemStatus.tsx` - Exchange status
- `frontend/src/components/SpreadChart.tsx` - Chart visualization
- `frontend/src/components/TradeDetailModal.tsx` - Detail modal
- `frontend/src/index.css` - Global styles with CSS variables

### Docker & Config Files
- `docker-compose.yml` - Orchestration for all services
- `middleware/Dockerfile` - Django container
- `core-engine/Dockerfile` - C++ engine container (multi-stage)
- `frontend/Dockerfile` - React app container
- `middleware/.env` - Environment variables for Django
- `frontend/.env` - Environment variables for Vite

### Documentation Files
- `README.md` - Main project documentation
- `BUILD_PLAN.md` - This build plan
- `core-engine/README.md` - C++ engine documentation
- `core-engine/PERFORMANCE.md` - Performance metrics (create in Step 25)
- `core-engine/METRICS.md` - Monitoring metrics (create in Step 29)
- `core-engine/docs/EXCHANGES.md` - Exchange integration guide (create in Step 30)
- `docs/DETECTION_ALGORITHM.md` - **Shared algorithm documentation** (Step 12)

---

## Key Sync Points

| Step | Pearl Needs | Conor Needs | Critical Files |
|------|-------------|-------------|----------------|
| 9 | — | API ingest endpoint spec | `views.py:96-126`, `serializers.py` |
| 11 | — | Ingest endpoint working | `views.py:154-194` |
| **12** | **C++ detection algorithm** | **Python detection algorithm** | **`arbitrage_detector.cpp:30-100`**, **`detector.py:25-80`** |
| 13 | — | Simulation params agreed | `simulation.py:8-30`, `api_client.cpp` |
| 27 | Engine Dockerfile | API running in Docker | `docker-compose.yml`, both Dockerfiles |

**Note**: Step 12 requires close collaboration - both developers implement arbitrage detection algorithms that must match exactly. Use pair programming or frequent sync meetings. Document the exact algorithm in `docs/DETECTION_ALGORITHM.md`.

---

## File Ownership

### Pearl Owns:
- `middleware/**` (Django API)
- `frontend/**` (React dashboard)
- `docker-compose.yml` (orchestration)
- `middleware/api/services/detector.py` (**Python detector**)

### Conor Owns:
- `core-engine/**` (C++ engine)
- `core-engine/Dockerfile`
- `core-engine/src/arbitrage_detector.{hpp,cpp}` (**C++ detector**)

### Shared:
- `README.md`
- `.env.example`
- Integration test scripts
- `docs/DETECTION_ALGORITHM.md` (**Algorithm specification**)
- Machine learning (later)

---

## Success Criteria Checklist

- [ ] Engine connects to Binance, Coinbase, Kraken via WebSocket
- [ ] WebSocket connections auto-reconnect after failures
- [ ] Price data ingested and stored in PostgreSQL
- [ ] Arbitrage opportunities detected by C++ engine with configurable threshold
- [ ] Python-based detector validates C++ results with matching algorithm
- [ ] Opportunities submitted to Django API successfully
- [ ] API stores opportunities with all required fields
- [ ] API returns filtered/paginated opportunities
- [ ] Simulation calculates fees, slippage, latency correctly
- [ ] Dashboard displays real-time opportunities with auto-refresh
- [ ] Advanced mode supports filtering by asset/exchange/spread
- [ ] Charts visualize spread distribution
- [ ] Exchange connection status visible in UI
- [ ] Trade detail modal shows comprehensive information
- [ ] Manual simulation triggerable from UI
- [ ] Export to CSV includes all fields
- [ ] Full stack runs via single `docker-compose up` command
- [ ] All services recover gracefully from crashes
- [ ] API tests achieve >80% coverage
- [ ] C++ code compiles without warnings
- [ ] Documentation complete and accurate
- [ ] Performance meets targets (<10ms detection, <100ms API roundtrip)
