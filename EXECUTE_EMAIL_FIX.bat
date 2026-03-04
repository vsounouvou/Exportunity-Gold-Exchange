@echo off
REM ============================================
REM EMAIL FIX EXECUTION SCRIPT
REM ============================================
REM This script executes all phases of the email fix
REM Date: 2026-02-12
REM ============================================

echo ============================================
echo EMAIL FIX EXECUTION - PHASE BY PHASE
echo ============================================
echo.

REM Change to project directory
cd /d "%~dp0"

echo [PHASE 1] DNS Verification
echo ============================================
echo Checking current DNS records...
echo.

echo Checking boursedelor.com SPF...
nslookup -type=TXT boursedelor.com 8.8.8.8 | findstr /i "spf"
echo.

echo Checking exportunity.net SPF...
nslookup -type=TXT exportunity.net 8.8.8.8 | findstr /i "spf"
echo.

echo Checking boursedelor.com DKIM...
nslookup -type=TXT s1._domainkey.boursedelor.com 8.8.8.8
echo.

echo Checking exportunity.net DKIM...
nslookup -type=TXT s1._domainkey.exportunity.net 8.8.8.8
echo.

echo Checking PTR...
nslookup 51.254.143.30
echo.

echo [PHASE 2] DKIM Keys - REQUIRES MANUAL ACTION
echo ============================================
echo SSH into mail.exportunity.net and run:
echo   docker exec -it mailserver bash
echo   opendkim-genkey -b 2048 -d boursedelor.com -D /etc/opendkim/keys/boursedelor.com -s s1 -v
echo   opendkim-genkey -b 2048 -d exportunity.net -D /etc/opendkim/keys/exportunity.net -s s1 -v
echo   cat /etc/opendkim/keys/boursedelor.com/s1.txt
echo   cat /etc/opendkim/keys/exportunity.net/s1.txt
echo.
pause

echo [PHASE 3] SMTP Configuration
echo ============================================
echo .env has been updated with SMTP settings
echo IMPORTANT: Update MAIL_SMTP_PASS in .env before continuing
echo.
pause

echo [PHASE 4] Installing Dependencies
echo ============================================
call npm install tail
echo.

echo [PHASE 5] Agent Identity Migration
echo ============================================
call npx tsx scripts\fix-agent-email-identities.ts
echo.
pause

echo [PHASE 6] Acceptance Tests
echo ============================================
echo WARNING: This will fail if DNS is not propagated (wait 2-24h)
echo.
call npx tsx scripts\email-acceptance-tests.ts
echo.

echo ============================================
echo EXECUTION COMPLETE
echo ============================================
pause
