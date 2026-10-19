param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Copies = 78,
  [string]$Font = '',
  [double]$Size = 10,
  [switch]$Bold,
  [double]$ColWidth = 150
)
# Bước 2 — đo chính xác: với mỗi code point trong $In (mã hex, mỗi dòng một mã), tìm nhị phân số ký tự tối đa n
# nằm vừa một dòng của cột rộng $ColWidth. Tìm song song: mỗi mã một hàng, mỗi vòng AutoFit cả khối.
# "Vừa một dòng" = cao không quá chiều cao khi ô chỉ có 1 ký tự đó. Kết quả mỗi dòng: mã, h1 (cao 1 dòng), n
# (n >= $Copies nghĩa là không rộng hơn ngưỡng). Bề rộng ký tự < (bề rộng vùng chữ + 1) / n.
# Tạo tiến trình Excel riêng, luôn Quit + giải phóng COM ở finally. Lưu file này dạng UTF-8 CÓ BOM.
$ErrorActionPreference = 'Stop'
if ($Font -eq '') { $Font = -join @([char]0x6E38, [char]0x30B4, [char]0x30B7, [char]0x30C3, [char]0x30AF) }
$cps = @(Get-Content $In | Where-Object { $_ -match '^[0-9A-Fa-f]+$' } | ForEach-Object { [Convert]::ToInt32($_, 16) })
$total = $cps.Count
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false
$wb = $null
$res = New-Object System.Collections.Generic.List[string]
try {
  $wb = $excel.Workbooks.Add()
  $ws = $wb.Worksheets.Item(1)
  $col = $ws.Columns.Item(1)
  $col.ColumnWidth = $ColWidth
  $res.Add("colPx`t" + [math]::Round($col.Width * 96 / 72) + "`tfont`t$Font`tsize`t$Size`tbold`t" + [bool]$Bold)
  $rng = $ws.Range("A1:A$total")
  $rng.Font.Name = $Font
  $rng.Font.Size = $Size
  $rng.Font.Bold = [bool]$Bold
  $rng.WrapText = $true
  $rng.NumberFormat = '@'
  $ch = @($cps | ForEach-Object { [char]::ConvertFromUtf32($_) })
  # Ghi $counts[i] bản sao của ký tự i vào hàng i, AutoFit, trả về chiều cao từng hàng.
  function Fill([int[]]$counts) {
    $arr = New-Object 'object[,]' $total, 1
    for ($i = 0; $i -lt $total; $i++) { $arr[$i, 0] = $ch[$i] * $counts[$i] }
    $rng.Value2 = $arr
    [void]$rng.Rows.AutoFit()
    $h = New-Object 'double[]' $total
    for ($i = 0; $i -lt $total; $i++) { $h[$i] = $ws.Rows.Item($i + 1).RowHeight }
    return , $h
  }
  $ones = New-Object 'int[]' $total; for ($i = 0; $i -lt $total; $i++) { $ones[$i] = 1 }
  $h1 = Fill $ones
  $lo = New-Object 'int[]' $total; $hi = New-Object 'int[]' $total
  for ($i = 0; $i -lt $total; $i++) { $lo[$i] = 1; $hi[$i] = $Copies }
  $hc = Fill $hi
  $done = New-Object 'bool[]' $total
  for ($i = 0; $i -lt $total; $i++) { if ($hc[$i] -le $h1[$i] + 0.01) { $lo[$i] = $Copies; $done[$i] = $true } }
  while ($true) {
    $mid = New-Object 'int[]' $total
    $any = $false
    for ($i = 0; $i -lt $total; $i++) {
      if (-not $done[$i] -and $hi[$i] - $lo[$i] -gt 1) { $mid[$i] = [int][math]::Floor(($lo[$i] + $hi[$i]) / 2); $any = $true } else { $mid[$i] = $lo[$i] }
    }
    if (-not $any) { break }
    $hm = Fill $mid
    for ($i = 0; $i -lt $total; $i++) {
      if ($done[$i] -or $hi[$i] - $lo[$i] -le 1) { continue }
      if ($hm[$i] -le $h1[$i] + 0.01) { $lo[$i] = $mid[$i] } else { $hi[$i] = $mid[$i] }
    }
  }
  for ($i = 0; $i -lt $total; $i++) {
    $cnt = $lo[$i]
    # dấu nháy đơn đầu ô là tiền tố chữ của Excel, không hiển thị
    if ($cps[$i] -eq 0x27) { $cnt = $cnt - 1 }
    $res.Add(("{0:X4}`t{1}`t{2}" -f $cps[$i], $h1[$i], $cnt))
  }
} finally {
  try { if ($null -ne $wb) { $wb.Close($false) } } catch { }
  try { $excel.Quit() } catch { }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
[System.IO.File]::WriteAllLines($Out, $res, (New-Object System.Text.UTF8Encoding($true)))
"precise: $total ma -> $Out"
