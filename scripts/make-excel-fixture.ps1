# Mở test/fixtures/kihon-sekkei.xlsx bằng Excel thật, thêm vài thứ chỉ Excel mới ghi ra
# (định dạng ngày native, hyperlink trong/ngoài, ô định dạng lạc ở xa làm phình
# dimension), rồi lưu lại dạng .xlsx và .xls -> file mẫu "do Excel ghi".
# Chạy (cần Microsoft Excel): powershell -ExecutionPolicy Bypass -File scripts/make-excel-fixture.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'test\fixtures\kihon-sekkei.xlsx'
$outXlsx = Join-Path $root 'test\fixtures\excel-authored.xlsx'
$outXls = Join-Path $root 'test\fixtures\excel-authored.xls'

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open($src)
  $s1 = $wb.Worksheets.Item('画面項目定義')
  $s2 = $wb.Worksheets.Item('テーブル定義')

  # Ô định dạng lạc ở xa (không có giá trị): Excel ghi dimension A1:CZ5000
  $s1.Range('CZ5000').Interior.Color = 65535

  # Hyperlink do Excel tạo: link ngoài và link nội bộ sang sheet khác
  [void]$s1.Hyperlinks.Add($s1.Range('B17'), 'https://example.com/detail')
  [void]$s1.Hyperlinks.Add($s1.Range('B16'), '', "'テーブル定義'!A1")

  # Ngày + số với định dạng native của Excel
  $s2.Range('F4').Value2 = 46300
  $s2.Range('F4').NumberFormat = 'yyyy/m/d'
  $s2.Range('G5').Value2 = 0.5
  $s2.Range('G5').NumberFormat = '0%'

  # Ô nhiều dòng (Alt+Enter) có thụt lề toàn角 ở dòng 2
  $s2.Range('B9').Value2 = "備考" + [char]10 + [char]0x3000 + "二行目"

  $wb.SaveAs($outXlsx, 51)  # xlOpenXMLWorkbook
  $wb.SaveAs($outXls, 56)   # xlExcel8 (BIFF8)
  $wb.Close($false)
  Write-Output "wrote $outXlsx"
  Write-Output "wrote $outXls"
}
finally {
  $excel.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
