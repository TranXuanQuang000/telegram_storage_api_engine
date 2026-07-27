param(
  [int]$Hours = 6,
  [string]$LogDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) "sync-logs")
)

$ErrorActionPreference = "Continue"
$healthUrl = "https://muc-manga-api.onrender.com/healthz"
$keepAliveLog = Join-Path $LogDirectory "manga-keepalive.log"
$iterations = [Math]::Max(1, $Hours * 12)

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null

for ($index = 0; $index -lt $iterations; $index++) {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 90
    "[$(Get-Date -Format o)] HTTP $($response.StatusCode) $($response.Content)" |
      Out-File -FilePath $keepAliveLog -Append -Encoding utf8
  } catch {
    "[$(Get-Date -Format o)] $($_.Exception.Message)" |
      Out-File -FilePath $keepAliveLog -Append -Encoding utf8
  }
  if ($index -lt ($iterations - 1)) {
    Start-Sleep -Seconds 300
  }
}
