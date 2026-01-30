#include "types.hpp"
#include "config.hpp"
#include "logger.hpp"
#include "price_tracker.hpp"
#include "arbitrage_detector.hpp"
#include "api_client.hpp"
#include "connection_manager.hpp"
#include "exchanges/binance.hpp"
#include "exchanges/coinbase.hpp"
#include "exchanges/kraken.hpp"

#include <boost/asio/ssl/context.hpp>
#include <boost/asio/signal_set.hpp>
#include <iostream>
#include <thread>
#include <atomic>
#include <csignal>

using namespace ms;

int main(int argc, char* argv[]) {
    LOG_INFO("=== MarketScout Engine v1.0 ===");
    LOG_INFO("Starting up...");
    
    auto& config = getConfig();
    
    // Parse command line args
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--verbose" || arg == "-v") {
            Logger::instance().setLevel(LogLevel::Debug);
        } else if (arg == "--min-spread" && i + 1 < argc) {
            config.min_spread_pct = std::stod(argv[++i]);
        } else if (arg == "--api-host" && i + 1 < argc) {
            config.api_host = argv[++i];
        } else if (arg == "--api-port" && i + 1 < argc) {
            config.api_port = argv[++i];
        } else if (arg == "--help" || arg == "-h") {
            std::cout << "MarketScout Engine\n"
                      << "Usage: engine [options]\n"
                      << "Options:\n"
                      << "  -v, --verbose       Enable debug logging\n"
                      << "  --min-spread <pct>  Minimum spread % to report (default: 0.1)\n"
                      << "  --api-host <host>   Django API host (default: localhost)\n"
                      << "  --api-port <port>   Django API port (default: 8000)\n"
                      << "  -h, --help          Show this help\n";
            return 0;
        }
    }
    
    LOG_INFO("Configuration:");
    LOG_INFO("  API endpoint: ", config.api_host, ":", config.api_port);
    LOG_INFO("  Min spread: ", config.min_spread_pct, "%");
    
    // Core components
    PriceTracker tracker;
    ArbitrageDetector detector(tracker, config.min_spread_pct);
    ApiClient api(config.api_host, config.api_port);
    
    // Setup arbitrage callback
    detector.setCallback([&api](const ArbitrageOpportunity& opp) {
        LOG_INFO(">>> ARBITRAGE DETECTED <<<");
        LOG_INFO("  Asset: ", opp.asset);
        LOG_INFO("  Buy: ", opp.buy_exchange, " @ ", opp.buy_price);
        LOG_INFO("  Sell: ", opp.sell_exchange, " @ ", opp.sell_price);
        LOG_INFO("  Spread: ", opp.spread_pct, "% ($", opp.spread_absolute, ")");
        
        // Submit to Django API
        api.submitOpportunity(opp);
    });
    
    // IO context and SSL context
    net::io_context ioc;
    ssl::context ctx{ssl::context::tlsv12_client};
    ctx.set_default_verify_paths();
    ctx.set_verify_mode(ssl::verify_peer);
    
    // Connection manager
    ConnectionManager conn_mgr(ioc, ctx);
    
    // Price callback
    conn_mgr.setPriceCallback([&tracker](const PriceData& price) {
        tracker.update(price);
        LOG_DEBUG("Price: ", price.exchange, " ", price.asset, 
                  " bid=", price.bid, " ask=", price.ask);
    });
    
    // Status callback
    conn_mgr.setStatusCallback([&api](const std::string& exchange, ConnectionState state, const std::string& error) {
        LOG_INFO("Exchange ", exchange, " state: ", connectionStateToString(state));
        api.updateExchangeStatus(exchange, state == ConnectionState::Connected, error);
    });
    
    // Add exchanges
    LOG_INFO("Configuring exchanges...");
    conn_mgr.addExchange(exchanges::getBinanceConfig({"BTC/USDT", "ETH/USDT"}));
    conn_mgr.addExchange(exchanges::getCoinbaseConfig({"BTC/USD", "ETH/USD"}));
    conn_mgr.addExchange(exchanges::getKrakenConfig({"BTC/USD", "ETH/USD"}));
    
    // Start connections
    LOG_INFO("Connecting to exchanges...");
    conn_mgr.start();
    
    // Signal handling
    std::atomic<bool> running{true};
    net::signal_set signals(ioc, SIGINT, SIGTERM);
    signals.async_wait([&](const boost::system::error_code&, int sig) {
        LOG_INFO("Received signal ", sig, ", shutting down...");
        running = false;
        conn_mgr.stop();
        ioc.stop();
    });
    
    // Detector thread - periodically checks for arbitrage
    std::thread detector_thread([&]() {
        while (running) {
            detector.checkAll();
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    });
    
    // Cleanup thread - removes stale prices
    std::thread cleanup_thread([&]() {
        while (running) {
            std::this_thread::sleep_for(std::chrono::seconds(30));
            tracker.cleanup(std::chrono::seconds(60));
        }
    });
    
    // Stats thread - periodic logging
    std::thread stats_thread([&]() {
        while (running) {
            std::this_thread::sleep_for(std::chrono::seconds(60));
            if (running) {
                LOG_INFO("=== Stats ===");
                LOG_INFO("  Tracked prices: ", tracker.size());
                LOG_INFO("  Opportunities found: ", detector.getOpportunitiesFound());
                LOG_INFO("  API submissions: ", api.getSubmittedCount(), 
                         " (failed: ", api.getFailedCount(), ")");
            }
        }
    });
    
    LOG_INFO("Engine running. Press Ctrl+C to stop.");
    
    // Run IO context
    ioc.run();
    
    // Cleanup
    running = false;
    if (detector_thread.joinable()) detector_thread.join();
    if (cleanup_thread.joinable()) cleanup_thread.join();
    if (stats_thread.joinable()) stats_thread.join();
    
    LOG_INFO("=== Final Stats ===");
    LOG_INFO("  Total opportunities: ", detector.getOpportunitiesFound());
    LOG_INFO("  API submissions: ", api.getSubmittedCount());
    LOG_INFO("  API failures: ", api.getFailedCount());
    LOG_INFO("Shutdown complete.");
    
    return 0;
}
