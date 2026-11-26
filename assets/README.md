# DuaSaku App Assets

Place the following files in this directory before building APK/AAB:

## Required
| File | Size | Purpose |
|------|------|---------|
| `icon.png` | 1024×1024 | App store icon (Play Store, Expo) |
| `adaptive-icon.png` | 1024×1024 | Android adaptive icon foreground (transparent bg) |
| `splash.png` | 1284×2772 | Launch screen |

## Optional
| File | Size | Purpose |
|------|------|---------|
| `favicon.png` | 48×48 | Web manifest favicon |

## Android Adaptive Icon Notes
- `adaptive-icon.png` must have **transparent background**
- Safe zone: 660×660 center (kept visible on all mask shapes)
- Background color in `app.json`: `#FAF6F0` (cream)

## Quick Generate (if you have ImageMagick)
```bash
# From a source logo (logo.png)
convert logo.png -resize 1024x1024 assets/icon.png
convert logo.png -resize 1024x1024 -background none -gravity center -extent 1024x1024 assets/adaptive-icon.png
convert logo.png -resize 1284x2772! assets/splash.png
```

## Or use Expo's asset generator
```bash
npx expo install expo-asset
npx expo-asset --input ./logo.png --output ./assets --platform all
```