#Requires -Version 5.1
<#
.SYNOPSIS
  Cree les raccourcis Fourrures Boreales.

.DESCRIPTION
  Par defaut : raccourcis LOCAUX d'essai (127.0.0.1).
  Raccourcis Lucie public : UNIQUEMENT si -Public ET URLs publiques repondent OK.
  Ne stocke aucun mot de passe.
#>
param(
  [switch]$Public,
  [string]$PublicBoutiqueUrl = "",
  [string]$PublicInventaireUrl = "",
  [string]$DesktopPath = [Environment]::GetFolderPath("Desktop")
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$Logo = Join-Path $Root "assets\logo-fourrures-boreales.png"
$IconDir = Join-Path $Root "inventory\admin\raccourcis"
$LocalBoutique = Join-Path $Root "docs\index.html"
$LocalInventaireUrl = "http://127.0.0.1:8791/"
$GateFile = Join-Path $IconDir "PUBLIC_SHORTCUTS_ENABLED.flag"

New-Item -ItemType Directory -Force -Path $IconDir | Out-Null

function Test-PublicUrl([string]$Url) {
  if ([string]::IsNullOrWhiteSpace($Url)) { return $false }
  if ($Url -notmatch '^https://') { return $false }
  try {
    $resp = Invoke-WebRequest -Uri $Url -Method Head -TimeoutSec 8 -UseBasicParsing
    return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400)
  } catch {
    return $false
  }
}

function New-GreenPlusIcon {
  $outPng = Join-Path $IconDir "ajouter-stock-icon.png"
  Add-Type -AssemblyName System.Drawing
  $base = $null
  if (Test-Path $Logo) {
    $base = [System.Drawing.Image]::FromFile($Logo)
  } else {
    $base = New-Object System.Drawing.Bitmap 256, 256
  }
  $bmp = New-Object System.Drawing.Bitmap 256, 256
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.DrawImage($base, 0, 0, 256, 220)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 34, 139, 74))
  $g.FillRectangle($brush, 78, 210, 100, 28)
  $g.FillRectangle($brush, 114, 174, 28, 100)
  $bmp.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $base.Dispose()
  $brush.Dispose()
  return $outPng
}

function New-Shortcut([string]$Name, [string]$Target, [string]$Args, [string]$Icon, [string]$Dir) {
  $w = New-Object -ComObject WScript.Shell
  $path = Join-Path $Dir "$Name.lnk"
  $sc = $w.CreateShortcut($path)
  $sc.TargetPath = $Target
  if ($Args) { $sc.Arguments = $Args }
  $sc.WorkingDirectory = (Split-Path $Target -Parent)
  if ($Icon -and (Test-Path $Icon)) { $sc.IconLocation = "$Icon,0" }
  $sc.Description = $Name
  $sc.Save()
  return $path
}

Write-Host ""
Write-Host "=== Raccourcis Fourrures Boreales ==="

if ($Public) {
  Write-Host "Mode PUBLIC demande..."
  if (-not $PublicBoutiqueUrl -or -not $PublicInventaireUrl) {
    Write-Host "ERREUR : -PublicBoutiqueUrl et -PublicInventaireUrl sont obligatoires."
    Write-Host "Raccourcis Lucie publics NON crees tant que le domaine n'est pas pret."
    exit 2
  }
  $okB = Test-PublicUrl $PublicBoutiqueUrl
  $okI = Test-PublicUrl $PublicInventaireUrl
  if (-not $okB -or -not $okI) {
    Write-Host "REFUS : les adresses publiques ne repondent pas correctement."
    Write-Host "  Boutique OK : $okB ($PublicBoutiqueUrl)"
    Write-Host "  Inventaire OK : $okI ($PublicInventaireUrl)"
    Write-Host "Aucun raccourci public cree. Utilisez le mode local pour les essais."
    exit 3
  }
  "enabled $(Get-Date -Format o)" | Set-Content -Path $GateFile -Encoding UTF8
  $plusIcon = New-GreenPlusIcon
  $outDir = Join-Path $DesktopPath "Fourrures Boreales - Lucie"
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  New-Shortcut "Les Fourrures Boreales" "C:\Windows\explorer.exe" $PublicBoutiqueUrl $Logo $outDir | Out-Null
  New-Shortcut "Ajouter du stock" "C:\Windows\explorer.exe" $PublicInventaireUrl $plusIcon $outDir | Out-Null
  Write-Host "Raccourcis PUBLICS crees dans : $outDir"
  exit 0
}

Write-Host "Mode LOCAL (essais sur ce PC uniquement)."
Write-Host "Les raccourcis Lucie/production restent desactives tant que le domaine public n'est pas fonctionnel."
$plusIcon = New-GreenPlusIcon
$outDir = Join-Path $DesktopPath "Fourrures Boreales - ESSAI LOCAL"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if (Test-Path $LocalBoutique) {
  New-Shortcut "Les Fourrures Boreales (local)" $LocalBoutique "" $Logo $outDir | Out-Null
} else {
  Write-Host "Avertissement : docs\index.html introuvable."
}

$Demarrer = Join-Path $Root "inventory\admin\demarrer-inventaire.bat"
$InventaireLauncher = Join-Path $IconDir "ouvrir-inventaire-local.bat"
@(
  "@echo off",
  "cd /d `"$Root`"",
  "start `"`" `"$Demarrer`"",
  "timeout /t 2 /nobreak >nul",
  "start `"`" `"$LocalInventaireUrl`""
) | Set-Content -Path $InventaireLauncher -Encoding ASCII

New-Shortcut "Ajouter du stock (local)" $InventaireLauncher "" $plusIcon $outDir | Out-Null

Write-Host "Raccourcis LOCAUX crees dans : $outDir"
Write-Host "  1) Les Fourrures Boreales (local)"
Write-Host "  2) Ajouter du stock (local) - icone logo + vert"
Write-Host ""
Write-Host "Avant Ajouter du stock : configurez le mot de passe temporaire si besoin."
Write-Host ""
