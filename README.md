# LETHEA

## Quraşdırma

### Windows

**PowerShell**-i aç (`Win` düyməsini bas, `powershell` yaz, Enter) və bu sətri yapışdır:

```powershell
irm https://raw.githubusercontent.com/L-WalkerG/lethea/main/install.ps1 | iex
```

Bitəndən sonra `lethea` yaz. Proqram Start menyusunda **LETHEA** adı ilə də görünəcək.

### Linux

```bash
curl -fsSL https://raw.githubusercontent.com/L-WalkerG/lethea/main/install.sh | sh
```

Sonra `lethea` yaz.

## İstifadə

1. `lethea` yaz və menyudan **[1] Otağa gir** seç.
2. Dostunla razılaşdığınız otaq şifrəsini yaz. Eyni şifrəni yazanlar eyni otağa düşür.
3. Çatda `/help` yaz, bütün əmrləri görəcəksən: fayl göndərmək, mesajı düzəltmək, kim onlayndır və s.

## Yeniləmə

Quraşdırma əmrini yenidən işlət, ən son versiya yüklənəcək.

## Silmək

Windows:

```powershell
irm https://raw.githubusercontent.com/L-WalkerG/lethea/main/uninstall.ps1 | iex
```

Linux:

```bash
rm -rf ~/.local/share/lethea ~/.local/bin/lethea
```

Ayarların və saxlanmış otaqların `~/.lethea.json` faylında qalır. Onları da silmək istəsən, bu faylı sil.
