FROM node:18-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy source and proto
COPY . .

# Expose gRPC port
EXPOSE 9090

# Start the worker
CMD ["node", "server.js"]
