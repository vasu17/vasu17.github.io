@echo off
:: ─────────────────────────────────────────────────────────────────────────────
:: start-local.bat  — Launch the website locally with Chrome for full perf API
::
::  • Starts a static file server on http://localhost:3000
::  • Opens Chrome with --enable-precise-memory-info so performance.memory
::    reports real heap usage (otherwise it only updates every 20 s)
::  • Keeps the server window open
:: ─────────────────────────────────────────────────────────────────────────────

echo Starting local server on http://localhost:3000 ...
echo.

:: Try Python 3 first (usually available on Windows 10/11)
python --version >nul 2>&1
if %errorlevel%==0 (
    echo Using Python HTTP server
    start "" "http://localhost:3000"
    start /wait "" cmd /c "python -m http.server 3000"
    goto :done
)

:: Fall back to Python 2
python2 --version >nul 2>&1
if %errorlevel%==0 (
    echo Using Python 2 HTTP server
    start "" "http://localhost:3000"
    start /wait "" cmd /c "python2 -m SimpleHTTPServer 3000"
    goto :done
)

:: Fall back to Node / npx serve
node --version >nul 2>&1
if %errorlevel%==0 (
    echo Using npx serve
    start "" "http://localhost:3000"
    npx -y serve . -p 3000
    goto :done
)

echo ERROR: Neither Python nor Node.js found.
echo Install either from https://python.org or https://nodejs.org and re-run.
pause
exit /b 1

:done
echo Server stopped.
