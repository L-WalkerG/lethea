# LETHEA qurasdirici (Windows)
#   irm https://raw.githubusercontent.com/L-WalkerG/lethea/main/install.ps1 | iex
& {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'  # PowerShell 5.1-de progress bar yuklemeni cox yavasladir
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    $repo = 'L-WalkerG/lethea'
    $dir  = Join-Path $env:LOCALAPPDATA 'LETHEA'
    $zip  = Join-Path $env:TEMP ('lethea-' + [guid]::NewGuid() + '.zip')

    try {
        Write-Host ''
        Write-Host '  LETHEA qurasdirilir...' -ForegroundColor Cyan
        Invoke-WebRequest "https://github.com/$repo/releases/latest/download/lethea-windows-x64.zip" -OutFile $zip -UseBasicParsing

        $running = Get-Process lethea -ErrorAction SilentlyContinue
        if ($running) {
            Write-Host '  Isleyen LETHEA baglanir...' -ForegroundColor Yellow
            $running | Stop-Process -Force
            Start-Sleep -Milliseconds 500
        }
        if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
        Expand-Archive $zip -DestinationPath $dir -Force

        # PATH: registry-deki tipi (REG_EXPAND_SZ) qoruyaraq elave et
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
        $raw = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        if (($raw -split ';') -notcontains $dir) {
            $key.SetValue('Path', (($raw.TrimEnd(';'), $dir) -join ';').TrimStart(';'), [Microsoft.Win32.RegistryValueKind]::ExpandString)
        }
        $key.Close()
        # yeni acilan terminallar PATH deyisikliyini gorsun (WM_SETTINGCHANGE)
        [Environment]::SetEnvironmentVariable('LETHEA_INSTALL', '1', 'User')
        [Environment]::SetEnvironmentVariable('LETHEA_INSTALL', $null, 'User')
        if (($env:Path -split ';') -notcontains $dir) { $env:Path = $env:Path.TrimEnd(';') + ';' + $dir }

        $lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'LETHEA.lnk'
        $sc = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
        $sc.TargetPath = Join-Path $dir 'lethea.exe'
        $sc.WorkingDirectory = $env:USERPROFILE
        $sc.Description = 'LETHEA messenger'
        $sc.Save()

        Write-Host '  Hazirdir! Indi yaz: lethea' -ForegroundColor Green
        Write-Host '  (ve ya Start menyusunda LETHEA-ni tap)' -ForegroundColor DarkGray
        Write-Host ''
    } catch {
        Write-Host ('  Xeta: ' + $_.Exception.Message) -ForegroundColor Red
        Write-Host ''
    } finally {
        Remove-Item $zip -ErrorAction SilentlyContinue
    }
}
