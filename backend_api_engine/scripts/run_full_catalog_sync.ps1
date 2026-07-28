param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$LogDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) "sync-logs")
)

$ErrorActionPreference = "Continue"
$pythonExecutable = (Get-Command python -ErrorAction Stop).Source
$snapshotPath = Join-Path $ProjectRoot "data\novel_catalog.snapshot.json.gz"
$novelLog = Join-Path $LogDirectory "novel-full-sync.log"
$keepAliveLog = Join-Path $LogDirectory "manga-keepalive.log"

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null

$env:ENABLED_SOURCES = "hako,truyenfull,metruyenchu,tangthuvien,wikidich,gutendex"
$env:HAKO_BASE_URL = "https://docln.sbs"
$env:TRUYENFULL_BASE_URL = "https://truyenfull.win"
$env:METRUYENCHU_BASE_URL = "https://metruyenchu.org"
$env:TANGTHUVIEN_BASE_URL = "https://truyen.tangthuvien.vn"
$env:WIKIDICH_BASE_URL = "https://wikidich.vn"
$env:SOURCE_OPERATION_TIMEOUT_SECONDS = "20"

"[$(Get-Date -Format o)] Starting full novel metadata and manifest sync" |
  Out-File -FilePath $novelLog -Append -Encoding utf8

& $pythonExecutable (Join-Path $ProjectRoot "scripts\build_novel_catalog_snapshot.py") `
  --sources "hako,truyenfull,metruyenchu,tangthuvien,wikidich" `
  --output $snapshotPath `
  --max-pages-per-source 10000 `
  --max-new-pages-per-source 50 `
  --page-size 20 `
  --delay-ms 1200 `
  --retries 6 `
  --checkpoint-every 1 `
  --detail-concurrency 2 `
  --detail-delay-ms 700 *>> $novelLog
$novelExitCode = $LASTEXITCODE

"[$(Get-Date -Format o)] Multi-source novel sync finished with exit code $novelExitCode" |
  Out-File -FilePath $novelLog -Append -Encoding utf8

"[$(Get-Date -Format o)] Starting full Gutenberg metadata sync" |
  Out-File -FilePath $novelLog -Append -Encoding utf8

& $pythonExecutable (Join-Path $ProjectRoot "scripts\build_novel_catalog_snapshot.py") `
  --sources "gutendex" `
  --output $snapshotPath `
  --max-pages-per-source 10000 `
  --max-new-pages-per-source 50 `
  --page-size 20 `
  --delay-ms 900 `
  --retries 6 `
  --checkpoint-every 1 `
  --catalog-only *>> $novelLog
$gutenbergExitCode = $LASTEXITCODE

"[$(Get-Date -Format o)] Gutenberg sync finished with exit code $gutenbergExitCode" |
  Out-File -FilePath $novelLog -Append -Encoding utf8

"[$(Get-Date -Format o)] Full sync cycle finished (novels=$novelExitCode, gutenberg=$gutenbergExitCode)" |
  Out-File -FilePath $novelLog -Append -Encoding utf8
