#pragma once
#include <string>
#include <vector>
#include <chrono>
#include <cstdint>

namespace ms {

struct PriceData {
    std::string exchange;
    std::string asset;
    double bid;
    double ask;
    double bid_qty;
    double ask_qty;
    std::chrono::system_clock::time_point timestamp;
    
    double spread() const { return ask - bid; }
    double mid() const { return (bid + ask) / 2.0; }
};

struct ArbitrageOpportunity {
    std::string event_id;
    std::string asset;
    std::string buy_exchange;
    std::string sell_exchange;
    double buy_price;
    double sell_price;
    double buy_qty;
    double sell_qty;
    double spread_pct;
    double spread_absolute;
    std::chrono::system_clock::time_point timestamp;
};

struct ExchangeConfig {
    std::string name;
    std::string host;
    std::string port;
    std::string path;
    std::vector<std::string> assets;
};

enum class ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting
};

inline std::string connectionStateToString(ConnectionState state) {
    switch (state) {
        case ConnectionState::Disconnected: return "disconnected";
        case ConnectionState::Connecting: return "connecting";
        case ConnectionState::Connected: return "connected";
        case ConnectionState::Reconnecting: return "reconnecting";
        default: return "unknown";
    }
}

} // namespace ms
