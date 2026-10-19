# Mở một file .xlsx bằng Excel thật (COM) và chụp ảnh PNG từng sheet để review bố cục.
# Dùng sau khi app tạo file ở chế độ Markdown -> Excel: nếu Excel đòi sửa file thì in REPAIRED
# (không mở được file thì in FAILED) và thoát mã 1; ngược lại ghi OutDir\sheet1.png,
# sheet2.png... và in `OK <số sheet>`.
# Lưu ý: script dùng clipboard (CopyPicture/Paste) và hiện cửa sổ Excel khi chạy: đừng
# copy/paste ở chương trình khác cho tới khi script xong.
# Chạy (cần Microsoft Excel):
#   powershell -ExecutionPolicy Bypass -File scripts/xlsx-snapshot.ps1 -In <đường dẫn .xlsx> -OutDir <thư mục>
# Lưu file này dạng UTF-8 CÓ BOM: PowerShell 5.1 đọc file không BOM theo ANSI và làm hỏng chữ Nhật.
# Script tạo một tiến trình Excel riêng (không đụng cửa sổ/workbook Excel khác của người dùng)
# và luôn Quit + giải phóng COM ở khối finally. Excel hiện cửa sổ (Visible) vì CopyPicture
# kiểu màn hình cần sheet đang hiển thị.
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$OutDir
)
$ErrorActionPreference = 'Stop'

$inPath = (Resolve-Path -LiteralPath $In).Path
if (-not (Test-Path -LiteralPath $OutDir)) { [void](New-Item -ItemType Directory -Path $OutDir) }
$outPath = (Resolve-Path -LiteralPath $OutDir).Path

$exitCode = 0
$excel = New-Object -ComObject Excel.Application
$wb = $null
try {
  $excel.Visible = $true
  $excel.DisplayAlerts = $false
  # Mở chỉ đọc, không cập nhật liên kết ngoài: file kiểm tra không bị sửa.
  try {
    $wb = $excel.Workbooks.Open($inPath, 0, $true)
  } catch {
    # Với DisplayAlerts = $false, file hỏng nặng làm Open ném lỗi thay vì tự sửa: coi như không đạt.
    "FAILED Excel không mở được file: $($_.Exception.Message)"
    $exitCode = 1
  }

  # Excel tự sửa file hỏng thì ghi "Repaired" (hoặc 修復 trên Excel tiếng Nhật) vào tiêu đề cửa sổ.
  $caption = ''
  if ($null -ne $wb -and $null -ne $excel.ActiveWindow) { $caption = [string]$excel.ActiveWindow.Caption }
  if ($null -eq $wb) {
    # đã báo FAILED ở trên
  } elseif ($caption -match 'Repaired' -or $caption -match '修復') {
    'REPAIRED'
    $exitCode = 1
  } else {
    $count = 0
    foreach ($ws in $wb.Worksheets) {
      $count++
      [void]$ws.Activate()
      Start-Sleep -Milliseconds 300
      $range = $ws.UsedRange
      # xlScreen = 1, xlBitmap = 2: chụp đúng như đang hiển thị (có viền, nền, merge).
      [void]$range.CopyPicture(1, 2)
      # Excel không xuất clipboard thành PNG trực tiếp: dán vào chart cùng kích thước rồi Export.
      $chartObject = $ws.ChartObjects().Add(0, 0, $range.Width + 4, $range.Height + 4)
      [void]$chartObject.Activate()
      Start-Sleep -Milliseconds 300
      [void]$chartObject.Chart.Paste()
      Start-Sleep -Milliseconds 300
      $png = Join-Path $outPath ("sheet$count.png")
      [void]$chartObject.Chart.Export($png)
      [void]$chartObject.Delete()
      if (-not (Test-Path -LiteralPath $png)) { throw "Không xuất được ảnh: $png" }
      "png $png"
    }
    "OK $count"
  }
} finally {
  try { if ($null -ne $wb) { $wb.Close($false) } } catch { }
  try { $excel.Quit() } catch { }
  if ($null -ne $wb) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
exit $exitCode
