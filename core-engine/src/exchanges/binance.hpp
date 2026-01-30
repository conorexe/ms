#pragma once
#include "../types.hpp"
#include <string>
#include <vector>

namespace ms {
namespace exchanges {

// Binance WebSocket configuration
inline ExchangeConfig getBinanceConfig(const std::vector<std::string>& assets = {"BTC/USDT", "ETH/USDT"}) {
    ExchangeConfig config;
    config.name = "binance";
    config.host = "stream.binance.com";
    config.port = "9443";
    config.assets = assets;
    
    // Build combined stream path
    // Format: /stream?streams=btcusdt@bookTicker/ethusdt@bookTicker
    std::string streams;
    for (const auto& asset : assets) {
        std::string symbol;
        for (char c : asset) {
            if (c != '/') symbol += std::tolower(c);
        }
        if (!streams.empty()) streams += "/";
        streams += symbol + "@bookTicker";
    }
    config.path = "/stream?streams=" + streams;
    
    return config;
}

// Alternative: Single ticker stream
inline ExchangeConfig getBinanceSingleConfig(const std::string& asset) {
    ExchangeConfig config;
    config.name = "binance";
    config.host = "stream.binance.com";
    config.port = "9443";
    config.assets = {asset};
    
    std::string symbol;
    for (char c : asset) {
        if (c != '/') symbol += std::tolower(c);
    }
    config.path = "/ws/" + symbol + "@bookTicker";
    
    return config;
}

} // namespace exchanges
} // namespace ms
