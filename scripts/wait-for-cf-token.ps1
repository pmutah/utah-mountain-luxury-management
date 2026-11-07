$tokenFile = Join-Path $env:TEMP 'cf-token-paste.txt'
$deadline = (Get-Date).AddMinutes(10)
Write-Host "Waiting for token file: $tokenFile"
Write-Host "Create token in Cloudflare, copy it, save as one line in that file."

while ((Get-Date) -lt $deadline) {
  if (Test-Path $tokenFile) {
    $token = (Get-Content $tokenFile -Raw).Trim()
    if ($token.Length -gt 30 -and $token.Length -lt 120 -and $token -notmatch '\s') {
      gh secret set CLOUDFLARE_API_TOKEN --repo pmutah/utah-mountain-luxury-management --body $token | Out-Null
      gh secret set CLOUDFLARE_ACCOUNT_ID --repo pmutah/utah-mountain-luxury-management --body '513c82ca37c8d7e83926801120de3eee' | Out-Null
      Remove-Item $tokenFile -Force
      gh workflow run Deploy --repo pmutah/utah-mountain-luxury-management | Out-Null
      Write-Host 'GITHUB_SECRET_UPDATED=1'
      exit 0
    }
  }
  Start-Sleep -Seconds 2
}

Write-Host 'TIMEOUT=1'
exit 1
