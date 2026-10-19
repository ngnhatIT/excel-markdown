param([string]$WorkDir = (Join-Path $env:TEMP 'measure-glyphs'), [string]$DataDir = '')
# Chạy bước 1 + 2 cho cả bốn kiểu chữ app dùng, ghi kết quả đo vào data\precise-<kiểu>.txt (đầu vào của
# gen-table.cjs). Kết quả quét thô (bước 1) để trong $WorkDir, không cần commit. Xem README.md.
# Mỗi bước chạy trong một tiến trình PowerShell + Excel riêng; không đụng Excel người dùng đang mở.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$data = if ($DataDir -ne '') { $DataDir } else { Join-Path $here 'data' }
if (-not (Test-Path $WorkDir)) { [void](New-Item -ItemType Directory -Path $WorkDir) }
if (-not (Test-Path $data)) { [void](New-Item -ItemType Directory -Path $data) }
# kiểu chữ: tên, cỡ, đậm, số bản sao để chữ rộng 1em vừa khít một dòng của cột 150 (1055px)
$styles = @(
  @{ Key = 'r10'; Font = ''; Size = 10; Bold = $false; Copies = 78 },
  @{ Key = 'b10'; Font = ''; Size = 10; Bold = $true; Copies = 78 },
  @{ Key = 'b12'; Font = ''; Size = 12; Bold = $true; Copies = 63 },
  @{ Key = 'code10'; Font = 'MS Gothic'; Size = 10; Bold = $false; Copies = 72 }
)
function Invoke-Step([string]$file, [hashtable]$style, [string[]]$extra) {
  $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $here $file)) + $extra +
    @('-Copies', $style.Copies, '-Size', $style.Size)
  if ($style.Font -ne '') { $argv += @('-Font', $style.Font) }
  if ($style.Bold) { $argv += '-Bold' }
  & powershell @argv
  if ($LASTEXITCODE -ne 0) { throw "$file that bai ($($style.Key))" }
}
# Bước 1: quét U+00A0–U+FFFF cho từng kiểu
foreach ($s in $styles) { Invoke-Step 'scan.ps1' $s @('-Out', (Join-Path $WorkDir "scan-$($s.Key).txt")) }
# Hợp các ký tự bị đánh dấu (U+3042 あ đứng đầu làm mốc 1em)
$set = New-Object 'System.Collections.Generic.SortedSet[string]'
foreach ($s in $styles) {
  Get-Content (Join-Path $WorkDir "scan-$($s.Key).txt") -Encoding UTF8 | Select-Object -Skip 2 | ForEach-Object { [void]$set.Add($_.Split("`t")[0]) }
}
[void]$set.Remove('3042')
$list = Join-Path $WorkDir 'union.txt'
[System.IO.File]::WriteAllLines($list, @('3042') + @($set), (New-Object System.Text.UTF8Encoding($false)))
"union: $($set.Count) ky tu"
# Bước 2: đo chính xác cả danh sách hợp ở từng kiểu
foreach ($s in $styles) { Invoke-Step 'precise.ps1' $s @('-In', $list, '-Out', (Join-Path $data "precise-$($s.Key).txt")) }
'xong: chay tiep  node scripts/measure-glyphs/gen-table.cjs'
