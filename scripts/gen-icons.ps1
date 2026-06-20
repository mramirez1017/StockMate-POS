Add-Type -AssemblyName System.Drawing

$root = "D:\Programming Files\StockMate-POS"
$assets = Join-Path $root "assets"
$master = Join-Path $assets "icon-master.png"
$fg     = Join-Path $assets "icon-foreground.png"
$web    = Join-Path $root "web\public"
$res    = Join-Path $root "android\app\src\main\res"

function Load-Image($path) {
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  return [System.Drawing.Image]::FromStream($ms)
}

function CropResize($img, $dst, $size, [bool]$round) {
  $side = [Math]::Min($img.Width, $img.Height)
  $sx = [int](($img.Width - $side) / 2)
  $sy = [int](($img.Height - $side) / 2)
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if ($round) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $size, $size)
    $g.SetClip($path)
  }
  $srcRect = New-Object System.Drawing.Rectangle($sx, $sy, $side, $side)
  $dstRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  wrote $dst ($size)"
}

$msrc = Load-Image $master
$fsrc = Load-Image $fg

Write-Host "Web favicons / logos..."
$webTargets = @{
  "favicon-16.png" = 16; "favicon-32.png" = 32; "favicon-48.png" = 48; "favicon-64.png" = 64
  "favicon-128.png" = 128; "favicon-192.png" = 192; "favicon-512.png" = 512
  "favicon.png" = 256; "sidebar-icon.png" = 128; "app-logo.png" = 512
}
foreach ($k in $webTargets.Keys) { CropResize $msrc (Join-Path $web $k) $webTargets[$k] $false }

Write-Host "Android launcher (square + round)..."
$densSquare = @{ "mipmap-mdpi" = 48; "mipmap-hdpi" = 72; "mipmap-xhdpi" = 96; "mipmap-xxhdpi" = 144; "mipmap-xxxhdpi" = 192 }
foreach ($d in $densSquare.Keys) {
  $sz = $densSquare[$d]
  CropResize $msrc (Join-Path $res "$d\ic_launcher.png") $sz $false
  CropResize $msrc (Join-Path $res "$d\ic_launcher_round.png") $sz $true
}

Write-Host "Android adaptive foreground..."
$densFg = @{ "mipmap-mdpi" = 108; "mipmap-hdpi" = 162; "mipmap-xhdpi" = 216; "mipmap-xxhdpi" = 324; "mipmap-xxxhdpi" = 432 }
foreach ($d in $densFg.Keys) { CropResize $fsrc (Join-Path $res "$d\ic_launcher_foreground.png") $densFg[$d] $false }

$msrc.Dispose(); $fsrc.Dispose()
Write-Host "DONE"
