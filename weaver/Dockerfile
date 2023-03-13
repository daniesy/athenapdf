FROM golang:1.20.1-alpine as builder
MAINTAINER Dan Florian <hello@danutflorian.com>
RUN apk add --update git

RUN mkdir build
WORKDIR build
COPY . .

RUN go get
RUN CGO_ENABLED=0 go build -v -o /weaver .

FROM daniesy/htmlconverter
ENV GIN_MODE release

RUN apk add dumb-init xvfb

COPY --from=builder /weaver /htmlconverter-service/
WORKDIR /htmlconverter-service/

ENV PATH /htmlconverter-service/:$PATH

COPY conf/ /htmlconverter-service/conf/

EXPOSE 8080

CMD ["dumb-init", "weaver"]

ENTRYPOINT ["/htmlconverter-service/conf/entrypoint.sh"]