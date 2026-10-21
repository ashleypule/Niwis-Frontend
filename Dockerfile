# NIWIS frontend: production build (api mode, no sample data) served by nginx, which also proxies /api to the API.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:release && rm -f dist-release/mockServiceWorker.js

FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist-release /usr/share/nginx/html
# nginx's own user; listen on an unprivileged port
RUN chown -R nginx:nginx /var/cache/nginx /var/run /var/log/nginx \
    && sed -i 's#^pid .*#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
    && sed -i '/^user /d' /etc/nginx/nginx.conf
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
