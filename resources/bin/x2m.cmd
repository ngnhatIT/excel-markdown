@echo off
rem x2m: CLI cua ExcelToMarkdown, chay bang chinh ExcelToMarkdown.exe (khong can cai Node).
rem Nam o <thu muc cai>\resources\bin\ : exe o ..\..\ , app.asar o ..\
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\ExcelToMarkdown.exe" "%~dp0..\app.asar\out\main\cli.js" %*
exit /b %ERRORLEVEL%
