#include "../src/price_tracker.hpp"
#include "../src/arbitrage_detector.hpp"
#include <cassert>
#include <iostream>
#include <vector>

using namespace ms;

void test_price_tracker() {
    std::cout << "Testing PriceTracker..." << std::endl;
    
    PriceTracker tracker;
    
    // Test update and get
    PriceData price1{"binance", "BTC/USDT", 50000, 50010, 1.5, 2.0, std::chrono::system_clock::now()};
    tracker.update(price1);
    
    auto result = tracker.get("binance", "BTC/USDT");
    assert(result.has_value());
    assert(result->exchange == "binance");
    assert(result->bid == 50000);
    
    // Test non-existent
    auto missing = tracker.get("kraken", "BTC/USDT");
    assert(!missing.has_value());
    
    // Test getAllForAsset
    PriceData price2{"coinbase", "BTC/USDT", 50100, 50120, 1.0, 1.5, std::chrono::system_clock::now()};
    tracker.update(price2);
    
    auto all_btc = tracker.getAllForAsset("BTC/USDT");
    assert(all_btc.size() == 2);
    
    std::cout << "  PriceTracker tests passed!" << std::endl;
}

void test_arbitrage_detection() {
    std::cout << "Testing ArbitrageDetector..." << std::endl;
    
    PriceTracker tracker;
    ArbitrageDetector detector(tracker, 0.1);  // 0.1% min spread
    
    std::vector<ArbitrageOpportunity> detected;
    detector.setCallback([&detected](const ArbitrageOpportunity& opp) {
        detected.push_back(opp);
    });
    
    // Add prices with NO significant spread
    auto now = std::chrono::system_clock::now();
    tracker.update({"binance", "BTC/USDT", 50000, 50010, 1.0, 1.0, now});
    tracker.update({"coinbase", "BTC/USDT", 50005, 50015, 1.0, 1.0, now});
    
    detector.checkAsset("BTC/USDT");
    assert(detected.empty());  // No arbitrage with such small spread
    
    // Add prices WITH significant spread (buy at 50010 on binance, sell at 50120 on coinbase)
    tracker.update({"binance", "BTC/USDT", 50000, 50010, 1.0, 1.0, now});  // ask = 50010
    tracker.update({"coinbase", "BTC/USDT", 50120, 50130, 1.0, 1.0, now}); // bid = 50120
    
    detected.clear();
    detector.checkAsset("BTC/USDT");
    
    assert(!detected.empty());
    
    auto& opp = detected[0];
    assert(opp.asset == "BTC/USDT");
    assert(opp.buy_exchange == "binance");
    assert(opp.sell_exchange == "coinbase");
    assert(opp.buy_price == 50010);
    assert(opp.sell_price == 50120);
    
    double expected_spread = ((50120.0 - 50010.0) / 50010.0) * 100.0;
    assert(std::abs(opp.spread_pct - expected_spread) < 0.001);
    
    std::cout << "  Detected spread: " << opp.spread_pct << "%" << std::endl;
    std::cout << "  ArbitrageDetector tests passed!" << std::endl;
}

void test_no_duplicate_detection() {
    std::cout << "Testing duplicate prevention..." << std::endl;
    
    PriceTracker tracker;
    ArbitrageDetector detector(tracker, 0.1);
    
    int detection_count = 0;
    detector.setCallback([&detection_count](const ArbitrageOpportunity&) {
        detection_count++;
    });
    
    auto now = std::chrono::system_clock::now();
    tracker.update({"binance", "BTC/USDT", 50000, 50010, 1.0, 1.0, now});
    tracker.update({"coinbase", "BTC/USDT", 50120, 50130, 1.0, 1.0, now});
    
    // Check multiple times rapidly
    for (int i = 0; i < 5; i++) {
        detector.checkAsset("BTC/USDT");
    }
    
    // Should only detect once due to deduplication
    assert(detection_count == 1);
    std::cout << "  Duplicate prevention tests passed!" << std::endl;
}

int main() {
    std::cout << "=== MarketScout Unit Tests ===" << std::endl;
    
    test_price_tracker();
    test_arbitrage_detection();
    test_no_duplicate_detection();
    
    std::cout << "\n=== All tests passed! ===" << std::endl;
    return 0;
}
