FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y wget gnupg ca-certificates procps \
    && apt-get install -y chromium \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_ARGS="--no-sandbox,--disable-setuid-sandbox"

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy source and proto
COPY . .

# Expose gRPC port
EXPOSE 9090

# Start the worker
CMD ["node", "server.grpc.js"]
