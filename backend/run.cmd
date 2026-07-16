@echo off
.venv\Scripts\python -m uvicorn a2a_firewall.main:app --host 0.0.0.0 --port 8000 --reload
