@echo off
title SignX Launcher
echo Starting SignX...
cd /d "%~dp0signX"
node start-all.mjs
pause
