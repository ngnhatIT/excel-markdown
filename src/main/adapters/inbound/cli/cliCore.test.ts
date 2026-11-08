import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parseArgs, runCli } from './cliCore'

const fixture = join(__dirname, '../../../../../test/fixtures/excel-authored.xlsx')
const tmp = mkdtempSync(join(tmpdir(), 'x2m-cli-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('parseArgs', () => {
  it('đọc cờ và giá trị', () => {
    const a = parseArgs(['a.xlsx', '-o', 'out', '--range', 'A1:B2', '--chunk', '5', '--formulas', '--front-matter'])
    expect(a.files).toEqual(['a.xlsx'])
    expect(a.outDir).toBe('out')
    expect(a.options).toMatchObject({ range: 'A1:B2', chunkRows: 5, showFormulas: true, frontMatter: true })
  })
  it('báo lỗi rõ ràng', () => {
    expect(() => parseArgs(['-o', 'x'])).toThrow('Chưa có file')
    expect(() => parseArgs(['a.xlsx'])).toThrow('-o')
    expect(() => parseArgs(['a.xlsx', '-o', 'x', '--bogus'])).toThrow('--bogus')
    expect(() => parseArgs(['a.xlsx', '-o', 'x', '--chunk', '-1'])).toThrow('--chunk')
    expect(() => parseArgs(['a.xlsx', '-o'])).toThrow('Thiếu giá trị')
  })
})

describe('runCli', () => {
  it('per-sheet: ghi .md có front-matter', async () => {
    const out = join(tmp, 'ps')
    expect(await runCli([fixture, '-o', out, '--front-matter'], () => {})).toBe(0)
    const files = readdirSync(out)
    expect(files.length).toBeGreaterThan(0)
    expect(readFileSync(join(out, files[0]), 'utf-8')).toMatch(/^---\nsource: "excel-authored.xlsx"\nsheet: /)
  })
  it('per-workbook: một file', async () => {
    const out = join(tmp, 'pw')
    expect(await runCli([fixture, '-o', out, '--per-workbook'], () => {})).toBe(0)
    expect(readdirSync(out)).toEqual(['excel-authored.md'])
  })
  it('file hỏng -> mã thoát 1, không ném', async () => {
    const logs: string[] = []
    expect(await runCli([join(tmp, 'khong-co.xlsx'), '-o', join(tmp, 'e')], (s) => logs.push(s))).toBe(1)
    expect(logs[0]).toContain('LỖI')
  })
})
