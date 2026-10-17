$ErrorActionPreference = "Stop"
$taskBackendRoot = Split-Path -Parent $PSScriptRoot
$taskPythonExecutable = Join-Path $taskBackendRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $taskPythonExecutable)) {
    throw "Run scripts\setup.ps1 first."
}

Push-Location -LiteralPath $taskBackendRoot
try {
    & $taskPythonExecutable -m ruff check src tests scripts
    if ($LASTEXITCODE -ne 0) { throw "Code lint failed." }
    & $taskPythonExecutable -m ruff format --check src tests scripts
    if ($LASTEXITCODE -ne 0) { throw "Code format check failed." }
    # Use a new project-owned directory rather than a shared pytest temp folder.
    $taskTestTemp = Join-Path $taskBackendRoot (".tools\pytest-" + [guid]::NewGuid().ToString("N"))
    if (Test-Path -LiteralPath $taskTestTemp) { throw "Expected a new test directory." }
    & $taskPythonExecutable -m pytest -p no:cacheprovider --basetemp $taskTestTemp
    if ($LASTEXITCODE -ne 0) { throw "Tests failed." }
} finally {
    Pop-Location
}
