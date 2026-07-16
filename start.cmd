@echo off
cd /d "%~dp0"
echo Starting A2A Firewall...

start "A2A Backend"  cmd /c "cd backend  && .venv\Scripts\python -m uvicorn a2a_firewall.main:app --host 0.0.0.0 --port 8000"
start "A2A Frontend" cmd /c "cd frontend && npx next dev"

echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo Close the terminals to stop.
