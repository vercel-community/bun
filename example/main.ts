import type { Server } from "bun"

export default {
  async fetch(request: Request, server: Server) {
    let text = "Hello from Bun on Vercel!\n"

    text += `\nurl: ${request.url}\n`

    for (const [key, value] of request.headers.entries()) {
      if (!key.startsWith("x-vercel")) continue
      text += `\n${key}: ${value}`
    }

    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
    })
  },
}
