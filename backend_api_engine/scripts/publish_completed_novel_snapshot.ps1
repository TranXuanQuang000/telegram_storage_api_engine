param(
  [Parameter(Mandatory = $true)]
  [int]$WorkerProcessId,
  [int]$RetryPasses = 4,
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Continue"
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $ProjectRoot "..")).Path
$pythonExecutable = (Get-Command python -ErrorAction Stop).Source
$builder = Join-Path $ProjectRoot "scripts\build_novel_catalog_snapshot.py"
$validator = Join-Path $ProjectRoot "scripts\check_novel_snapshot_complete.py"
$snapshot = Join-Path $ProjectRoot "data\novel_catalog.snapshot.json.gz"
$logDirectory = Join-Path $ProjectRoot "sync-logs"
$logFile = Join-Path $logDirectory "novel-publish.log"

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
Wait-Process -Id $WorkerProcessId -ErrorAction SilentlyContinue

$env:ENABLED_SOURCES = "hako,truyenfull,metruyenchu,tangthuvien,wikidich,gutendex"
$env:HAKO_BASE_URL = "https://docln.sbs"
$env:TRUYENFULL_BASE_URL = "https://truyenfull.live"
$env:METRUYENCHU_BASE_URL = "https://metruyenchu.com.vn"
$env:TANGTHUVIEN_BASE_URL = "https://truyen.tangthuvien.vn"
$env:WIKIDICH_BASE_URL = "https://wikidich.vn"
$env:SOURCE_OPERATION_TIMEOUT_SECONDS = "20"

for ($pass = 1; $pass -le $RetryPasses; $pass++) {
  "[$(Get-Date -Format o)] Hydration retry pass $pass" |
    Out-File -FilePath $logFile -Append -Encoding utf8
  & $pythonExecutable $builder `
    --sources "hako,truyenfull,metruyenchu,tangthuvien,wikidich" `
    --output $snapshot `
    --max-pages-per-source 10000 `
    --page-size 20 `
    --delay-ms 1500 `
    --retries 6 `
    --checkpoint-every 1 `
    --detail-concurrency 2 `
    --detail-delay-ms 900 *>> $logFile

  & $pythonExecutable $builder `
    --sources "gutendex" `
    --output $snapshot `
    --max-pages-per-source 10000 `
    --page-size 20 `
    --delay-ms 1000 `
    --retries 6 `
    --checkpoint-every 1 `
    --catalog-only *>> $logFile

  & $pythonExecutable $validator $snapshot *>> $logFile
  if ($LASTEXITCODE -eq 0) {
    git -C $repositoryRoot add -- "backend_api_engine/data/novel_catalog.snapshot.json.gz"
    git -C $repositoryRoot commit -m "data: publish completed novel catalog snapshot"
    if ($LASTEXITCODE -ne 0) {
      "[$(Get-Date -Format o)] Snapshot was ready but commit failed" |
        Out-File -FilePath $logFile -Append -Encoding utf8
      exit 3
    }
    git -C $repositoryRoot push origin ui/nova-motion
    exit $LASTEXITCODE
  }

  if ($pass -lt $RetryPasses) {
    Start-Sleep -Seconds ([Math]::Min(1800, 300 * $pass))
  }
}

"[$(Get-Date -Format o)] Snapshot still has incomplete or failed records" |
  Out-File -FilePath $logFile -Append -Encoding utf8
exit 2
