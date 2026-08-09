FROM node:22-alpine

RUN apk add --no-cache tini wget
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .
RUN npm run prepare-runtime \
 && npm run check
RUN mkdir -p /data/uploads && chown -R node:node /app /data

USER node
ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
