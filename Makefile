.PHONY: build

build:
	docker run \
		--platform linux/arm64 \
		--rm \
		-v $(CURDIR):/app \
		-w /app \
		oven/bun \
		bash -cl "bun build bootstrap.ts --compile --minify --outfile .vercel/output/functions/App.func/bootstrap"