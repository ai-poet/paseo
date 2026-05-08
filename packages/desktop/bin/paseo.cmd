@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "RESOURCES_DIR=%SCRIPT_DIR%.."
set "APP_EXECUTABLE="
set "EXECUTABLE_NAME_FILE=%RESOURCES_DIR%\bin\app-executable-name"
if exist "%EXECUTABLE_NAME_FILE%" (
  set /p APP_EXECUTABLE_NAME=<"%EXECUTABLE_NAME_FILE%"
  if exist "%RESOURCES_DIR%\..\%APP_EXECUTABLE_NAME%.exe" (
    set "APP_EXECUTABLE=%RESOURCES_DIR%\..\%APP_EXECUTABLE_NAME%.exe"
  )
)

if not "%APP_EXECUTABLE%"=="" goto :found_app_executable

for %%F in ("%RESOURCES_DIR%\..\*.exe") do (
  set "APP_EXECUTABLE=%%~fF"
  goto :found_app_executable
)

:found_app_executable
if "%APP_EXECUTABLE%"=="" (
  echo Bundled app executable not found relative to %RESOURCES_DIR% 1>&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
"%APP_EXECUTABLE%" --disable-warning=DEP0040 "%RESOURCES_DIR%\app.asar.unpacked\dist\daemon\node-entrypoint-runner.js" node-script "%RESOURCES_DIR%\app.asar\node_modules\@getpaseo\cli\dist\index.js" %*
exit /b %errorlevel%
