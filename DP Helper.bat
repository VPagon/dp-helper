@echo off
title DP Helper Launcher

:: Start React app in first command prompt
start "React App" cmd /k "cd /d C:\Users\vilim.pagon\OneDrive - RIMAC TECHNOLOGY d.o.o\projekti\dp-helper && npm start"

:: Start server in second command prompt
start "Server" cmd /k "cd /d C:\Users\vilim.pagon\OneDrive - RIMAC TECHNOLOGY d.o.o\projekti\dp-helper\server && node index.js"

exit