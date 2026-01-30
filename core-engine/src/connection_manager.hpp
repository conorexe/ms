#pragma once
#include "websocket_client.hpp"
#include "types.hpp"
#include <boost/asio.hpp>
#include <memory>
#include <vector>
#include <atomic>
#include <functional>

namespace ms {

class ConnectionManager {
public:
    using PriceCallback = std::function<void(const PriceData&)>;
    using StatusCallback = std::function<void(const std::string& exchange, ConnectionState state, const std::string& error)>;
    
    ConnectionManager(net::io_context& ioc, ssl::context& ctx);
    ~ConnectionManager();
    
    void setPriceCallback(PriceCallback cb) { price_callback_ = std::move(cb); }
    void setStatusCallback(StatusCallback cb) { status_callback_ = std::move(cb); }
    
    void addExchange(const ExchangeConfig& config);
    void start();
    void stop();
    
    struct ExchangeState {
        std::string name;
        ConnectionState state = ConnectionState::Disconnected;
        int retry_count = 0;
        std::chrono::steady_clock::time_point last_message;
    };
    
    std::vector<ExchangeState> getStatus() const;
    
private:
    struct ExchangeConnection {
        ExchangeConfig config;
        std::shared_ptr<WebSocketClient> client;
        ExchangeState state;
        std::unique_ptr<net::steady_timer> retry_timer;
    };
    
    net::io_context& ioc_;
    ssl::context& ctx_;
    std::vector<ExchangeConnection> exchanges_;
    PriceCallback price_callback_;
    StatusCallback status_callback_;
    std::atomic<bool> running_{false};
    
    void connect(ExchangeConnection& ex);
    void scheduleReconnect(ExchangeConnection& ex);
    std::chrono::milliseconds getBackoffDelay(int retry_count);
    
    // Exchange-specific message handlers
    void handleBinanceMessage(ExchangeConnection& ex, const std::string& msg);
    void handleCoinbaseMessage(ExchangeConnection& ex, const std::string& msg);
    void handleKrakenMessage(ExchangeConnection& ex, const std::string& msg);
};

} // namespace ms
