# Composes the official Google Meet icon with a red REC pip in the corner.
# Run: powershell -ExecutionPolicy Bypass -File compose-meet.ps1
Add-Type -AssemblyName System.Drawing

$src = Join-Path $env:TEMP 'mar-meet-icons\meet_512.png'
if (-not (Test-Path $src)) {
    Write-Error "Source not found at $src"
    exit 1
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcImg = [System.Drawing.Image]::FromFile($src)

foreach ($size in 16, 48, 128) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Draw the Meet logo, filling the canvas (with a tiny inset so the pip overlays cleanly)
    $g.DrawImage($srcImg, 0, 0, $size, $size)

    # Red REC pip in bottom-right corner — proportional, with a thin white halo for readability
    $pipR = [Math]::Round($size * 0.22)
    $pipCx = $size - $pipR - [Math]::Round($size * 0.04)
    $pipCy = $size - $pipR - [Math]::Round($size * 0.04)

    $haloW = [Math]::Max(1, [Math]::Round($size * 0.04))
    $haloPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $haloW)
    $g.DrawEllipse($haloPen, ($pipCx - $pipR), ($pipCy - $pipR), ($pipR * 2), ($pipR * 2))

    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(217, 48, 37))
    $g.FillEllipse($brush, ($pipCx - $pipR), ($pipCy - $pipR), ($pipR * 2), ($pipR * 2))

    $brush.Dispose()
    $haloPen.Dispose()
    $g.Dispose()

    $out = Join-Path $here "icon$size.png"
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Wrote $out"
}

$srcImg.Dispose()
