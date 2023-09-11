.PHONY: build

build:
	docker run \
		--platform linux/arm64 \
		--rm \
		-v $(CURDIR):/app \
		-w /app \
		oven/bun \
		bash -cl "bun run build"