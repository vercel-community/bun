import type { Server } from "bun"
import main from "./example/main"

type Lambda = {
  fetch: (request: Request, server: Server) => Promise<Response | undefined>
  error?: (error: unknown) => Promise<Response>
}

let requestId: string | undefined
let traceId: string | undefined
let functionArn: string | undefined

let logger = console.log

function log(level: string, ...args: any[]): void {
  if (!args.length) {
    return
  }
  const message = Bun.inspect(args).replace(/\n/g, "\r")
  if (requestId === undefined) {
    logger(level, message)
  } else {
    logger(level, `RequestId: ${requestId}`, message)
  }
}

console.log = (...args: any[]) => log("INFO", ...args)
console.info = (...args: any[]) => log("INFO", ...args)
console.warn = (...args: any[]) => log("WARN", ...args)
console.error = (...args: any[]) => log("ERROR", ...args)
console.debug = (...args: any[]) => log("DEBUG", ...args)
console.trace = (...args: any[]) => log("TRACE", ...args)

let warnings: Set<string> | undefined

function warnOnce(message: string, ...args: any[]): void {
  if (warnings === undefined) {
    warnings = new Set()
  }
  if (warnings.has(message)) {
    return
  }
  warnings.add(message)
  console.warn(message, ...args)
}

function reset(): void {
  requestId = undefined
  traceId = undefined
  warnings = undefined
}

function exit(...cause: any[]): never {
  console.error(...cause)
  process.exit(1)
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback ?? null
  if (value === null) {
    exit(`Runtime failed to find the '${name}' environment variable`)
  }
  return value
}

const runtimeUrl = new URL(
  `http://${env("AWS_LAMBDA_RUNTIME_API")}/2018-06-01/`,
)

async function fetch(url: string, options?: RequestInit): Promise<Response> {
  const { href } = new URL(url, runtimeUrl)
  const response = await globalThis.fetch(href, {
    ...options,
    timeout: false,
  })
  if (!response.ok) {
    exit(
      `Runtime failed to send request to Lambda [status: ${response.status}]`,
    )
  }
  return response
}

type LambdaError = {
  readonly errorType: string
  readonly errorMessage: string
  readonly stackTrace?: string[]
}

function formatError(error: unknown): LambdaError {
  if (error instanceof Error) {
    return {
      errorType: error.name,
      errorMessage: error.message,
      stackTrace: error.stack
        ?.split("\n")
        .filter((line) => !line.includes(" /opt/runtime.ts")),
    }
  }
  return {
    errorType: "Error",
    errorMessage: Bun.inspect(error),
  }
}

async function sendError(type: string, cause: unknown): Promise<void> {
  console.error(cause)
  await fetch(
    requestId === undefined
      ? "runtime/init/error"
      : `runtime/invocation/${requestId}/error`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.aws.lambda.error+json",
        "Lambda-Runtime-Function-Error-Type": `Bun.${type}`,
      },
      body: JSON.stringify(formatError(cause)),
    },
  )
}

async function throwError(type: string, cause: unknown): Promise<never> {
  await sendError(type, cause)
  exit()
}

type LambdaRequest<E = any> = {
  readonly requestId: string
  readonly traceId: string
  readonly functionArn: string
  readonly deadlineMs: number | null
  readonly event: E
}

async function receiveRequest(): Promise<LambdaRequest> {
  const response = await fetch("runtime/invocation/next")
  requestId = response.headers.get("Lambda-Runtime-Aws-Request-Id") ?? undefined
  if (requestId === undefined) {
    exit("Runtime received a request without a request ID")
  }
  traceId = response.headers.get("Lambda-Runtime-Trace-Id") ?? undefined
  if (traceId === undefined) {
    exit("Runtime received a request without a trace ID")
  }
  process.env["_X_AMZN_TRACE_ID"] = traceId
  functionArn =
    response.headers.get("Lambda-Runtime-Invoked-Function-Arn") ?? undefined
  if (functionArn === undefined) {
    exit("Runtime received a request without a function ARN")
  }
  const deadlineMs =
    parseInt(response.headers.get("Lambda-Runtime-Deadline-Ms") ?? "0") || null
  let event
  try {
    event = await response.json()
  } catch (cause) {
    exit("Runtime received a request with invalid JSON", cause)
  }
  return {
    requestId,
    traceId,
    functionArn,
    deadlineMs,
    event,
  }
}

type LambdaResponse = {
  readonly statusCode: number
  readonly headers?: Record<string, string>
  readonly encoding?: "base64"
  readonly body?: string
}

