#include "price_tracker.hpp"
#include <algorithm>
#include <set>

namespace ms {

void PriceTracker::update(const PriceData& data) {
    std::lock_guard<std::mutex> lock(mutex_);
    prices_[makeKey(data.exchange, data.asset)] = data;
}

std::optional<PriceData> PriceTracker::get(const std::string& exchange, const std::string& asset) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = prices_.find(makeKey(exchange, asset));
    if (it != prices_.end()) {
        return it->second;
    }
    return std::nullopt;
}

std::vector<PriceData> PriceTracker::getAllForAsset(const std::string& asset) const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<PriceData> result;
    for (const auto& [key, data] : prices_) {
        if (data.asset == asset) {
            result.push_back(data);
        }
    }
    return result;
}

std::vector<std::string> PriceTracker::getActiveAssets() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::set<std::string> assets;
    for (const auto& [key, data] : prices_) {
        assets.insert(data.asset);
    }
    return std::vector<std::string>(assets.begin(), assets.end());
}

void PriceTracker::cleanup(std::chrono::seconds max_age) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto now = std::chrono::system_clock::now();
    
    for (auto it = prices_.begin(); it != prices_.end(); ) {
        auto age = std::chrono::duration_cast<std::chrono::seconds>(now - it->second.timestamp);
        if (age > max_age) {
            it = prices_.erase(it);
        } else {
            ++it;
        }
    }
}

size_t PriceTracker::size() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return prices_.size();
}

} // namespace ms
