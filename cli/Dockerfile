FROM node:alpine AS build
MAINTAINER Dan Florian <hello@danutflorian.com>

RUN apk add fontconfig freetype ttf-dejavu font-noto-emoji ttf-droid ttf-freefont ttf-liberation chromium-swiftshader

RUN mkdir /app
WORKDIR /app
COPY bin bin
COPY src src
COPY entrypoint.sh .
COPY package.json .

RUN npm i --omit=dev

RUN ls -la
RUN chmod +x bin/htmlconverter
RUN chmod +x entrypoint.sh


ENV CHROME_BIN="/usr/bin/chromium-browser"
ENV PATH /app/bin:$PATH

RUN mkdir -p /converted/
WORKDIR /converted/

CMD ["htmlconverter"]

ENTRYPOINT ["/app/entrypoint.sh"]
