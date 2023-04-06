FROM alpine
MAINTAINER Dan Florian <hello@danutflorian.com>

RUN apk add freetype \
    harfbuzz \
    ttf-dejavu \
    nss \
    font-noto-emoji \
    ttf-droid \
    ttf-freefont \
    ttf-liberation \
    chromium \
    ca-certificates \
    nodejs \
    npm

RUN mkdir /app
RUN mkdir /converted

RUN addgroup -S noob && adduser -S -G noob noob \
    && chown -R noob:noob /home/noob \
    && chown -R noob:noob /app \
    && chown -R noob:noob /converted

WORKDIR /app
COPY bin bin
COPY src src
COPY entrypoint.sh .
COPY package.json .

RUN npm i --omit=dev

RUN chmod +x bin/htmlconverter
RUN chmod +x entrypoint.sh

USER noob

ENV CHROME_BIN="/usr/bin/chromium-browser"
ENV PATH /app/bin:$PATH

WORKDIR /converted

CMD ["htmlconverter"]

ENTRYPOINT ["/app/entrypoint.sh"]
