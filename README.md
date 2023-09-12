# bun-vercel

Run [Bun](https://bun.sh) on Vercel Serverless Functions

[https://bun-vercel.vercel.app/](https://bun-vercel.vercel.app/)

> This is an experimental project and should not be used in production. This project is not endorsed by Vercel.

```typescript
// src/main.ts
import { type Server } from "bun"

export default {
  async fetch(request: Request, server: Server) {
    return new Response("Hello from Bun on Vercel", {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    })
  }
}
```

## Get Started

There are two ways to deploy your project to Vercel:

1. GitHub integration
2. Manually from your computer

### GitHub Integration

> Note: An issue in Bun must be resolved before this method is fully operational

#### 1. Update your package.json with `bun-vercel`

```json
{
  "devDependencies": {
    "bun-vercel": "^1.0.0-alpha.4",
  }
}
```

#### 2. Update the `build` script run bun-vercel

```json
{
  "scripts": {
    "build": "bun-vercel ./src/main.ts"
  }
}
```

#### 3. Add a `vercel.json` with your build command

```json
{
  "buildCommand": "bun run build"
}
```

### Manually

Before starting you should follow the same setup steps as the GitHub integration, as they will be needed regardless.

> Note: To deploy from your computer you must have Docker installed so we can build for Amazon Linux

1. Install the Vercel CLI and run `vercel link`
2. Run `bun run build`
3. Run `vercel deploy --prebuilt --prod`
