# Registers this checkout with Cursor Remote Machine (My Machines).
# Same personal worker the phone already uses for Performance Motors DMS
# (worker name dms-pc on DESKTOP-1EAS993). This one is named uml-pc.
#
# Run on that Windows PC, from a clone of this repo:
#   powershell -ExecutionPolicy Bypass -File scripts\start-remote-machine.ps1
#
# Leaves the DMS workers running. Uses its own data directory so it does not
# take the data-dir lock those workers already hold.
# Requires the Cursor CLI signed in as the same account (`agent login`).

param(
  [string]$Name = "uml-pc"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host $Message
}

if ($env:OS -ne "Windows_NT") {
  Write-Error "Run this on the Windows PC that already shows dms-pc in the phone Remote Machine list (DESKTOP-1EAS993)."
  exit 1
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$origin = ""
try {
  $origin = (& git -C $repoRoot remote get-url origin 2>$null)
} catch {
  $origin = ""
}
if ($origin -notmatch "utah-mountain-luxury-management") {
  Write-Error "This folder's origin is not utah-mountain-luxury-management. Run the script from that clone."
  exit 1
}

function Find-AgentCli {
  $names = @("agent.exe", "agent.cmd", "agent.ps1", "cursor-agent.exe")
  $cmd = Get-Command agent -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    return $cmd.Source
  }
  $roots = @(
    (Join-Path $env:LOCALAPPDATA "cursor-agent"),
    (Join-Path $env:USERPROFILE ".local\bin"),
    (Join-Path $env:USERPROFILE ".cursor\bin")
  )
  foreach ($root in $roots) {
    foreach ($name in $names) {
      $candidate = Join-Path $root $name
      if (Test-Path $candidate) {
        return $candidate
      }
    }
  }
  return $null
}

$agentCli = Find-AgentCli
if (-not $agentCli) {
  Write-Error "The Cursor CLI is not installed for this Windows user. Install it from https://cursor.com/install and run this script again."
  exit 1
}

$status = & $agentCli status 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $status -match "Not logged in" -or $status -match "Authentication required") {
  Write-Error "The Cursor CLI on this PC is not signed in. Run 'agent login' with the same Cursor account that owns dms-pc, then run this script again."
  exit 1
}

$dataDir = Join-Path $env:LOCALAPPDATA "cursor-agent\workers\$Name"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

function Get-UmlWorkerProcess {
  Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and
    $_.Name -notmatch "^(powershell|pwsh)(\.exe)?$" -and
    $_.CommandLine -match "worker" -and
    $_.CommandLine -match "--name" -and
    $_.CommandLine -match [regex]::Escape($Name)
  }
}

$workerArgs = "worker --name `"$Name`" --worker-dir `"$repoRoot`" --data-dir `"$dataDir`" --idle-release-timeout 0 start"
$stdoutLog = Join-Path $dataDir "worker.out.log"
$stderrLog = Join-Path $dataDir "worker.err.log"

function Start-UmlWorkerProcess {
  if ($agentCli -match "\.ps1$") {
    $hostExe = (Get-Command powershell.exe).Source
    $hostArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$agentCli`" $workerArgs"
    Start-Process -FilePath $hostExe -ArgumentList $hostArgs -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog | Out-Null
    return
  }
  Start-Process -FilePath $agentCli -ArgumentList $workerArgs -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog | Out-Null
}

$gitBash = @(
  (Join-Path $env:ProgramFiles "Git\bin\bash.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Git\bin\bash.exe")
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $gitBash) {
  Write-Error "This worker needs Git for Windows, including Git Bash. Install it from https://git-scm.com/download/win and run this script again."
  exit 1
}

$taskName = "Cursor Remote Machine $Name"
$taskReady = $false
$windowsUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

function Register-UmlLogonTask {
  if ($agentCli -match "\.ps1$") {
    $execute = (Get-Command powershell.exe).Source
    $taskArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$agentCli`" $workerArgs"
  } else {
    $execute = $agentCli
    $taskArgs = $workerArgs
  }
  $action = New-ScheduledTaskAction -Execute $execute -Argument $taskArgs -WorkingDirectory $repoRoot
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $windowsUser
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 10 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
  $principal = New-ScheduledTaskPrincipal -UserId $windowsUser -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
}

$running = @(Get-UmlWorkerProcess)
if ($running.Count -eq 0) {
  try {
    Register-UmlLogonTask
    $taskReady = $true
    Write-Step "Logon task '$taskName' is registered for $windowsUser."
  } catch {
    Write-Step "Could not register the logon task ($($_.Exception.Message)). Starting the worker for this session only."
  }

  if ($taskReady) {
    try {
      Start-ScheduledTask -TaskName $taskName
    } catch {
      Write-Step "Could not start the logon task ($($_.Exception.Message)). Starting the worker directly."
      Start-UmlWorkerProcess
    }
  } else {
    Start-UmlWorkerProcess
  }

  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    $running = @(Get-UmlWorkerProcess)
    if ($running.Count -gt 0) { break }
    Start-Sleep -Seconds 2
  }
} else {
  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $existingTask) {
    try {
      Register-UmlLogonTask
      Write-Step "Logon task '$taskName' is registered for $windowsUser."
    } catch {
      Write-Step "Worker is already running. Could not register the logon task ($($_.Exception.Message))."
    }
  }
}

if ($running.Count -eq 0) {
  $errTail = ""
  if (Test-Path $stderrLog) {
    $errTail = (Get-Content $stderrLog -Tail 20 | Out-String).Trim()
  }
  if (-not $errTail -and (Test-Path $stdoutLog)) {
    $errTail = (Get-Content $stdoutLog -Tail 20 | Out-String).Trim()
  }
  if ($errTail) {
    Write-Step $errTail
  }
  if ($taskReady) {
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
    if ($taskInfo) {
      Write-Step "Scheduled task last result: $($taskInfo.LastTaskResult)"
    }
  }
  Write-Error "$Name did not stay running. Logs: $stdoutLog and $stderrLog"
  exit 1
}

Write-Step "Remote Machine worker '$Name' is running for this checkout."
Write-Step "On the phone: Cursor, Remote Machine, then $Name. It is the same list as dms-pc."
Write-Step "The DMS workers were left running."
exit 0
