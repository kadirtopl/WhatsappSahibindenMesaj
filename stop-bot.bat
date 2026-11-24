@echo off
echo WhatsApp Bot durduruluyor...
for /f "tokens=2" %%a in ('tasklist ^| findstr "node.exe"') do taskkill /F /PID %%a
echo Bot durduruldu! 