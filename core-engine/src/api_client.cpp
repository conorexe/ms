#include "api_client.hpp"
#include "logger.hpp"
#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/beast/version.hpp>
#include <boost/asio/connect.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <ctime>

namespace ms {

namespace beast = boost::beast;
namespace http = beast::http;
namespace net = boost::asio;
using tcp = net::ip::tcp;

ApiClient::ApiClient(const std::string& host, const std::string& port)
    : host_(host), port_(port) {}

std::string ApiClient::buildOpportunityJson(const ArbitrageOpportunity& opp) {
    // Format timestamp as ISO 8601
    auto time_t = std::chrono::system_clock::to_time_t(opp.timestamp);
    std::ostringstream ts;
    ts << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%SZ");
    
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(8);
    ss << "{";
    ss << "\"event_id\":\"" << opp.event_id << "\",";
    ss << "\"asset\":\"" << opp.asset << "\",";
    ss << "\"buy_exchange\":\"" << opp.buy_exchange << "\",";
    ss << "\"sell_exchange\":\"" << opp.sell_exchange << "\",";
    ss << "\"buy_price\":" << opp.buy_price << ",";
    ss << "\"sell_price\":" << opp.sell_price << ",";
    ss << "\"buy_qty\":" << opp.buy_qty << ",";
    ss << "\"sell_qty\":" << opp.sell_qty << ",";
    ss << "\"spread_pct\":" << std::setprecision(6) << opp.spread_pct << ",";
    ss << "\"spread_absolute\":" << std::setprecision(8) << opp.spread_absolute << ",";
    ss << "\"timestamp\":\"" << ts.str() << "\"";
    ss << "}";
    return ss.str();
}

std::string ApiClient::buildStatusJson(const std::string& exchange, bool connected, const std::string& error) {
    std::ostringstream ss;
    ss << "{";
    ss << "\"exchange\":\"" << exchange << "\",";
    ss << "\"connected\":" << (connected ? "true" : "false");
    if (!error.empty()) {
        ss << ",\"error\":\"" << error << "\"";
    }
    ss << "}";
    return ss.str();
}

bool ApiClient::httpPost(const std::string& path, const std::string& body) {
    try {
        net::io_context ioc;
        tcp::resolver resolver(ioc);
        beast::tcp_stream stream(ioc);
        
        auto results = resolver.resolve(host_, port_);
        stream.connect(results);
        
        http::request<http::string_body> req{http::verb::post, path, 11};
        req.set(http::field::host, host_);
        req.set(http::field::user_agent, "MarketScout/1.0");
        req.set(http::field::content_type, "application/json");
        req.body() = body;
        req.prepare_payload();
        
        http::write(stream, req);
        
        beast::flat_buffer buffer;
        http::response<http::string_body> res;
        http::read(stream, buffer, res);
        
        beast::error_code ec;
        stream.socket().shutdown(tcp::socket::shutdown_both, ec);
        
        return res.result() == http::status::created || res.result() == http::status::ok;
    } catch (const std::exception& e) {
        LOG_ERROR("HTTP POST failed: ", e.what());
        return false;
    }
}

bool ApiClient::submitOpportunity(const ArbitrageOpportunity& opp) {
    std::string json = buildOpportunityJson(opp);
    bool success = httpPost("/api/opportunities/ingest/", json);
    
    if (success) {
        ++submitted_count_;
        LOG_DEBUG("Submitted opportunity ", opp.event_id);
    } else {
        ++failed_count_;
        LOG_WARN("Failed to submit opportunity ", opp.event_id);
    }
    
    return success;
}

bool ApiClient::updateExchangeStatus(const std::string& exchange, bool connected, const std::string& error) {
    std::string json = buildStatusJson(exchange, connected, error);
    return httpPost("/api/exchanges/update_status/", json);
}

} // namespace ms
