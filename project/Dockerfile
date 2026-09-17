# Stage 1: Build the React app
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Replace the entire nginx config with our custom one
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built files from stage 1
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 4000

CMD ["nginx", "-g", "daemon off;"]
