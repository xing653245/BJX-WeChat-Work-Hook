$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$candidates = [System.Collections.Generic.List[string]]::new()
function Add-Candidate($value) {
  if (-not $value) { return }
  $value = [Environment]::ExpandEnvironmentVariables([string]$value).Trim().Trim('"')
  if ($value -match '^"?(.+?\.exe)"?(?:,\d+)?$') { $value = $Matches[1] }
  if ([IO.Path]::GetExtension($value) -ieq '.exe') { $candidates.Add($value) }
  else {
    $candidates.Add((Join-Path $value 'WXWork.exe'))
    if (Test-Path -LiteralPath $value -PathType Container) {
      Get-ChildItem -LiteralPath $value -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $candidates.Add((Join-Path $_.FullName 'WXWork.exe'))
      }
    }
  }
}
Get-CimInstance Win32_Process -Filter "Name = 'WXWork.exe'" -ErrorAction SilentlyContinue | ForEach-Object { Add-Candidate $_.ExecutablePath }
foreach ($base in @('HKCU:\Software', 'HKLM:\Software', 'HKLM:\Software\WOW6432Node')) {
  foreach ($key in @('Tencent\WXWork', 'Tencent\WeWork', 'Microsoft\Windows\CurrentVersion\App Paths\WXWork.exe')) {
    $item = Get-ItemProperty -LiteralPath "$base\$key" -ErrorAction SilentlyContinue
    if ($item) { foreach ($field in @('InstallPath','InstallLocation','Path','(default)')) { Add-Candidate $item.$field } }
  }
  Get-ItemProperty -Path "$base\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -match '\u4f01\u4e1a\u5fae\u4fe1|WeCom|WXWork|WeWork' } |
    ForEach-Object { Add-Candidate $_.InstallLocation; Add-Candidate $_.DisplayIcon }
}
foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
  if ($base) { Add-Candidate (Join-Path $base 'Tencent\WXWork'); Add-Candidate (Join-Path $base 'WXWork') }
}
Add-Candidate $env:VWORK_CURRENT_HOST
$rows = @($candidates | Select-Object -Unique | ForEach-Object {
  if ((Split-Path $_ -Leaf) -ieq 'WXWork.exe' -and (Test-Path -LiteralPath $_ -PathType Leaf)) {
    $file = Get-Item -LiteralPath $_
    $v = $file.VersionInfo
    [PSCustomObject]@{ path = $file.FullName; version = "$($v.FileMajorPart).$($v.FileMinorPart).$($v.FileBuildPart).$($v.FilePrivatePart)" }
  }
})
ConvertTo-Json -InputObject $rows -Compress
