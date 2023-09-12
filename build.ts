import { exists, mkdir, unlink } from "node:fs/promises"

// Ex. ./src/main.ts
const mainModulePath = process.argv[2]

// Ensure file exists
if ((await exists(mainModulePath)) !== true) {
  throw new Error(`module not found: ${mainModulePath}`)
}

// Bootstrap source should be in same directory as main
const bootstrapSourcePath = mainModulePath.replace(
  /\.(ts|js|cjs|mjs)$/,
  ".bootstrap.ts",
)

// Read in bootstrap source
const bootstrapSource = await Bun.file("bootstrap.ts").text()

// Write boostrap source to bootstrap file
await Bun.write(
  bootstrapSourcePath,
  bootstrapSource.replace(
    'import main from "./example/main"',
    `import main from "./${mainModulePath.split("/").pop()}"`,
  ),
)

// Create output directory
await mkdir("./.vercel/output/functions/App.func", {
  recursive: true,
})

// Create function config file
await Bun.write(
  "./.vercel/output/functions/App.func/.vc-config.json",
  JSON.stringify(
    {
      architecture: process.arch,
      handler: "bootstrap",
      maxDuration: 10,
      memory: 1024,
      runtime: "provided.al2",
      supportsWrapper: false,
    },
    null,
    2,
  ),
)

// Create routing config file
await Bun.write(
  "./.vercel/output/config.json",
  JSON.stringify(
    {
      framework: {
        version: "5.8.0",
      },
      overrides: {},
      routes: [
        {
          headers: {
            Location: "/$1",
          },
          src: "^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))/$",
          status: 308,
        },
        {
          handle: "filesystem",
        },
        {
          check: true,
          dest: "App",
          src: "^.*$",
        },
      ],
      version: 3,
    },
    null,
    2,
  ),
)

// Compile to a single bun executable
await Bun.spawnSync({
  cmd: [
    "bun",
    "build",
    bootstrapSourcePath,
    "--compile",
    "--minify",
    "--outfile",
    ".vercel/output/functions/App.func/bootstrap",
  ],
  stdout: "pipe",
})

// Cleanup bootstrap file
await unlink(bootstrapSourcePath)
