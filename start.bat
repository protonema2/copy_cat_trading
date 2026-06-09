@echo off
echo Starting CopyCat Trading Bot Dashboard...
echo.

echo [1/3] Starting PostgreSQL and Backend with Docker Compose...
docker-compose up -d
echo Waiting for services to start...
timeout /t 5 /nobreak

echo.
echo [2/3] Installing Frontend Dependencies...
cd frontend
call npm install
cd ..

echo.
echo [3/3] Starting Frontend Development Server...
start cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo Dashboard is starting up!
echo ========================================
echo Backend API: http://localhost:8000
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8000/docs
echo ========================================
echo.
echo To stop all services, run: docker-compose down
