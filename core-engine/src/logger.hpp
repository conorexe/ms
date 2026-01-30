#pragma once
#include <iostream>
#include <string>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <mutex>

namespace ms {

enum class LogLevel {
    Debug,
    Info,
    Warning,
    Error
};

class Logger {
public:
    static Logger& instance() {
        static Logger logger;
        return logger;
    }
    
    void setLevel(LogLevel level) { level_ = level; }
    
    template<typename... Args>
    void debug(Args&&... args) {
        log(LogLevel::Debug, std::forward<Args>(args)...);
    }
    
    template<typename... Args>
    void info(Args&&... args) {
        log(LogLevel::Info, std::forward<Args>(args)...);
    }
    
    template<typename... Args>
    void warning(Args&&... args) {
        log(LogLevel::Warning, std::forward<Args>(args)...);
    }
    
    template<typename... Args>
    void error(Args&&... args) {
        log(LogLevel::Error, std::forward<Args>(args)...);
    }
    
private:
    LogLevel level_ = LogLevel::Info;
    std::mutex mutex_;
    
    template<typename... Args>
    void log(LogLevel level, Args&&... args) {
        if (level < level_) return;
        
        std::lock_guard<std::mutex> lock(mutex_);
        
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()) % 1000;
        
        std::ostringstream oss;
        oss << std::put_time(std::localtime(&time), "%Y-%m-%d %H:%M:%S");
        oss << '.' << std::setfill('0') << std::setw(3) << ms.count();
        oss << " [" << levelToString(level) << "] ";
        
        ((oss << args), ...);
        oss << "\n";
        
        std::cout << oss.str() << std::flush;
    }
    
    const char* levelToString(LogLevel level) {
        switch (level) {
            case LogLevel::Debug: return "DEBUG";
            case LogLevel::Info: return "INFO";
            case LogLevel::Warning: return "WARN";
            case LogLevel::Error: return "ERROR";
            default: return "UNKNOWN";
        }
    }
};

#define LOG_DEBUG(...) ms::Logger::instance().debug(__VA_ARGS__)
#define LOG_INFO(...) ms::Logger::instance().info(__VA_ARGS__)
#define LOG_WARN(...) ms::Logger::instance().warning(__VA_ARGS__)
#define LOG_ERROR(...) ms::Logger::instance().error(__VA_ARGS__)

} // namespace ms
