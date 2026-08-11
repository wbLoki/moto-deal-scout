# Uploads Worker secrets from local .env via `wrangler versions secret put`.
# Non-secret vars live in wrangler.jsonc. Never commit .env.
#
# Usage:
#   npm run cf:secrets              # production Worker (motosnipe)
#   npm run cf:secrets -- --preview # preview Worker (motosnipe-preview)

$ErrorActionPreference = 'Stop'

$preview = $args -contains '--preview'
# With multiple envs in wrangler.jsonc, production must target the top-level env
# with an explicit empty --env= (PowerShell drops a bare empty arg).
$wranglerEnvFlag = if ($preview) { '--env=preview' } else { '--env=' }

$envFile = Join-Path (Join-Path $PSScriptRoot '..') '.env'
if (-not (Test-Path $envFile)) {
  Write-Error "Missing .env at $envFile"
}

$values = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq '' -or $line.StartsWith('#')) { return }
  $eq = $line.IndexOf('=')
  if ($eq -lt 1) { return }
  $key = $line.Substring(0, $eq).Trim()
  $val = $line.Substring($eq + 1).Trim()
  if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
    $val = $val.Substring(1, $val.Length - 2)
  }
  $values[$key] = $val
}

# Secrets only — never put these in wrangler.jsonc vars.
$secretKeys = @(
  'DATABASE_URL',
  'DATABASE_AUTH_TOKEN',
  'AUTH_SECRET',
  'GEMINI_API_KEY',
  'RESEND_API_KEY',
  'DISCORD_WEBHOOK_URL',
  'GITHUB_DISPATCH_TOKEN',
  'CRON_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
  'AUTH_GITHUB_ID',
  'AUTH_GITHUB_SECRET',
  'ANTHROPIC_API_KEY'
)

$target = if ($preview) { 'preview' } else { 'production' }
Write-Host "Uploading secrets to $target Worker (versions secret put)..."

foreach ($key in $secretKeys) {
  if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
    Write-Host "  skip $key (not set in .env)"
    continue
  }
  Write-Host "  put $key"
  $values[$key] | npx --yes wrangler versions secret put $key $wranglerEnvFlag
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to put $key"
  }
}

Write-Host "Done. Deploy (or promote the version) so the Worker picks up these secrets."
