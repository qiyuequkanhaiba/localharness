@echo off
setlocal EnableExtensions
set "PATH=C:\Program Files\nodejs;%ProgramFiles%\nodejs;%PATH%"
set "BUILD_ROOT=C:\lh"
set "SRC=C:\Mac\Home\Desktop\localharness-winbuild"
set "OUT=C:\Mac\Home\Desktop\localharness-winbuild\release-win"

echo [1/6] Node
where node
if not exist "C:\Program Files\nodejs\node.exe" (
  echo node.exe missing
  exit /b 1
)
"C:\Program Files\nodejs\node.exe" -v
call "C:\Program Files\nodejs\npm.cmd" -v

echo [2/6] Stage source onto C:
if exist "%BUILD_ROOT%" rmdir /s /q "%BUILD_ROOT%"
mkdir "%BUILD_ROOT%"
if not exist "%BUILD_ROOT%" (
  echo failed to create %BUILD_ROOT%
  exit /b 1
)
robocopy "%SRC%" "%BUILD_ROOT%" /E /XD node_modules out release release-win .git /NFL /NDL /NJH /NJS /nc /ns /np
set "RC=%ERRORLEVEL%"
echo robocopy exit %RC%
if %RC% GEQ 8 (
  echo robocopy failed
  exit /b 1
)

cd /d "%BUILD_ROOT%"
echo [3/6] npm ci
call "C:\Program Files\nodejs\npm.cmd" ci
if not "%ERRORLEVEL%"=="0" (
  echo npm ci failed, trying npm install
  call "C:\Program Files\nodejs\npm.cmd" install
  if not "%ERRORLEVEL%"=="0" exit /b 1
)

echo [4/6] prepare official Windows engine
call "C:\Program Files\nodejs\npm.cmd" run prepare-engine
if not "%ERRORLEVEL%"=="0" exit /b 1

echo [5/6] electron-builder Windows x64
call "C:\Program Files\nodejs\npm.cmd" run dist:win
if not "%ERRORLEVEL%"=="0" exit /b 1

echo [6/6] copy artifacts back to Mac Desktop
if not exist "%OUT%" mkdir "%OUT%"
copy /Y "%BUILD_ROOT%\release\*.exe" "%OUT%\"
if exist "%BUILD_ROOT%\release\*.yml" copy /Y "%BUILD_ROOT%\release\*.yml" "%OUT%\"
dir /b "%OUT%"
echo DONE
exit /b 0
