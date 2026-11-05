import { runCli, USAGE } from './adapters/inbound/cli/cliCore'

try {
  process.exitCode = runCli(process.argv.slice(2))
} catch (err) {
  console.error((err instanceof Error ? err.message : String(err)) + '\n' + USAGE)
  process.exitCode = 2
}
