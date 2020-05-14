FROM node:lts-alpine

RUN apk add --no-cache --virtual build-dependencies bash git python make g++ ca-certificates

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile && \
    yarn cache clean

COPY . .
RUN yarn prepack

ENTRYPOINT ["bash", "-c"]
CMD ["npx truffle exec --network mainnet scripts/verify_streamed_orderbook.js"]
