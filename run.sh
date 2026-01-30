#!/bin/bash

# MarketScout - Development Run Script
# Usage: ./run.sh [component]
# Components: all, db, api, frontend, engine

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[MarketScout]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }

case "${1:-all}" in
  db)
    log "Starting PostgreSQL database..."
    docker-compose up db
    ;;
  
  api)
    log "Starting Django API server..."
    cd middleware
    if [ ! -d "venv" ]; then
      log "Creating virtual environment..."
      python -m venv venv
    fi
    source venv/bin/activate 2>/dev/null || source venv/Scripts/activate
    pip install -q -r requirements.txt
    python manage.py migrate
    python manage.py runserver 0.0.0.0:8000
    ;;
  
  frontend)
    log "Starting React frontend..."
    cd frontend
    npm install
    npm run dev
    ;;
  
  engine)
    log "Building and running C++ engine..."
    cd core-engine
    mkdir -p build
    cd build
    cmake ..
    cmake --build .
    ./engine "$@"
    ;;
  
  seed)
    log "Seeding database with sample data..."
    cd middleware
    source venv/bin/activate 2>/dev/null || source venv/Scripts/activate
    python manage.py seed_data
    success "Database seeded!"
    ;;
  
  docker)
    log "Starting all services with Docker Compose..."
    docker-compose up --build
    ;;
  
  all)
    log "Starting all components..."
    log ""
    log "Run these commands in separate terminals:"
    log ""
    echo "  1. Database:  ./run.sh db"
    echo "  2. API:       ./run.sh api"
    echo "  3. Frontend:  ./run.sh frontend"
    echo "  4. Engine:    ./run.sh engine"
    log ""
    log "Or use Docker: ./run.sh docker"
    ;;
  
  *)
    echo "Usage: ./run.sh [component]"
    echo ""
    echo "Components:"
    echo "  all       Show instructions (default)"
    echo "  docker    Run all with Docker Compose"
    echo "  db        PostgreSQL database"
    echo "  api       Django REST API"
    echo "  frontend  React dashboard"
    echo "  engine    C++ arbitrage engine"
    echo "  seed      Seed database with sample data"
    ;;
esac