async function formatResponse(response: Response): Promise<LambdaResponse> {
  const statusCode = response.status
  const headers = response.headers.toJSON()
  const mime = headers["content-type"]
  const isBase64Encoded =
    !mime || (!mime.startsWith("text/") && !mime.startsWith("application/json"))
  const body = isBase64Encoded
    ? Buffer.from(await response.arrayBuffer()).toString("base64")
    : await response.text()
  return {
    statusCode,
    headers,
    encoding: isBase64Encoded ? "base64" : undefined,
    body,
  }
}

async function sendResponse(response: unknown): Promise<void> {
  if (requestId === undefined) {
    exit("Runtime attempted to send a response without a request ID")
  }
  await fetch(`runtime/invocation/${requestId}/response`, {
    method: "POST",
    body: response === null ? null : JSON.stringify(response),
  })
}

type VercelEvent = {
  readonly body: string
}

type VercelEventParsedBody = {
  readonly method: string
  readonly headers: any
  readonly path: string
  readonly body?: string
  readonly encoding?: string
}

function formatVercelEvent(event: VercelEvent): Request {
  const payload = JSON.parse(event.body) as VercelEventParsedBody
  const host = payload.headers["x-forwarded-host"]
  return new Request(`https://${host}${payload.path}`, {
    method: payload.method,
    body: payload.body,
    headers: payload.headers,
  })
}

function formatRequest(input: LambdaRequest): Request {
  const { event, requestId, traceId, functionArn, deadlineMs } = input
  let request = formatVercelEvent(event)
  request.headers.set("x-amzn-requestid", requestId)
  request.headers.set("x-amzn-trace-id", traceId)
  request.headers.set("x-amzn-function-arn", functionArn)
  if (deadlineMs !== null) {
    request.headers.set("x-amzn-deadline-ms", `${deadlineMs}`)
  }
  // @ts-ignore: Attach the original event to the Request
  request.aws = event
  return request
}

class LambdaServer implements Server {
  #lambda: Lambda
  #upgrade: Response | null
  pendingRequests: number
  pendingWebSockets: number
  port: number
  hostname: string
  development: boolean
  id: string

  constructor(lambda: Lambda) {
    this.#lambda = lambda
    this.#upgrade = null
    this.pendingRequests = 0
    this.pendingWebSockets = 0
    this.port = 80
    this.hostname = "lambda"
    this.development = false
    this.id = "lambda"
  }

  async accept(request: LambdaRequest): Promise<unknown> {
    const deadlineMs =
      request.deadlineMs === null ? Date.now() + 60_000 : request.deadlineMs
    const durationMs = Math.max(1, deadlineMs - Date.now())
    let response: unknown
    try {
      response = await Promise.race([
        new Promise<undefined>((resolve) => setTimeout(resolve, durationMs)),
        this.#acceptRequest(request),
      ])
    } catch (cause) {
      await sendError("RequestError", cause)
      return
    }
    if (response === undefined) {
      await sendError("TimeoutError", "Function timed out")
      return
    }
    return response
  }

  async #acceptRequest(event: LambdaRequest): Promise<unknown> {
    const request = formatRequest(event)
    const response = await this.fetch(request)
    if (response === undefined) {
      return {
        statusCode: 200,
      }
    }
    if (!request?.headers.has("Host")) {
      return response.text()
    }
    return formatResponse(response)
  }

  stop(): void {
    exit("Runtime exited because Server.stop() was called")
  }

  reload(options: any): void {
    this.#lambda = {
      fetch: options.fetch ?? this.#lambda.fetch,
      error: options.error ?? this.#lambda.error,
    }
    this.port =
      typeof options.port === "number"
        ? options.port
        : typeof options.port === "string"
        ? parseInt(options.port)
        : this.port
    this.hostname = options.hostname ?? this.hostname
    this.development = options.development ?? this.development
  }

  async fetch(request: Request): Promise<Response> {
    this.pendingRequests++
    try {
      let response = await this.#lambda.fetch(request, this as any)
      if (response instanceof Response) {
        return response
      }
      if (response === undefined && this.#upgrade !== null) {
        return this.#upgrade
      }
      throw new Error("fetch() did not return a Response")
    } catch (cause) {
      console.error(cause)
      if (this.#lambda.error !== undefined) {
        try {
          return await this.#lambda.error(cause)
        } catch (cause) {
          console.error(cause)
        }
      }
      return new Response(null, { status: 500 })
    } finally {
      this.pendingRequests--
      this.#upgrade = null
    }
  }

  upgrade(): boolean {
    return false
  }

  publish(): number {
    return 0
  }
}

const server = new LambdaServer(main)

while (true) {
  try {
    const request = await receiveRequest()
    const response = await server.accept(request)
    if (response !== undefined) {
      await sendResponse(response)
    }
  } finally {
    reset()
  }
}
