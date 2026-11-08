/* MCP server qua stdio: `node out/main/mcp.js` (xem README mục "Dùng với Claude Code / Codex"). */
import { createInterface } from 'node:readline'
import { handleMcpMessage } from './adapters/inbound/mcp/mcpCore'

// stdout chỉ dành cho JSON-RPC: mọi log khác sang stderr để không làm hỏng giao thức
console.log = console.error
console.info = console.error

const send = (msg: unknown): void => {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return
  let msg: unknown
  try {
    msg = JSON.parse(line)
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }
  void handleMcpMessage(msg).then((res) => {
    if (res) send(res)
  })
})
