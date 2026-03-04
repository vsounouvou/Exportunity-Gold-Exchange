param(
  [string]$BaseUrl = "https://boursedelor.com",
  [string]$Email = "",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"

if (-not $Email) {
  if ($env:E2E_ADMIN_EMAIL) {
    $Email = $env:E2E_ADMIN_EMAIL
  } else {
    $Email = "admin@exportunity.local"
  }
}

if (-not $Password) {
  if ($env:E2E_ADMIN_PASSWORD) {
    $Password = $env:E2E_ADMIN_PASSWORD
  } else {
    $Password = "ChangeMe123!"
  }
}

function Invoke-JsonApi {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [hashtable]$Headers = @{},
    [object]$Body = $null,
    [int]$TimeoutSec = 60
  )

  $json = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 20 } else { $null }

  try {
    if ($null -ne $json) {
      $response = Invoke-WebRequest -Method $Method -Uri $Url -Headers $Headers -ContentType "application/json" -Body $json -TimeoutSec $TimeoutSec
    } else {
      $response = Invoke-WebRequest -Method $Method -Uri $Url -Headers $Headers -TimeoutSec $TimeoutSec
    }

    $parsed = $null
    if ($response.Content) {
      try {
        $parsed = $response.Content | ConvertFrom-Json
      } catch {
        $parsed = $response.Content
      }
    }

    return [pscustomobject]@{
      ok = $true
      status = [int]$response.StatusCode
      body = $parsed
      raw = $response.Content
    }
  } catch {
    $status = 0
    $raw = ""

    if ($_.Exception.Response) {
      try { $status = [int]$_.Exception.Response.StatusCode.value__ } catch {}
      try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $raw = $reader.ReadToEnd()
        $reader.Close()
      } catch {}
    }

    $parsed = $null
    if ($raw) {
      try {
        $parsed = $raw | ConvertFrom-Json
      } catch {
        $parsed = $raw
      }
    }

    return [pscustomobject]@{
      ok = $false
      status = $status
      body = $parsed
      raw = $raw
    }
  }
}

$report = [ordered]@{}

$login = Invoke-JsonApi -Method "POST" -Url "$BaseUrl/api/ece/auth/login" -Body @{
  email = $Email
  password = $Password
}
$hasToken = [bool]($login.body.token)
$report.login = @{
  ok = $login.ok
  status = $login.status
  hasToken = $hasToken
}

if (-not $login.ok -or -not $hasToken) {
  $report | ConvertTo-Json -Depth 30
  exit 1
}

$token = [string]$login.body.token
$headers = @{
  Authorization = "Bearer $token"
  "x-ece-lang" = "en"
}

$runTag = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$csvPath = Join-Path $env:TEMP ("contacts-smoke-" + $runTag + ".csv")
@"
display_name,primary_email,primary_phone,source_system
Smoke Contact Alpha,smoke.alpha.$runTag@example.com,+2250101010101,csv
Smoke Contact Beta,smoke.beta.$runTag@example.com,+2250202020202,csv
"@ | Set-Content -Path $csvPath -Encoding UTF8

$curlOutput = & curl.exe -s -S -X POST "$BaseUrl/api/tenant/contacts/import/csv" `
  -H "Authorization: Bearer $token" `
  -H "x-ece-lang: en" `
  -F "file=@$csvPath;type=text/csv"

$importBody = $null
$importOk = $false
try {
  $importBody = $curlOutput | ConvertFrom-Json
  $importOk = $true
} catch {
  $importBody = [string]$curlOutput
}

$report.contactsImport = @{
  ok = $importOk
  body = $importBody
}

$rooms = Invoke-JsonApi -Method "GET" -Url "$BaseUrl/api/chatrooms?type=all&limit=100" -Headers $headers
$selectedRoom = $null
if ($rooms.ok -and $rooms.body) {
  $selectedRoom = @($rooms.body | Where-Object { $_.id -and $_.conversationId }) | Select-Object -First 1
}

$report.chatrooms = @{
  ok = $rooms.ok
  status = $rooms.status
  selectedRoomId = $selectedRoom.id
  selectedConversationId = $selectedRoom.conversationId
}

if (-not $selectedRoom) {
  $report.brainstorm = @{ ok = $false; message = "No room found for brainstorm smoke" }
  $report | ConvertTo-Json -Depth 30
  exit 1
}

$start = Invoke-JsonApi -Method "POST" -Url "$BaseUrl/api/brainstorm/start" -Headers $headers -Body @{
  conversation_id = [string]$selectedRoom.conversationId
  topic = "Smoke brainstorm $runTag"
  duration_sec = 60
  settings = @{
    agents_talk_to_each_other = $true
    summarize_at_end = $true
    create_tasks = $true
    allow_actions = $false
  }
}

$sessionId = ""
if ($start.ok -and $start.body.session.id) {
  $sessionId = [string]$start.body.session.id
}

$report.brainstormStart = @{
  ok = $start.ok
  status = $start.status
  sessionId = $sessionId
  message = $start.body.message
}

if ($sessionId) {
  Start-Sleep -Seconds 4

  $extend = Invoke-JsonApi -Method "POST" -Url "$BaseUrl/api/brainstorm/extend" -Headers $headers -Body @{
    session_id = $sessionId
    extend_sec = 60
  }

  $report.brainstormExtend = @{
    ok = $extend.ok
    status = $extend.status
    durationSec = $extend.body.session.duration_sec
    message = $extend.body.message
  }

  Start-Sleep -Seconds 4

  $session = Invoke-JsonApi -Method "GET" -Url "$BaseUrl/api/brainstorm/session?session_id=$sessionId" -Headers $headers
  $report.brainstormSession = @{
    ok = $session.ok
    status = $session.status
    state = $session.body.session.status
    summaryMessageId = $session.body.session.summary_message_id
  }

  $extract = Invoke-JsonApi -Method "POST" -Url "$BaseUrl/api/chatrooms/$($selectedRoom.id)/extract-tasks" -Headers $headers -Body @{}
  $decisionCount = 0
  if ($extract.body -and $extract.body.decisions) {
    $decisionCount = @($extract.body.decisions).Count
  }

  $report.decisionsIngestion = @{
    ok = $extract.ok
    status = $extract.status
    decisionsCount = $decisionCount
    message = $extract.body.message
  }

  $stop = Invoke-JsonApi -Method "POST" -Url "$BaseUrl/api/brainstorm/stop" -Headers $headers -Body @{
    session_id = $sessionId
  }

  $report.brainstormStop = @{
    ok = $stop.ok
    status = $stop.status
    state = $stop.body.session.status
    message = $stop.body.message
  }
}

try { Remove-Item $csvPath -Force -ErrorAction SilentlyContinue } catch {}

$report | ConvertTo-Json -Depth 30
