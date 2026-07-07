@echo off
setlocal
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress"`) do set IP=%%i
if "%IP%"=="" set IP=localhost

set URL=http://%IP%:3000/chat-app.html
set ORIGIN=http://%IP%:3000
set CHROME=

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe

if "%CHROME%"=="" (
    echo No encontre Google Chrome instalado.
    echo Abri manualmente: %URL%
    pause
    exit /b
)

"%CHROME%" --user-data-dir="%TEMP%\voxa-chrome" --unsafely-treat-insecure-origin-as-secure=%ORIGIN% "%URL%"
