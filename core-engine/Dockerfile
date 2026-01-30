FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libboost-all-dev \
    libssl-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy source
COPY . .

# Build
RUN mkdir -p build && cd build && \
    cmake .. && \
    cmake --build . -j$(nproc)

# Run
WORKDIR /app/build
# Wait for middleware to be ready before starting
CMD ["sh", "-c", "echo 'Waiting 15 seconds for middleware to start...' && sleep 15 && ./engine --api-host middleware --api-port 8000"]
