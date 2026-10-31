<#
  Update-Aurora.ps1 - replaces VRCX (or an older Aurora) with the newest Aurora and keeps all your data.

  What it does, in order:
    1. Finds the Aurora installer (given path, next to this script, in Downloads, or downloads the latest build with the GitHub CLI).
    2. Closes VRCX / Aurora if they are running.
    3. Backs up your data folder (%APPDATA%\VRCX) to Documents\Aurora-backups.
    4. Runs the installer silently. It removes the old app files and installs Aurora. Your data folder is not touched.
    5. Checks that your data is still there and that Aurora is installed.

  Use:  right-click > Run with PowerShell   (or double-click Update-Aurora.bat)
        Update-Aurora.ps1 -Installer "C:\path\Aurora_Setup_x64.exe"
        Update-Aurora.ps1 -NoBackup
#>
param(
    [string]$Installer = '',
    [switch]$NoBackup
)

$ErrorActionPreference = 'Stop'
$Repo = 'kx2158/aurora'
$DataDir = Join-Path $env:APPDATA 'VRCX'

# ask for admin rights (the installer writes to Program Files)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($Installer) { $argList += " -Installer `"$Installer`"" }
    if ($NoBackup) { $argList += ' -NoBackup' }
    Start-Process powershell -Verb RunAs -ArgumentList $argList
    exit
}

function Step($text) { Write-Host "`n== $text" -ForegroundColor Magenta }

try {
    Step 'Looking for the Aurora installer'
    $name = 'Aurora_Setup_x64.exe'
    $candidates = @()
    if ($Installer) { $candidates += $Installer }
    $candidates += (Join-Path $PSScriptRoot $name)
    $downloads = Join-Path $env:USERPROFILE 'Downloads'
    $candidates += (Join-Path $downloads $name)
    $candidates += (Join-Path $downloads "Aurora-Setup\$name")
    $found = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

    if (-not $found -and (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Host 'Not found locally, trying the GitHub CLI...'
        $runId = gh run list -R $Repo --workflow aurora-windows.yml --status success --limit 1 --json databaseId -q '.[0].databaseId'
        if ($runId) {
            $tmp = Join-Path $env:TEMP 'aurora-download'
            if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
            gh run download $runId -R $Repo -n Aurora-Setup -D $tmp
            $found = Get-ChildItem $tmp -Recurse -Filter $name | Select-Object -First 1 -ExpandProperty FullName
        }
    }
    if (-not $found) {
        throw "Could not find $name. Download 'Aurora-Setup' from the Actions tab of github.com/$Repo, unzip it into your Downloads folder and run this again (or pass -Installer <path>)."
    }
    Write-Host "Using: $found"

    Step 'Closing VRCX / Aurora'
    foreach ($proc in 'VRCX', 'Aurora') {
        Get-Process -Name $proc -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host "Closing $($_.ProcessName) ($($_.Id))"
            $_ | Stop-Process -Force
        }
    }
    Start-Sleep -Seconds 2

    $before = 0
    if (Test-Path $DataDir) {
        $before = (Get-ChildItem $DataDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
    }

    if (-not $NoBackup -and (Test-Path $DataDir)) {
        Step 'Backing up your data'
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backup = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "Aurora-backups\VRCX-data-$stamp"
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        robocopy $DataDir $backup /E /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "Backup failed (robocopy code $LASTEXITCODE). Nothing was changed." }
        Write-Host "Backup saved to $backup"
    }

    Step 'Installing Aurora (this replaces the old app, your data stays)'
    $p = Start-Process -FilePath $found -ArgumentList '/S' -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "The installer exited with code $($p.ExitCode)." }

    Step 'Checking the result'
    $installDir = (Get-ItemProperty 'HKLM:\Software\VRCX' -ErrorAction SilentlyContinue).InstallDir
    if (-not $installDir) { $installDir = Join-Path $env:ProgramFiles 'VRCX' }
    $exe = Join-Path $installDir 'VRCX.exe'
    if (-not (Test-Path $exe)) { throw "Aurora's program file was not found at $exe." }
    $after = 0
    if (Test-Path $DataDir) {
        $after = (Get-ChildItem $DataDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
    }
    Write-Host "Installed at: $installDir"
    Write-Host "Data files before: $before, after: $after"
    if ($after -lt $before) { Write-Host 'Warning: fewer data files than before. Restore from the backup folder if something is missing.' -ForegroundColor Yellow }

    Write-Host "`nDone. Aurora is installed and your data was kept." -ForegroundColor Green
    if (-not (Get-Process -Name 'VRCX' -ErrorAction SilentlyContinue)) {
        Start-Process $exe
    }
}
catch {
    Write-Host "`nFailed: $($_.Exception.Message)" -ForegroundColor Red
}
Read-Host "`nPress Enter to close"
