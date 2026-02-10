# Supertonic TTS Service Dockerfile
# Multi-stage build for smaller image

# Build stage
FROM oven/bun:1.1.38 AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Runtime stage
FROM oven/bun:1.1.38-slim

WORKDIR /app

# Install only runtime dependencies if needed
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     some-runtime-dep \
#     && rm -rf /var/lib/apt/lists/*

# Copy built application from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

# Create output directory
RUN mkdir -p /app/output

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV TTS_OUTPUT_DIR=/app/output

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Run the server
CMD ["bun", "run", "src/server.ts"]
