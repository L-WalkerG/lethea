# LETHEA silici (Windows)
#   irm https://raw.githubusercontent.com/L-WalkerG/lethea/main/uninstall.ps1 | iex
& {
    $dir = Join-Path $env:LOCALAPPDATA 'LETHEA'

    Get-Process lethea -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 300
    Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) 'LETHEA.lnk') -ErrorAction SilentlyContinue

    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    $raw = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $new = (($raw -split ';') | Where-Object { $_ -and $_ -ne $dir }) -join ';'
    if ($new -ne $raw) { $key.SetValue('Path', $new, [Microsoft.Win32.RegistryValueKind]::ExpandString) }
    $key.Close()
    [Environment]::SetEnvironmentVariable('LETHEA_INSTALL', '1', 'User')
    [Environment]::SetEnvironmentVariable('LETHEA_INSTALL', $null, 'User')

    Write-Host ''
    Write-Host '  LETHEA silindi.' -ForegroundColor Green
    Write-Host '  Ayarlar ve saxlanmis otaqlar: %USERPROFILE%\.lethea.json (istesen onu da sil)' -ForegroundColor DarkGray
    Write-Host ''
}
