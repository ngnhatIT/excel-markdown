@echo off
rem x2m-mcp: MCP server (stdio) cua ExcelToMarkdown cho Claude Code / Codex / Claude Desktop.
rem Nam o <thu muc cai>\resources\bin\ : exe o ..\..\ , app.asar o ..\
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\ExcelToMarkdown.exe" "%~dp0..\app.asar\out\main\mcp.js" %*
exit /b %ERRORLEVEL%
