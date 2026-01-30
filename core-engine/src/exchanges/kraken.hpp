#pragma once
#include "../types.hpp"
#include <string>
#include <vector>

namespace ms {
namespace exchanges {

// Kraken WebSocket configuration
inline ExchangeConfig getKrakenConfig(const std::vector<std::string>& assets = {"BTC/USD", "ETH/USD"}) {
    ExchangeConfig config;
    config.name = "kraken";
    config.host = "ws.kraken.com";
    config.port = "443";
    config.path = "/";
    config.assets = assets;
    return config;
}

// Convert our asset format to Kraken pair format
// BTC/USD -> XBT/USD (Kraken uses XBT for Bitcoin)
inline std::string toKrakenPair(const std::string& asset) {
    std::string result = asset;
    if (result.find("BTC") != std::string::npos) {
        result.replace(result.find("BTC"), 3, "XBT");
    }
    return result;
}

} // namespace exchanges
} // namespace ms
