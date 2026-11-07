# Creates a long-lived Cloudflare API token for wilhite-portfolio GitHub Actions deploys.
# Requires Global API Key + account email (one-time; not stored in repo).

param(
  [string]$Email = "pmutah@gmail.com",
  [string]$GlobalApiKey = $env:CLOUDFLARE_GLOBAL_API_KEY,
  [string]$AccountId = "513c82ca37c8d7e83926801120de3eee",
  [string]$UserId = "f3392f3352f2380bc14d47baf2d9001d",
  [string]$TokenName = "wilhite-portfolio-github-actions",
  [string]$GitHubRepo = "pmutah/utah-mountain-luxury-management"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type -AssemblyName System.Windows.Forms

if (-not $GlobalApiKey) {
  [void][System.Windows.Forms.MessageBox]::Show(
    "Click OK, then paste your Cloudflare Global API Key in the next dialog.`n`nGet it from:`nhttps://dash.cloudflare.com/profile/api-tokens`n(scroll to Global API Key → View)",
    "Cloudflare permanent token setup",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  )
  $GlobalApiKey = [Microsoft.VisualBasic.Interaction]::InputBox(
    "Paste Global API Key (shown once in Cloudflare dashboard):",
    "Cloudflare Global API Key",
    ""
  ).Trim()
}

if (-not $GlobalApiKey) {
  Write-Error "Global API Key is required."
}

$headers = @{
  "X-Auth-Email" = $Email
  "X-Auth-Key"   = $GlobalApiKey
  "Content-Type" = "application/json"
}

$body = @{
  name = $TokenName
  policies = @(
    @{
      effect = "allow"
      resources = @{
        "com.cloudflare.api.account.$AccountId" = "*"
      }
      permission_groups = @(
        @{ id = "8d28297797f24fb8a0c332fe0866ec89" } # Pages Write
        @{ id = "f7f0eda5697f475c90846e879bab8666" } # Workers KV Storage Write
        @{ id = "e086da7e2179491d91ee5f35b3ca210a" } # Workers Scripts Write
      )
    }
    @{
      effect = "allow"
      resources = @{
        "com.cloudflare.api.user.$UserId" = "*"
      }
      permission_groups = @(
        @{ id = "3518d0f75557482e952c6762d3e64903" } # Memberships Read
      )
    }
  )
} | ConvertTo-Json -Depth 8

Write-Host "Creating Cloudflare API token '$TokenName'..."
$response = Invoke-RestMethod `
  -Uri "https://api.cloudflare.com/client/v4/user/tokens" `
  -Method POST `
  -Headers $headers `
  -Body $body

if (-not $response.success) {
  $response.errors | ConvertTo-Json -Depth 5 | Write-Error
}

$token = $response.result.value
if (-not $token) {
  Write-Error "Token creation succeeded but no token value was returned."
}

Write-Host "Token created (id: $($response.result.id)). Updating GitHub secret..."
gh secret set CLOUDFLARE_API_TOKEN --repo $GitHubRepo --body $token | Out-Null
gh secret set CLOUDFLARE_ACCOUNT_ID --repo $GitHubRepo --body $AccountId | Out-Null

Write-Host "Verifying token with wrangler whoami..."
$env:CLOUDFLARE_API_TOKEN = $token
Set-Location "$PSScriptRoot\..\web"
npx wrangler whoami 2>&1 | Out-Host

Write-Host "Triggering GitHub Deploy workflow..."
gh workflow run Deploy --repo $GitHubRepo | Out-Null
Write-Host "Done. Check: https://github.com/$GitHubRepo/actions"
