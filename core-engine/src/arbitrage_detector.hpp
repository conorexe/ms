#pragma once
#include "types.hpp"
#include "price_tracker.hpp"
#include <functional>
#include <atomic>
#include <chrono>
#include <set>

namespace ms {

class ArbitrageDetector {
public:
    using Callback = std::function<void(const ArbitrageOpportunity&)>;
    
    explicit ArbitrageDetector(PriceTracker& tracker, double min_spread_pct = 0.1);
    
    void setCallback(Callback cb) { callback_ = std::move(cb); }
    void setMinSpread(double spread_pct) { min_spread_pct_ = spread_pct; }
    
    // Check for arbitrage opportunities for a specific asset
    void checkAsset(const std::string& asset);
    
    // Check all tracked assets
    void checkAll();
    
    // Get statistics
    uint64_t getOpportunitiesFound() const { return opportunities_found_; }
    
private:
    PriceTracker& tracker_;
    double min_spread_pct_;
    Callback callback_;
    std::atomic<uint64_t> event_counter_{0};
    std::atomic<uint64_t> opportunities_found_{0};
    
    // Track recent event IDs to avoid duplicates
    std::set<std::string> recent_events_;
    std::chrono::system_clock::time_point last_cleanup_;
    
    std::string generateEventId();
    bool isDuplicate(const std::string& buy_ex, const std::string& sell_ex, 
                     const std::string& asset, double spread_pct);
    void cleanupRecentEvents();
};

} // namespace ms
