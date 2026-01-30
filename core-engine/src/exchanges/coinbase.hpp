#pragma once
#include "../types.hpp"
#include <string>
#include <vector>

namespace ms {
namespace exchanges {

// Coinbase WebSocket configuration
inline ExchangeConfig getCoinbaseConfig(const std::vector<std::string>& assets = {"BTC/USD", "ETH/USD"}) {
    ExchangeConfig config;
    config.name = "coinbase";
    config.host = "ws-feed.exchange.coinbase.com";
    config.port = "443";
    config.path = "/";
    config.assets = assets;
    return config;
}

// Convert our asset format to Coinbase product_id
inline std::string toCoinbaseProductId(const std::string& asset) {
    std::string result = asset;
    for (char& c : result) {
        if (c == '/') c = '-';
    }
    return result;
}

} // namespace exchanges
} // namespace ms
