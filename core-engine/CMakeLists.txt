cmake_minimum_required(VERSION 3.16)
project(marketscout_engine VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Find required packages
find_package(Boost 1.70 REQUIRED COMPONENTS system)
find_package(OpenSSL REQUIRED)
find_package(Threads REQUIRED)

# nlohmann_json - try find_package first, then FetchContent
find_package(nlohmann_json QUIET)
if(NOT nlohmann_json_FOUND)
    include(FetchContent)
    FetchContent_Declare(json
        GIT_REPOSITORY https://github.com/nlohmann/json.git
        GIT_TAG v3.11.3
    )
    FetchContent_MakeAvailable(json)
endif()

# Source files
set(SOURCES
    src/main.cpp
    src/websocket_client.cpp
    src/price_tracker.cpp
    src/arbitrage_detector.cpp
    src/api_client.cpp
    src/connection_manager.cpp
)

add_executable(engine ${SOURCES})

target_include_directories(engine PRIVATE 
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${Boost_INCLUDE_DIRS}
)

target_link_libraries(engine PRIVATE
    ${Boost_LIBRARIES}
    OpenSSL::SSL
    OpenSSL::Crypto
    Threads::Threads
    nlohmann_json::nlohmann_json
)

# Windows-specific
if(WIN32)
    target_link_libraries(engine PRIVATE ws2_32 wsock32)
endif()

# Tests
enable_testing()
add_executable(test_detector tests/test_detector.cpp src/price_tracker.cpp src/arbitrage_detector.cpp)
target_include_directories(test_detector PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(test_detector PRIVATE Threads::Threads nlohmann_json::nlohmann_json)
add_test(NAME detector_test COMMAND test_detector)
