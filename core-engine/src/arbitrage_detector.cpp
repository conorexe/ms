#include "arbitrage_detector.hpp"
#include "logger.hpp"
#include <cmath>
#include <sstream>
#include <iomanip>

namespace ms {

ArbitrageDetector::ArbitrageDetector(PriceTracker& tracker, double min_spread_pct)
    : tracker_(tracker)
    , min_spread_pct_(min_spread_pct)
    , last_cleanup_(std::chrono::system_clock::now()) {}

std::string ArbitrageDetector::generateEventId() {
    auto now = std::chrono::system_clock::now().time_since_epoch();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now).count();
    std::ostringstream oss;
    oss << "arb_" << ms << "_" << ++event_counter_;
    return oss.str();
}

bool ArbitrageDetector::isDuplicate(
    const std::string& buy_ex, 
    const std::string& sell_ex,
    const std::string& asset,
    double spread_pct
) {
    // Create a signature for this opportunity
    std::ostringstream oss;
    oss << buy_ex << "_" << sell_ex << "_" << asset << "_" 
        << std::fixed << std::setprecision(2) << spread_pct;
    std::string sig = oss.str();
    
    if (recent_events_.find(sig) != recent_events_.end()) {
        return true;
    }
    
    recent_events_.insert(sig);
    return false;
}

void ArbitrageDetector::cleanupRecentEvents() {
    auto now = std::chrono::system_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - last_cleanup_);
    
    // Cleanup every 10 seconds
    if (elapsed.count() >= 10) {
        recent_events_.clear();
        last_cleanup_ = now;
    }
}

void ArbitrageDetector::checkAsset(const std::string& asset) {
    cleanupRecentEvents();
    
    auto prices = tracker_.getAllForAsset(asset);
    if (prices.size() < 2) return;
    
    auto now = std::chrono::system_clock::now();
    
    for (size_t i = 0; i < prices.size(); ++i) {
        for (size_t j = i + 1; j < prices.size(); ++j) {
            const auto& p1 = prices[i];
            const auto& p2 = prices[j];
            
            // Check staleness (prices older than 5 seconds are suspect)
            auto age1 = std::chrono::duration_cast<std::chrono::seconds>(now - p1.timestamp);
            auto age2 = std::chrono::duration_cast<std::chrono::seconds>(now - p2.timestamp);
            if (age1.count() > 5 || age2.count() > 5) continue;
            
            // Direction 1: Buy at p1.ask, sell at p2.bid
            if (p2.bid > p1.ask) {
                double spread_abs = p2.bid - p1.ask;
                double spread_pct = (spread_abs / p1.ask) * 100.0;
                
                if (spread_pct >= min_spread_pct_ && 
                    !isDuplicate(p1.exchange, p2.exchange, asset, spread_pct)) {
                    
                    ++opportunities_found_;
                    
                    if (callback_) {
                        callback_({
                            generateEventId(),
                            asset,
                            p1.exchange,  // buy from
                            p2.exchange,  // sell to
                            p1.ask,       // buy price
                            p2.bid,       // sell price
                            p1.ask_qty,   // available to buy
                            p2.bid_qty,   // available to sell
                            spread_pct,
                            spread_abs,
                            now
                        });
                    }
                    
                    LOG_INFO("ARB: ", asset, " | Buy ", p1.exchange, " @ ", p1.ask,
                             " | Sell ", p2.exchange, " @ ", p2.bid,
                             " | Spread: ", std::fixed, std::setprecision(4), spread_pct, "%");
                }
            }
            
            // Direction 2: Buy at p2.ask, sell at p1.bid
            if (p1.bid > p2.ask) {
                double spread_abs = p1.bid - p2.ask;
                double spread_pct = (spread_abs / p2.ask) * 100.0;
                
                if (spread_pct >= min_spread_pct_ &&
                    !isDuplicate(p2.exchange, p1.exchange, asset, spread_pct)) {
                    
                    ++opportunities_found_;
                    
                    if (callback_) {
                        callback_({
                            generateEventId(),
                            asset,
                            p2.exchange,  // buy from
                            p1.exchange,  // sell to
                            p2.ask,       // buy price
                            p1.bid,       // sell price
                            p2.ask_qty,
                            p1.bid_qty,
                            spread_pct,
                            spread_abs,
                            now
                        });
                    }
                    
                    LOG_INFO("ARB: ", asset, " | Buy ", p2.exchange, " @ ", p2.ask,
                             " | Sell ", p1.exchange, " @ ", p1.bid,
                             " | Spread: ", std::fixed, std::setprecision(4), spread_pct, "%");
                }
            }
        }
    }
}

void ArbitrageDetector::checkAll() {
    auto assets = tracker_.getActiveAssets();
    for (const auto& asset : assets) {
        checkAsset(asset);
    }
}

} // namespace ms
