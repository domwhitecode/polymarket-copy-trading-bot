# ============================================
# Polymarket Copy Trading Bot - Dockerfile
# Multi-stage build for optimal image size
# ============================================

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy TypeScript config and source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling in containers
RUN apk add --no-cache dumb-init wget

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S botuser -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy UI public assets (needed for Express static serving)
COPY src/ui/public ./dist/ui/public

# Create logs directory
RUN mkdir -p /app/logs && chown -R botuser:nodejs /app

# Switch to non-root user
USER botuser

# Expose UI port
EXPOSE 3000

# Health check - verifies the UI server is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Use dumb-init as entrypoint for proper signal handling (SIGTERM, SIGINT)
ENTRYPOINT ["dumb-init", "--"]

# Default command - runs the main bot process
CMD ["node", "dist/index.js"]
