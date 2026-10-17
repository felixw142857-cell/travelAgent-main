param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$taskBackendRoot = Split-Path -Parent $PSScriptRoot
$taskPreviousTemp = $env:TEMP
$taskPreviousTmp = $env:TMP
$taskUvTemp = Join-Path ([System.IO.Path]::GetTempPath()) ("travel-agent-uv-" + [guid]::NewGuid().ToString("N"))
Push-Location -LiteralPath $taskBackendRoot
try {
    $taskUvCommand = Get-Command uv -ErrorAction SilentlyContinue
    if ($taskUvCommand) {
        $taskUvExecutable = $taskUvCommand.Source
    } elseif (Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath("UserProfile")) ".local\bin\uv.exe")) {
        # The current terminal may not yet see PATH changes from a new UV install.
        $taskUvExecutable = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".local\bin\uv.exe"
    } else {
        $taskUvExecutable = Join-Path $taskBackendRoot ".tools\uv.exe"
        if (-not (Test-Path -LiteralPath $taskUvExecutable)) {
            & $Python (Join-Path $PSScriptRoot "bootstrap_uv.py")
            if ($LASTEXITCODE -ne 0) { throw "UV bootstrap failed." }
        }
    }

    if (-not (Test-Path -LiteralPath ".env")) {
        Copy-Item -LiteralPath ".env.example" -Destination ".env"
    }

    # A fresh temporary cache avoids the Windows project-cache rename restriction.
    New-Item -ItemType Directory -Path $taskUvTemp | Out-Null
    $env:TEMP = $taskUvTemp
    $env:TMP = $taskUvTemp
    $taskSyncArguments = @("sync", "--dev", "--no-cache", "--link-mode", "copy", "--python", $Python, "--no-python-downloads")
    if (Test-Path -LiteralPath "uv.lock") { $taskSyncArguments += "--locked" }
    & $taskUvExecutable @taskSyncArguments
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }
    Write-Output "Backend environment is ready. Run scripts\dev.ps1 to start."
} finally {
    $env:TEMP = $taskPreviousTemp
    $env:TMP = $taskPreviousTmp
    if ((Test-Path -LiteralPath $taskUvTemp) -and -not (Get-ChildItem -LiteralPath $taskUvTemp -Force | Select-Object -First 1)) {
        Remove-Item -LiteralPath $taskUvTemp
    }
    Pop-Location
}
