# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build frontend
RUN npm run build:frontend

# Build backend
RUN npm run build:backend

# Production stage
FROM node:20-alpine AS production

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production dependencies only
RUN npm install --prefix backend --omit=dev

# Copy Prisma files
COPY backend/prisma ./backend/prisma

# Generate Prisma client
RUN npm run db:generate --prefix backend

# Copy built files
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist

# Create uploads directory
RUN mkdir -p /app/uploads

# Set environment
ENV NODE_ENV=production

# Expose port (Railway provides PORT env var)
EXPOSE 8080

# Start server immediately; run migrations in background so healthcheck can pass
# (prisma migrate deploy blocks startup; if DB is slow/unavailable, server never listens)
# Use absolute path - backend dist is at /app/backend/dist/
CMD ["sh", "-c", "cd /app/backend && npx prisma migrate deploy 2>&1 & exec node /app/backend/dist/index.js"]
