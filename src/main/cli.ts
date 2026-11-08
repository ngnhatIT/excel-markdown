import { runCli, USAGE } from './adapters/inbound/cli/cliCore'

runCli(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (err: unknown) => {
    console.error((err instanceof Error ? err.message : String(err)) + '\n' + USAGE)
    process.exitCode = 2
  }
)
