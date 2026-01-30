#pragma once
#include "types.hpp"
#include <string>
#include <atomic>

namespace ms {

class ApiClient {
public:
    explicit ApiClient(const std::string& host = "localhost", const std::string& port = "8000");
    
    bool submitOpportunity(const ArbitrageOpportunity& opp);
    bool updateExchangeStatus(const std::string& exchange, bool connected, const std::string& error = "");
    
    uint64_t getSubmittedCount() const { return submitted_count_; }
    uint64_t getFailedCount() const { return failed_count_; }
    
private:
    std::string host_;
    std::string port_;
    std::atomic<uint64_t> submitted_count_{0};
    std::atomic<uint64_t> failed_count_{0};
    
    std::string buildOpportunityJson(const ArbitrageOpportunity& opp);
    std::string buildStatusJson(const std::string& exchange, bool connected, const std::string& error);
    bool httpPost(const std::string& path, const std::string& body);
};

} // namespace ms
