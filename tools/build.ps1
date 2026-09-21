# =============================================================================
#  Hang2048 - packaging helper for slow / restricted networks (China mirror).
#
#    npm run dist:cn
#
#  It does four things:
#    1. Redirects npm / Electron / electron-builder caches into .cache/
#    2. Points Electron + electron-builder binary downloads at npmmirror
#    3. Generates build/icon.ico from icon.png if missing
#    4. Pre-extracts winCodeSign by hand, because that archive contains macOS
#       symlinks and 7-Zip cannot create them without admin / developer mode,
#       which aborts the whole build.
#
#  NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI
#        unless the file has a UTF-8 BOM, so non-ASCII text here breaks parsing.
# =============================================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:npm_config_cache = Join-Path $root '.cache\npm'
$env:ELECTRON_CACHE = Join-Path $root '.cache\electron'
$env:ELECTRON_BUILDER_CACHE = Join-Path $root '.cache\electron-builder'

$env:ELECTRON_MIRROR = 'https://cdn.npmmirror.com/binaries/electron/'
$env:npm_config_electron_mirror = $env:ELECTRON_MIRROR
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://cdn.npmmirror.com/binaries/electron-builder-binaries/'
$env:npm_config_electron_builder_binaries_mirror = $env:ELECTRON_BUILDER_BINARIES_MIRROR
$env:ELECTRON_DISABLE_SECURITY_WARNINGS = '1'

New-Item -ItemType Directory -Force -Path $env:npm_config_cache, $env:ELECTRON_CACHE, $env:ELECTRON_BUILDER_CACHE | Out-Null

# --- download through Node's TLS stack (system schannel may be unavailable) --
#     retries, because the CDN occasionally drops a connection
function Get-WithNode([string]$Url, [string]$OutFile) {
  $script = @'
const fs = require('fs');
(async () => {
  const res = await fetch(process.argv[1], { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(process.argv[2], buf);
  console.log('  ' + (buf.length / 1048576).toFixed(1) + ' MB');
})().catch(e => {
  console.error(e.message + (e.cause ? ' / ' + (e.cause.message || e.cause.code) : ''));
  process.exit(1);
});
'@
  $tmp = Join-Path $env:TEMP ("fetch-" + [guid]::NewGuid().ToString('N') + ".cjs")
  Set-Content -Path $tmp -Value $script -Encoding Ascii
  try {
    for ($attempt = 1; $attempt -le 4; $attempt++) {
      node $tmp $Url $OutFile
      if ($LASTEXITCODE -eq 0) { return }
      Write-Warning "download attempt $attempt failed; retrying ..."
      Start-Sleep -Seconds (2 * $attempt)
    }
    throw "download failed after 4 attempts: $Url"
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

# --- winCodeSign: get it into the project cache, extracting by hand ----------
#     (the darwin symlinks cannot be created without SeCreateSymbolicLinkPrivilege;
#      7-Zip then returns exit code 2 and electron-builder treats it as failure)
$sevenZip = Join-Path $root 'node_modules\7zip-bin\win\x64\7za.exe'
$wcCache = Join-Path $env:ELECTRON_BUILDER_CACHE 'winCodeSign'
$wcTarget = Join-Path $wcCache 'winCodeSign-2.6.0'
$wcMarker = Join-Path $wcTarget 'rcedit-x64.exe'
$binariesMirror = $env:ELECTRON_BUILDER_BINARIES_MIRROR.TrimEnd('/')

if (-not (Test-Path $wcMarker)) {
  # 1) reuse the machine-wide electron-builder cache when it exists (offline, instant)
  $sysWc = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign\winCodeSign-2.6.0'

  if (Test-Path (Join-Path $sysWc 'rcedit-x64.exe')) {
    Write-Host 'Seeding winCodeSign from the machine-wide electron-builder cache ...'
    # 必须先清空目标目录：Copy-Item -Recurse 在目标已存在时会再嵌一层子目录
    Remove-Item $wcTarget -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $wcTarget | Out-Null
    Copy-Item (Join-Path $sysWc '*') $wcTarget -Recurse -Force
  } elseif (-not (Test-Path $sevenZip)) {
    Write-Warning '7za.exe not found; skipping winCodeSign pre-extract (run npm install first)'
  } else {
    Write-Host 'Downloading winCodeSign ...'
    New-Item -ItemType Directory -Force -Path $wcCache, $wcTarget | Out-Null
    $archive = Join-Path $wcCache 'winCodeSign-2.6.0.7z'
    if (-not (Test-Path $archive)) {
      Get-WithNode "$binariesMirror/winCodeSign-2.6.0/winCodeSign-2.6.0.7z" $archive
    }
    Write-Host 'Extracting winCodeSign (symlink errors are expected and ignored) ...'
    # exit code 2 == some sub-items failed (the darwin symlinks); the files we
    # need on Windows are extracted fine, so this is expected.
    & $sevenZip x -bd -y "-o$wcTarget" $archive | Out-Null
    if (-not (Test-Path $wcMarker)) { throw 'winCodeSign extraction failed' }
  }
}

# --- icon --------------------------------------------------------------------
if (-not (Test-Path (Join-Path $root 'build\icon.ico'))) {
  Write-Host 'Generating build/icon.ico ...'
  & (Join-Path $root 'node_modules\electron\dist\electron.exe') (Join-Path $root 'tools\make-icon.cjs') | Out-Null
}

# --- build -------------------------------------------------------------------
Write-Host 'Building ...'
& node (Join-Path $root 'node_modules\electron-builder\cli.js') --win
exit $LASTEXITCODE
