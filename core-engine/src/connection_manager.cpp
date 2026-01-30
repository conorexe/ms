#include "connection_manager.hpp"
#include "logger.hpp"
#include <nlohmann/json.hpp>
#include <algorithm>

namespace ms {

using json = nlohmann::json;

ConnectionManager::ConnectionManager(net::io_context& ioc, ssl::context& ctx)
    : ioc_(ioc), ctx_(ctx) {}

ConnectionManager::~ConnectionManager() {
    stop();
}

void ConnectionManager::addExchange(const ExchangeConfig& config) {
    ExchangeConnection conn;
    conn.config = config;
    conn.state.name = config.name;
    conn.retry_timer = std::make_unique<net::steady_timer>(ioc_);
    exchanges_.push_back(std::move(conn));
}

void ConnectionManager::start() {
    running_ = true;
    for (auto& ex : exchanges_) {
        connect(ex);
    }
}

void ConnectionManager::stop() {
    running_ = false;
    for (auto& ex : exchanges_) {
        if (ex.retry_timer) {
            ex.retry_timer->cancel();
        }
        if (ex.client) {
            ex.client->close();
        }
    }
}

std::chrono::milliseconds ConnectionManager::getBackoffDelay(int retry_count) {
    // Exponential backoff: 1s, 2s, 4s, 8s... max 60s
    int delay = std::min(1000 << retry_count, 60000);
    return std::chrono::milliseconds(delay);
}

void ConnectionManager::connect(ExchangeConnection& ex) {
    if (!running_) return;
    
    ex.state.state = ConnectionState::Connecting;
    if (status_callback_) {
        status_callback_(ex.state.name, ex.state.state, "");
    }
    
    ex.client = std::make_shared<WebSocketClient>(ioc_, ctx_);
    
    auto on_message = [this, &ex](const std::string& msg) {
        ex.state.last_message = std::chrono::steady_clock::now();
        
        if (ex.config.name == "binance") {
            handleBinanceMessage(ex, msg);
        } else if (ex.config.name == "coinbase") {
            handleCoinbaseMessage(ex, msg);
        } else if (ex.config.name == "kraken") {
            handleKrakenMessage(ex, msg);
        }
    };
    
    auto on_error = [this, &ex](const std::string& error) {
        LOG_ERROR(ex.config.name, " error: ", error);
        ex.state.state = ConnectionState::Disconnected;
        if (status_callback_) {
            status_callback_(ex.state.name, ex.state.state, error);
        }
        scheduleReconnect(ex);
    };
    
    auto on_connect = [this, &ex](bool success) {
        if (success) {
            ex.state.state = ConnectionState::Connected;
            ex.state.retry_count = 0;
            LOG_INFO(ex.config.name, " connected successfully");
            
            if (status_callback_) {
                status_callback_(ex.state.name, ex.state.state, "");
            }
            
            // Send subscription messages for specific exchanges
            if (ex.config.name == "coinbase") {
                // Subscribe to ticker channel
                json sub;
                sub["type"] = "subscribe";
                sub["product_ids"] = json::array({"BTC-USD", "ETH-USD"});
                sub["channels"] = json::array({"ticker"});
                ex.client->send(sub.dump());
            } else if (ex.config.name == "kraken") {
                // Subscribe to ticker
                json sub;
                sub["event"] = "subscribe";
                sub["pair"] = json::array({"XBT/USD", "ETH/USD"});
                sub["subscription"] = {{"name", "ticker"}};
                ex.client->send(sub.dump());
            }
        } else {
            scheduleReconnect(ex);
        }
    };
    
    ex.client->connect(ex.config.host, ex.config.port, ex.config.path, 
                       on_message, on_error, on_connect);
}

void ConnectionManager::scheduleReconnect(ExchangeConnection& ex) {
    if (!running_) return;
    
    ex.state.state = ConnectionState::Reconnecting;
    ex.state.retry_count++;
    
    auto delay = getBackoffDelay(ex.state.retry_count);
    LOG_INFO("Reconnecting to ", ex.config.name, " in ", delay.count(), "ms (attempt ", ex.state.retry_count, ")");
    
    ex.retry_timer->expires_after(delay);
    ex.retry_timer->async_wait([this, &ex](boost::system::error_code ec) {
        if (!ec && running_) {
            connect(ex);
        }
    });
}

std::vector<ConnectionManager::ExchangeState> ConnectionManager::getStatus() const {
    std::vector<ExchangeState> result;
    for (const auto& ex : exchanges_) {
        result.push_back(ex.state);
    }
    return result;
}

void ConnectionManager::handleBinanceMessage(ExchangeConnection& ex, const std::string& msg) {
    try {
        auto j = json::parse(msg);
        
        // Binance bookTicker format: {"u":id,"s":"BTCUSDT","b":"50000","B":"1","a":"50001","A":"1"}
        // Also handles combined stream format: {"stream":"btcusdt@bookTicker","data":{...}}
        json ticker_data = j;
        if (j.contains("data")) {
            ticker_data = j["data"];
        }
        
        if (ticker_data.contains("s") && ticker_data.contains("b") && ticker_data.contains("a")) {
            std::string symbol = ticker_data["s"].get<std::string>();
            double bid = std::stod(ticker_data["b"].get<std::string>());
            double ask = std::stod(ticker_data["a"].get<std::string>());
            double bid_qty = std::stod(ticker_data["B"].get<std::string>());
            double ask_qty = std::stod(ticker_data["A"].get<std::string>());
            
            // Convert BTCUSDT -> BTC/USD (normalize to USD for cross-exchange comparison)
            std::string asset;
            if (symbol.size() > 4) {
                if (symbol.substr(symbol.size() - 4) == "USDT") {
                    // Normalize USDT to USD for arbitrage comparison
                    asset = symbol.substr(0, symbol.size() - 4) + "/USD";
                } else if (symbol.substr(symbol.size() - 3) == "USD") {
                    asset = symbol.substr(0, symbol.size() - 3) + "/USD";
                }
            }
            
            if (!asset.empty() && price_callback_) {
                price_callback_({
                    "binance",
                    asset,
                    bid,
                    ask,
                    bid_qty,
                    ask_qty,
                    std::chrono::system_clock::now()
                });
            }
        }
    } catch (const std::exception& e) {
        LOG_DEBUG("Binance parse error: ", e.what());
    }
}

void ConnectionManager::handleCoinbaseMessage(ExchangeConnection& ex, const std::string& msg) {
    try {
        auto j = json::parse(msg);
        
        // Coinbase ticker: {"type":"ticker","product_id":"BTC-USD","price":"50000","best_bid":"49999","best_ask":"50001",...}
        if (j.contains("type") && j["type"] == "ticker") {
            std::string product_id = j["product_id"].get<std::string>();
            
            double bid = 0, ask = 0;
            if (j.contains("best_bid")) bid = std::stod(j["best_bid"].get<std::string>());
            if (j.contains("best_ask")) ask = std::stod(j["best_ask"].get<std::string>());
            
            if (bid <= 0 || ask <= 0) return;
            
            // Convert BTC-USD -> BTC/USD
            std::string asset = product_id;
            std::replace(asset.begin(), asset.end(), '-', '/');
            
            if (price_callback_) {
                price_callback_({
                    "coinbase",
                    asset,
                    bid,
                    ask,
                    1.0,  // Coinbase ticker doesn't include qty
                    1.0,
                    std::chrono::system_clock::now()
                });
            }
        }
    } catch (const std::exception& e) {
        LOG_DEBUG("Coinbase parse error: ", e.what());
    }
}

void ConnectionManager::handleKrakenMessage(ExchangeConnection& ex, const std::string& msg) {
    try {
        auto j = json::parse(msg);
        
        // Kraken ticker format is an array: [channelID, {"a":["ask","wholeLotVolume","lotVolume"],"b":["bid",...]},"ticker","XBT/USD"]
        if (j.is_array() && j.size() >= 4) {
            auto ticker_data = j[1];
            std::string pair = j[3].get<std::string>();
            
            if (ticker_data.contains("a") && ticker_data.contains("b")) {
                double ask = std::stod(ticker_data["a"][0].get<std::string>());
                double bid = std::stod(ticker_data["b"][0].get<std::string>());
                
                // Convert XBT/USD -> BTC/USD
                std::string asset = pair;
                if (asset.find("XBT") != std::string::npos) {
                    asset.replace(asset.find("XBT"), 3, "BTC");
                }
                
                if (price_callback_) {
                    price_callback_({
                        "kraken",
                        asset,
                        bid,
                        ask,
                        1.0,
                        1.0,
                        std::chrono::system_clock::now()
                    });
                }
            }
        }
    } catch (const std::exception& e) {
        LOG_DEBUG("Kraken parse error: ", e.what());
    }
}

} // namespace ms
