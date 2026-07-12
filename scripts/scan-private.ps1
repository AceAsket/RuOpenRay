$ErrorActionPreference = 'Stop'

$checks = @(
  [pscustomobject]@{
    Name = 'private service hostname'
    Pattern = '(?i)acespace\.tech'
    ValueGroup = ''
    Allow = ''
  },
  [pscustomobject]@{
    Name = 'proxy share link'
    Pattern = '(?i)\b(?:vless|vmess|trojan|ss)://(?<value>[^\s"''<>]+)'
    ValueGroup = 'value'
    Allow = '(?i)^\.\.\.$|@(?:[a-z0-9-]+\.)*example(?:\.(?:com|net|org))?(?::\d+)?(?:[/?#]|$)|@localhost(?::\d+)?(?:[/?#]|$)|@127\.0\.0\.1(?::\d+)?(?:[/?#]|$)'
  },
  [pscustomobject]@{
    Name = 'AmneziaWG private key'
    Pattern = '(?im)^\s*PrivateKey\s*=\s*(?<value>[A-Za-z0-9+/]{40,}={0,2})\s*$'
    ValueGroup = 'value'
    Allow = ''
  },
  [pscustomobject]@{
    Name = 'AmneziaWG preshared key'
    Pattern = '(?im)^\s*PresharedKey\s*=\s*(?<value>[A-Za-z0-9+/]{40,}={0,2})\s*$'
    ValueGroup = 'value'
    Allow = ''
  },
  [pscustomobject]@{
    Name = 'private tunnel endpoint'
    Pattern = '(?im)^\s*Endpoint\s*=\s*(?<value>[A-Za-z0-9.-]+:\d+)\s*$'
    ValueGroup = 'value'
    Allow = '(?i)^(?:[a-z0-9-]+\.)*example(?:\.(?:com|net|org))?:\d+$|^localhost:\d+$|^127\.0\.0\.1:\d+$'
  }
)

$files = @()
$files += (& git ls-files)
$files += (& git ls-files --others --exclude-standard)
$files = $files |
  Where-Object { $_ -and (Test-Path $_) -and -not (Get-Item $_).PSIsContainer } |
  Where-Object { $_ -ne 'scripts/scan-private.ps1' } |
  Sort-Object -Unique

$hits = @()
foreach ($file in $files) {
  $text = Get-Content -Raw -ErrorAction SilentlyContinue -Path $file
  if ($null -eq $text) { continue }
  foreach ($check in $checks) {
    foreach ($match in [regex]::Matches($text, $check.Pattern)) {
      $value = if ($check.ValueGroup) { $match.Groups[$check.ValueGroup].Value } else { $match.Value }
      if ($check.Allow -and $value -match $check.Allow) { continue }
      $hits += [pscustomobject]@{ file = $file; check = $check.Name }
    }
  }
}

if ($hits.Count) {
  $hits | Format-Table -AutoSize
  Write-Error "Private server material found in files that Git can see. Move it to .private/, .tmp-xray-tests/, data/, or another ignored path."
  exit 1
}

Write-Host "No private server material found in Git-visible files." -ForegroundColor Green
