FROM golang:1.20.1-alpine as builder
MAINTAINER Dan Florian <hello@danutflorian.com>

RUN apk add --update git

RUN mkdir build
WORKDIR build
COPY . .

RUN go get
RUN CGO_ENABLED=0 go build -v -o /weaver .

FROM daniesy/htmlconverter:latest
USER root

ENV GIN_MODE release

RUN apk add dumb-init

RUN mkdir /service \
     && chown -R noob:noob /service

ENV PATH /service/:$PATH

COPY --from=builder /weaver /service
COPY conf/ /service/conf/

WORKDIR /service

USER noob

EXPOSE 8080
CMD ["dumb-init", "weaver"]

ENTRYPOINT ["/service/conf/entrypoint.sh"]