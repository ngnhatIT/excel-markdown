import { configDefaults, defineConfig } from 'vitest/config'

// Bỏ worktree của Claude Code (.claude/worktrees) — bản sao repo, không phải test của checkout này
export default defineConfig({ test: { exclude: [...configDefaults.exclude, '.claude/**'] } })
