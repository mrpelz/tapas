BASE_FILE := $(shell npm ls --parseable --silent "@mrpelz/boilerplate-node" 2>/dev/null)

include $(BASE_FILE)/Makefile

.PHONY: .PHONY \
	util_generate_openapi \
	util_generate_openapi_build \
	util_generate_openapi_run

NODE := $(NODE) --env-file=.env

util_generate_openapi: \
	util_generate_openapi_build \
	util_generate_openapi_run \
	util_clear

util_generate_openapi_build:
	tsc --noEmit false --project tsconfig.json

util_generate_openapi_run:
	$(NODE) "dist/openapi/generate.js"
