FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY src ./src
COPY .env.example ./
COPY README.md ./

RUN mkdir -p /app/data

CMD ["node", "src/index.js"]
