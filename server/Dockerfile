# TeaRush API — for Railway, Fly.io, a VPS, etc. Mount a volume at /data to keep the database.
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
VOLUME /data
EXPOSE 3000
CMD ["node", "src/index.js"]
