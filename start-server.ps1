$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  exit 0
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
Start-Process `
  -FilePath $node `
  -ArgumentList "dev-server.js" `
  -WorkingDirectory $appRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $appRoot "server.stdout.log") `
  -RedirectStandardError (Join-Path $appRoot "server.stderr.log")
