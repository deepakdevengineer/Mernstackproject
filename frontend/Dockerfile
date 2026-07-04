# ==========================================
# Stage 1: Build static bundle
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ==========================================
# Stage 2: Serve using Nginx
# ==========================================
FROM nginx:1.25-alpine AS runner

# Copy built assets
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Copy custom Nginx configuration (port 8080, non-root)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Modify permissions so Nginx can run as non-root on port 8080
RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid /usr/share/nginx/html /var/cache/nginx /var/log/nginx /etc/nginx/conf.d

# Set to run as the built-in non-root nginx user
USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
