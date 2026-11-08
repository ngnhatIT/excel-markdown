; Thêm "Open with → ExcelToMarkdown" cho .xlsx / .xlsm / .xls / .md / .markdown mà KHÔNG giành app mặc định.
; Không dùng build.fileAssociations: electron-builder (APP_ASSOCIATE) ghi Software\Classes\.<ext> (mặc định)
; = ProgID của app, tức chiếm quyền mở của Excel / trình soạn Markdown, và khi gỡ để lại liên kết trỏ vào
; ProgID đã xóa. Ở đây chỉ đăng ký ProgID riêng + thêm vào OpenWithProgids: app mặc định giữ nguyên.

!macro x2mProgId ID DESC
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}" "" "${DESC}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}\shell\open" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${ID}\shell\open\command" "" '"$appExe" "%1"'
!macroend

!macro customInstall
  !insertmacro x2mProgId "ExcelToMarkdown.Workbook" "Excel Workbook"
  !insertmacro x2mProgId "ExcelToMarkdown.Markdown" "Markdown Document"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.xlsx\OpenWithProgids" "ExcelToMarkdown.Workbook"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.xlsm\OpenWithProgids" "ExcelToMarkdown.Workbook"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.xls\OpenWithProgids" "ExcelToMarkdown.Workbook"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "ExcelToMarkdown.Markdown"
  WriteRegNone SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "ExcelToMarkdown.Markdown"
  System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.xlsx\OpenWithProgids" "ExcelToMarkdown.Workbook"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.xlsm\OpenWithProgids" "ExcelToMarkdown.Workbook"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.xls\OpenWithProgids" "ExcelToMarkdown.Workbook"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.md\OpenWithProgids" "ExcelToMarkdown.Markdown"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.markdown\OpenWithProgids" "ExcelToMarkdown.Markdown"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\ExcelToMarkdown.Workbook"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\ExcelToMarkdown.Markdown"
  System::Call "shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)"
!macroend
