# ==========================================
# Stage 1: Build dependencies
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install all dependencies including devDependencies (for building, if any)
RUN npm ci

COPY . .

# ==========================================
# Stage 2: Production release
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Set environments
ENV NODE_ENV=production
ENV PORT=5000

# Copy files from builder stage
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/models ./models
COPY --from=builder /usr/src/app/routes ./routes
COPY --from=builder /usr/src/app/middleware ./middleware
COPY --from=builder /usr/src/app/server.js ./server.js

# Clean prune dev dependencies to reduce size
RUN npm prune --production

# Run container as a non-privileged user
USER node

EXPOSE 5000

CMD ["node", "server.js"]
