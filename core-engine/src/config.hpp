#pragma once
#include <string>
#include <vector>

namespace ms {

struct Config {
    // API endpoint
    std::string api_host = "localhost";
    std::string api_port = "8000";
    
    // Arbitrage detection
    double min_spread_pct = 0.01;  // Minimum 0.01% spread to report (lowered for demo)
    
    // Assets to track
    std::vector<std::string> assets = {
        "BTC/USDT",
        "ETH/USDT",
        "BTC/USD",
        "ETH/USD"
    };
    
    // Connection settings
    int reconnect_delay_ms = 1000;
    int max_reconnect_delay_ms = 60000;
    int heartbeat_interval_ms = 30000;
    
    // Logging
    bool verbose = true;
};

inline Config& getConfig() {
    static Config config;
    return config;
}

} // namespace ms
