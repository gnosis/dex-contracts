FROM node:lts-alpine

RUN apk add --no-cache --virtual build-dependencies bash git python make g++ ca-certificates

COPY yarn.lock package.json ./
RUN yarn install --frozen-lockfile && yarn cache clean

COPY . .
RUN yarn prepack

ENTRYPOINT ["bash", "-c"]
CMD ["npx", "truffle", "exec", "scripts/verify_streamed_orderbook.js"]
