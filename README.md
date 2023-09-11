# bun-vercel

Run [Bun](https://bun.sh) on Vercel Serverless Functions

> This is an experimental project and should not be used in production. This project is not endorsed by Vercel.

## Get Started

1. Install the Vercel CLI and run `vercel link`
2. Install OrbStack or Docker Desktop
3. Run `make build` which builds a Lambda executable on docker
4. Run `vercel deploy --prebuilt`