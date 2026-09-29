# LETHEA

Şifrələnmiş messenger: terminal və telefon. Mesajlar və fayllar sənin cihazında şifrələnir, hər mesaj imzalanır, server yalnız oxunmaz məlumat görür.

## Quraşdırma

### Telefon (və ya istənilən brauzer)

Heç nə quraşdırmaq lazım deyil: **<https://l-walkerg.github.io/lethea/>**

Dostun sənə dəvət linki göndəribsə, sadəcə linkə toxun.

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

1. Dəvət almısansa: `lethea join L4-…`. Dəvətdəki sətir proqramı həm quraşdırır, həm də səni otağa salır.
2. Özün otaq açmaq üçün: `lethea` yaz, menyudan **Yeni otaq yarat + dəvət** seç və dəvəti dostuna göndər.
3. Çatda `/help` yaz: cavab, reaksiya, 🔒 şəxsi mesaj, fayl, axtarış, yox olan mesajlar və s.

## Yeniləmə

Yeni versiya çıxanda proqram açılışda özü soruşur: **Enter** bas, yenilənsin. Əl ilə yeniləmək üçün: `lethea --update`. Veb versiya həmişə ən sonuncudur.

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
