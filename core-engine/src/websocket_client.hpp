#pragma once
#include <boost/beast/core.hpp>
#include <boost/beast/ssl.hpp>
#include <boost/beast/websocket.hpp>
#include <boost/beast/websocket/ssl.hpp>
#include <boost/asio/strand.hpp>
#include <functional>
#include <memory>
#include <string>
#include <queue>

namespace ms {

namespace beast = boost::beast;
namespace websocket = beast::websocket;
namespace net = boost::asio;
namespace ssl = boost::asio::ssl;
using tcp = boost::asio::ip::tcp;

class WebSocketClient : public std::enable_shared_from_this<WebSocketClient> {
public:
    using MessageCallback = std::function<void(const std::string&)>;
    using ErrorCallback = std::function<void(const std::string&)>;
    using ConnectCallback = std::function<void(bool)>;
    
    WebSocketClient(net::io_context& ioc, ssl::context& ctx);
    ~WebSocketClient();
    
    void connect(
        const std::string& host,
        const std::string& port,
        const std::string& path,
        MessageCallback on_message,
        ErrorCallback on_error = nullptr,
        ConnectCallback on_connect = nullptr
    );
    
    void send(const std::string& msg);
    void close();
    bool isConnected() const { return connected_; }
    
private:
    tcp::resolver resolver_;
    websocket::stream<beast::ssl_stream<beast::tcp_stream>> ws_;
    beast::flat_buffer buffer_;
    std::string host_;
    std::string path_;
    MessageCallback on_message_;
    ErrorCallback on_error_;
    ConnectCallback on_connect_;
    bool connected_ = false;
    std::queue<std::string> write_queue_;
    bool writing_ = false;
    
    void on_resolve(beast::error_code ec, tcp::resolver::results_type results);
    void on_connect(beast::error_code ec, tcp::resolver::results_type::endpoint_type ep);
    void on_ssl_handshake(beast::error_code ec);
    void on_handshake(beast::error_code ec);
    void do_read();
    void on_read(beast::error_code ec, std::size_t bytes);
    void do_write();
    void on_write(beast::error_code ec, std::size_t bytes);
    void handle_error(const std::string& context, beast::error_code ec);
};

} // namespace ms
