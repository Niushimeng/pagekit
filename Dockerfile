FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

# Install server dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production

# Copy server source
COPY tsconfig.server.json ./
COPY server/ ./server/

# Build server TypeScript
RUN npx tsc -p tsconfig.server.json

# Build client
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# Create data directories
RUN mkdir -p /data/sites /data/app

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist-server/index.js"]
