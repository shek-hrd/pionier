FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY index.html server.js ./

EXPOSE 8080

CMD ["node", "server.js"]