#include "websocket_client.hpp"
#include "logger.hpp"
#include <boost/beast/http.hpp>

namespace ms {

namespace http = beast::http;

WebSocketClient::WebSocketClient(net::io_context& ioc, ssl::context& ctx)
    : resolver_(net::make_strand(ioc))
    , ws_(net::make_strand(ioc), ctx) {}

WebSocketClient::~WebSocketClient() {
    if (connected_) {
        close();
    }
}

void WebSocketClient::connect(
    const std::string& host,
    const std::string& port,
    const std::string& path,
    MessageCallback on_message,
    ErrorCallback on_error,
    ConnectCallback on_connect
) {
    host_ = host;
    path_ = path;
    on_message_ = std::move(on_message);
    on_error_ = std::move(on_error);
    on_connect_ = std::move(on_connect);
    
    LOG_INFO("Connecting to ", host_, ":", port, path_);
    
    resolver_.async_resolve(
        host, port,
        beast::bind_front_handler(&WebSocketClient::on_resolve, shared_from_this())
    );
}

void WebSocketClient::on_resolve(beast::error_code ec, tcp::resolver::results_type results) {
    if (ec) {
        handle_error("resolve", ec);
        return;
    }
    
    beast::get_lowest_layer(ws_).expires_after(std::chrono::seconds(30));
    beast::get_lowest_layer(ws_).async_connect(
        results,
        beast::bind_front_handler(&WebSocketClient::on_connect, shared_from_this())
    );
}

void WebSocketClient::on_connect(beast::error_code ec, tcp::resolver::results_type::endpoint_type ep) {
    if (ec) {
        handle_error("connect", ec);
        return;
    }
    
    beast::get_lowest_layer(ws_).expires_never();
    
    // Set SNI hostname
    if (!SSL_set_tlsext_host_name(ws_.next_layer().native_handle(), host_.c_str())) {
        ec = beast::error_code(static_cast<int>(::ERR_get_error()), net::error::get_ssl_category());
        handle_error("ssl_sni", ec);
        return;
    }
    
    ws_.next_layer().async_handshake(
        ssl::stream_base::client,
        beast::bind_front_handler(&WebSocketClient::on_ssl_handshake, shared_from_this())
    );
}

void WebSocketClient::on_ssl_handshake(beast::error_code ec) {
    if (ec) {
        handle_error("ssl_handshake", ec);
        return;
    }
    
    ws_.set_option(websocket::stream_base::timeout::suggested(beast::role_type::client));
    ws_.set_option(websocket::stream_base::decorator([this](websocket::request_type& req) {
        req.set(http::field::user_agent, "MarketScout/1.0");
        req.set(http::field::host, host_);
    }));
    
    ws_.async_handshake(host_, path_,
        beast::bind_front_handler(&WebSocketClient::on_handshake, shared_from_this())
    );
}

void WebSocketClient::on_handshake(beast::error_code ec) {
    if (ec) {
        handle_error("ws_handshake", ec);
        return;
    }
    
    connected_ = true;
    LOG_INFO("Connected to ", host_);
    
    if (on_connect_) {
        on_connect_(true);
    }
    
    do_read();
}

void WebSocketClient::do_read() {
    ws_.async_read(
        buffer_,
        beast::bind_front_handler(&WebSocketClient::on_read, shared_from_this())
    );
}

void WebSocketClient::on_read(beast::error_code ec, std::size_t bytes) {
    if (ec) {
        handle_error("read", ec);
        return;
    }
    
    std::string msg = beast::buffers_to_string(buffer_.data());
    buffer_.consume(bytes);
    
    if (on_message_) {
        on_message_(msg);
    }
    
    do_read();
}

void WebSocketClient::send(const std::string& msg) {
    net::post(ws_.get_executor(), [self = shared_from_this(), msg]() {
        self->write_queue_.push(msg);
        if (!self->writing_) {
            self->do_write();
        }
    });
}

void WebSocketClient::do_write() {
    if (write_queue_.empty()) {
        writing_ = false;
        return;
    }
    
    writing_ = true;
    ws_.async_write(
        net::buffer(write_queue_.front()),
        beast::bind_front_handler(&WebSocketClient::on_write, shared_from_this())
    );
}

void WebSocketClient::on_write(beast::error_code ec, std::size_t bytes) {
    if (ec) {
        handle_error("write", ec);
        return;
    }
    
    write_queue_.pop();
    do_write();
}

void WebSocketClient::close() {
    if (!connected_) return;
    
    connected_ = false;
    beast::error_code ec;
    ws_.close(websocket::close_code::normal, ec);
}

void WebSocketClient::handle_error(const std::string& context, beast::error_code ec) {
    connected_ = false;
    std::string error_msg = context + ": " + ec.message();
    LOG_ERROR("WebSocket error - ", error_msg);
    
    if (on_error_) {
        on_error_(error_msg);
    }
    if (on_connect_) {
        on_connect_(false);
    }
}

} // namespace ms
