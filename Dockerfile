FROM node:18-slim

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy the rest of the application
COPY . .

# Ensure temp directory exists for uploads
RUN mkdir -p temp_uploads

# Expose gRPC port
EXPOSE 9090

# Start the worker
CMD ["node", "server.grpc.js"]
