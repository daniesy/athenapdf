CLI_DIR ?= cli
CLI_IMAGE ?= "daniesy/htmlconverter"

SERVICE_DIR ?= weaver
SERVICE_IMAGE ?= "daniesy/htmlconverter-service"

P="\\033[34m[+]\\033[0m"

help:
	@echo
	@echo "  \033[34mbuildcli\033[0m – builds athenapdf (cli) docker image"
	@echo "  \033[34mtestcli\033[0m – tests athenapdf (cli) standard streams"
	@echo "  \033[34mbuildservice\033[0m – builds athenapdf-service docker image"
	@echo "  \033[34mtestservice\033[0m – tests athenapdf-service Go source"
	@echo "  \033[34mbuild\033[0m – builds both the cli, and service docker image"
	@echo

buildcli:
	@echo "  $(P) buildcli"
	@docker build --rm -t $(CLI_IMAGE):latest -t $(CLI_IMAGE):$(tag) -f $(CLI_DIR)/Dockerfile $(CLI_DIR)/

testcli:
	@echo "  $(P) testcli"
	@docker run --rm ${CLI_IMAGE} htmlconverter -S -T 30 https://google.com | grep -a "PDF-1.4"
	@echo "<h1>stdin test</h1>" | docker run --rm -i ${CLI_IMAGE} htmlconverter -S - | grep -a "PDF-1.4"

buildservice:
	@echo "  $(P) buildservice"
	@docker build --rm -t $(SERVICE_IMAGE):latest -t $(SERVICE_IMAGE):$(tag) -f $(SERVICE_DIR)/Dockerfile $(SERVICE_DIR)/

testservice:
	@echo "  $(P) testservice"
	@docker build --rm -t $(SERVICE_IMAGE)-test -f $(SERVICE_DIR)/Dockerfile.test $(SERVICE_DIR)/
	@docker run --rm -t $(SERVICE_IMAGE)-test go test ./...

build:
	@echo "  $(P) build"
	@make buildcli
	@make buildservice

push: 
	@echo " $(P) push"
	@docker push --all-tags $(CLI_IMAGE)
	@docker push --all-tags $(SERVICE_IMAGE)

.PHONY: help buildcli testcli buildservice testservice build