# DuaSaku APK Build Status

Updated: 2026-11-26

## ✅ Completed
- `eas.json` created (preview APK + production AAB)
- `app.json` updated (versionCode, adaptiveIcon, permissions, runtimeVersion)
- `expo-build-properties` installed
- `assets/` directory created with README

## ❌ Still Needed (User Action)
1. **Assets** — `assets/icon.png`, `adaptive-icon.png`, `splash.png` (1024×1024 etc.)
2. **Keystore** — `eas credentials --platform android` to generate + store
3. **Expo account** — `eas login` (owner in app.json: replace `your-expo-username`)
4. **Google Services** — `google-services.json` (optional, for FCM/push)
5. **Play Store key** — `google-play-key.json` for `eas submit` (production)

## Build Commands
```bash
cd /home/deck/workspace/duasaku

# Preview APK (internal testing)
eas build --profile preview --platform android

# Production AAB (Play Store)
eas build --profile production --platform android

# Submit to Play Store
eas submit --profile production --platform android
```

## EAS Profiles
| Profile | Type | Use |
|---------|------|-----|
| development | APK | Dev build |
| preview | APK | Internal testing |
| production | AAB | Play Store |

## References
- `eas.json` — build/submit config
- `app.json` — Expo config (versionCode, plugins, permissions)
- `assets/README.md` — icon requirements