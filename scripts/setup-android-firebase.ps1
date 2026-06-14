# Downloads google-services.json for the StockMate POS Android app.
# Requires: Firebase CLI logged in (firebase login)

$ErrorActionPreference = "Stop"
$ProjectId = "stockmate-pos"
$AndroidAppId = "1:552068389096:android:9381626ef6f4b02672515d"
$OutFile = Join-Path $PSScriptRoot "..\android\app\google-services.json"

Write-Host "Downloading Android Firebase config..."
$config = firebase apps:sdkconfig ANDROID $AndroidAppId --project $ProjectId | Out-String
if (-not $config.Trim()) {
    throw "Failed to download Firebase Android SDK config."
}

$config | Set-Content -Path $OutFile -Encoding UTF8
Write-Host "Saved $OutFile"
Write-Host "Rebuild the Android app in Android Studio."
