#pragma once
#include "types.hpp"
#include <unordered_map>
#include <mutex>
#include <optional>
#include <vector>
#include <chrono>

namespace ms {

class PriceTracker {
public:
    void update(const PriceData& data);
    std::optional<PriceData> get(const std::string& exchange, const std::string& asset) const;
    std::vector<PriceData> getAllForAsset(const std::string& asset) const;
    std::vector<std::string> getActiveAssets() const;
    
    // Cleanup stale prices (older than max_age)
    void cleanup(std::chrono::seconds max_age = std::chrono::seconds(60));
    
    size_t size() const;
    
private:
    // Key: "exchange:asset"
    std::unordered_map<std::string, PriceData> prices_;
    mutable std::mutex mutex_;
    
    static std::string makeKey(const std::string& exchange, const std::string& asset) {
        return exchange + ":" + asset;
    }
};

} // namespace ms
