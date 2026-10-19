param(
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$From = 0xA0,
  [int]$To = 0xFFFF,
  [int]$Copies = 78,
  [string]$Font = '',
  [double]$Size = 10,
  [switch]$Bold,
  [double]$ColWidth = 150,
  [int]$ChunkSize = 4096
)
# Bước 1 — quét nhanh: mỗi code point một hàng, lặp $Copies lần trong cột rộng $ColWidth (wrapText), AutoFit cả khối.
# $Copies chọn sao cho chữ rộng đúng 1em vừa khít một dòng (78 ở 游ゴシック 10, 63 ở 12 đậm, 72 ở MS Gothic 10):
# hàng cao hơn một dòng => ký tự rộng hơn 1em (hoặc làm dòng cao hơn). Ghi mã hex các hàng đó vào $Out.
# Tạo tiến trình Excel riêng (New-Object), luôn Quit + giải phóng COM ở finally: không đụng Excel người dùng đang mở.
# Lưu file này dạng UTF-8 CÓ BOM (PowerShell 5.1).
$ErrorActionPreference = 'Stop'
if ($Font -eq '') { $Font = -join @([char]0x6E38, [char]0x30B4, [char]0x30B7, [char]0x30C3, [char]0x30AF) }
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
  $res.Add("colPx`t" + [math]::Round($col.Width * 96 / 72) + "`tcopies`t$Copies`tfont`t$Font`tsize`t$Size`tbold`t" + [bool]$Bold)
  $rng = $ws.Range("A1:A$ChunkSize")
  $rng.Font.Name = $Font
  $rng.Font.Size = $Size
  $rng.Font.Bold = [bool]$Bold
  $rng.WrapText = $true
  $rng.NumberFormat = '@'
  $ws.Range('A1').Value2 = 'a'
  [void]$ws.Range('A1').Rows.AutoFit()
  $base = [double]$ws.Rows.Item(1).RowHeight
  $res.Add("baseHeight`t$base")
  $script:flag = New-Object System.Collections.Generic.List[int]
  # Chia đôi khoảng hàng: RowHeight của nhiều hàng khác nhau trả về null => tách tiếp tới từng hàng.
  function Check([int]$a, [int]$b) {
    $h = $ws.Range("A${a}:A${b}").RowHeight
    if ($h -is [double] -and [math]::Abs($h - $base) -lt 0.01) { return }
    if ($a -eq $b) { $script:flag.Add($a); return }
    $m = [int][math]::Floor(($a + $b) / 2)
    Check $a $m
    Check ($m + 1) $b
  }
  $t0 = Get-Date
  for ($start = $From; $start -le $To; $start += $ChunkSize) {
    $end = [math]::Min($To, $start + $ChunkSize - 1)
    $count = $end - $start + 1
    $arr = New-Object 'object[,]' $count, 1
    for ($i = 0; $i -lt $count; $i++) {
      $cp = $start + $i
      # bỏ nửa cặp surrogate, ký tự điều khiển, U+xxFFFE/U+xxFFFF
      if (($cp -ge 0xD800 -and $cp -le 0xDFFF) -or $cp -lt 0x20 -or ($cp -ge 0x7F -and $cp -le 0x9F) -or ($cp -band 0xFFFE) -eq 0xFFFE) { $arr[$i, 0] = ''; continue }
      $arr[$i, 0] = [char]::ConvertFromUtf32($cp) * $Copies
    }
    $r = $ws.Range("A1:A$count")
    $r.Value2 = $arr
    [void]$r.Rows.AutoFit()
    $script:flag.Clear()
    Check 1 $count
    foreach ($row in $script:flag) {
      $res.Add(("{0:X4}`t{1}" -f ($start + $row - 1), $ws.Rows.Item($row).RowHeight))
    }
    [Console]::Error.WriteLine(("chunk {0:X5}-{1:X5}: {2} ({3:N0}s)" -f $start, $end, $script:flag.Count, ((Get-Date) - $t0).TotalSeconds))
  }
} finally {
  try { if ($null -ne $wb) { $wb.Close($false) } } catch { }
  try { $excel.Quit() } catch { }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
[System.IO.File]::WriteAllLines($Out, $res, (New-Object System.Text.UTF8Encoding($true)))
"scan: " + ($res.Count - 2) + " ky tu bi danh dau -> $Out"
