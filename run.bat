@echo off
cd /d "%~dp0"

if not exist "data\cctv.db" (
    echo Initializing database from CSV...
    node init-db.mjs
)

echo Starting CCTV Map server...
echo.
echo   Map:   http://localhost:8090
echo   Admin: http://localhost:8090/admin.html
echo.
echo Press Ctrl+C to stop
echo.
node serve.mjs
pause
