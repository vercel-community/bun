# bun-vercel

Run [Bun](https://bun.sh) on Vercel Serverless Functions

[https://bun-vercel.vercel.app/](https://bun-vercel.vercel.app/)

> This is an experimental project and should not be used in production. This project is not endorsed by Vercel.

## Get Started

#### 1. Update your package.json with `bun-vercel`:

```json
{
  "devDependencies": {
    "bun-vercel": "^1.0.0-alpha.3",
  }
}
```

#### 2. Update the `build` script run bun-vercel:

```json
{
  "scripts": {
    "build": "bun-vercel ./src/main.ts"
  }
}
```

#### 3. Add a `vercel.json` with your build command:

```json
{
  "buildCommand": "bun run build"
}
```
