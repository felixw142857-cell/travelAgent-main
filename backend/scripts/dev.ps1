param(
    [int]$Port = 8001
)

$ErrorActionPreference = "Stop"
$taskBackendRoot = Split-Path -Parent $PSScriptRoot
$taskPythonExecutable = Join-Path $taskBackendRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $taskPythonExecutable)) {
    throw "Run scripts\setup.ps1 first."
}

Push-Location -LiteralPath $taskBackendRoot
try {
    & $taskPythonExecutable -m uvicorn src:app --reload --reload-dir src --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) { throw "Development server exited with an error." }
} finally {
    Pop-Location
}
