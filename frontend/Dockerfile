# Stage 1: Build frontend
FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Bake the resolved BChemXtract version into the SPA bundle so the footer
# can render it without a runtime API call. Vite only forwards env vars
# prefixed with VITE_ to client code (envPrefix default).
ARG BCHEMXTRACT_VERSION=
ENV VITE_BCHEMXTRACT_VERSION=$BCHEMXTRACT_VERSION
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/frontend.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=10s \
    CMD wget -q --spider http://127.0.0.1:80/ || exit 1
