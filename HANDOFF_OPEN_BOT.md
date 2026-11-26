# DuaSaku APK Build — Handoff Guide for Open Bot

**Project**: `/home/deck/workspace/duasaku`
**Goal**: Build production APK/AAB via EAS + auto-deploy to Play Store on tag push

---

## Prerequisites (sudah done)

- ✅ `eas.json` — preview (APK) + production (AAB) profiles
- ✅ `app.json` — versionCode, adaptiveIcon, permissions, expo-build-properties
- ✅ `.github/workflows/build-apk.yml` — EAS-based CI/CD
- ✅ `.env.production` — template (di .gitignore)
- ✅ `assets/README.md` — icon requirements

---

## Steps for Open Bot (1 → 5)

### STEP 1: EAS Login & Token

**Commands**:
```bash
cd /home/deck/workspace/duasaku
export PATH="/home/deck/.local/share/ai.openclaw.linux/browser-runtime/2026.11.4/tools/node-v24.22.1/lib/node_modules/eas-cli/bin:$PATH"

# Login (interactive - buka browser)
eas login

# Create token (copy output untuk GitHub secret)
eas token:create
```

**Expected Output**:
```
Logged in as @your-username
Token: EXPO_TOKEN_VALUE_HERE
```

**Save**: `EXPO_TOKEN` → GitHub Secrets (Settings → Secrets → Actions → New repository secret)

**Links**:
- Login: https://expo.dev/login
- Token docs: https://docs.expo.dev/accounts/programmatic-access/

---

### STEP 2: Android Credentials (Keystore)

**Commands**:
```bash
# Interactive - pilih opsi:
eas credentials --platform android
```

**Menu Selection**:
```
? What would you like to do? › Keystore
? Keystore not configured. › Create new
? Keystore alias: › duasaku-key
? Keystore password: › [strong password - SAVE THIS]
? Key password: › [same or different - SAVE THIS]
```

**Links**:
- Credentials UI: https://expo.dev/accounts/[username]/projects/duasaku/credentials
- Docs: https://docs.expo.dev/app-signing/local-credentials/

**Output**: Keystore stored in EAS cloud (no local .jks needed)

---

### STEP 3: GitHub Secrets

**Go to**: https://github.com/[owner]/duasaku/settings/secrets/actions

**Add Secrets**:

| Name | Value | Source |
|------|-------|--------|
| `EXPO_TOKEN` | `EXPO_TOKEN_VALUE_HERE` | Step 1 output |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | `[JSON content]` | Step 4 output |

**Commands** (via gh CLI):
```bash
gh secret set EXPO_TOKEN --body "EXPO_TOKEN_VALUE_HERE" --repo [owner]/duasaku
gh secret set GOOGLE_SERVICE_ACCOUNT_KEY --body "$(cat google-play-key.json)" --repo [owner]/duasaku
```

---

### STEP 4: Google Play Service Account

**Steps**:
1. Open: https://play.google.com/console
2. Select app → **Setup** → **API access**
3. **Create service account** → Google Cloud Console
4. **Grant role**: "Release Manager"
5. **Create key** → JSON → **Download**
6. Save as `google-play-key.json` (root project, **di .gitignore**)

**Commands**:
```bash
# Verify JSON valid
cat google-play-key.json | jq .

# Add to GitHub secret (see Step 3)
```

**Links**:
- Play Console: https://play.google.com/console
- Service account guide: https://developers.google.com/android-publisher/getting_started

---

### STEP 5: Expo Owner + Icon Assets + Push Tag

#### 5a. Update `app.json` Owner
```bash
# Edit app.json - replace "your-expo-username"
sed -i 's/"your-expo-username"/"YOUR_ACTUAL_EXPO_USERNAME"/' app.json
```
**Get username**: https://expo.dev/accounts/[username]

#### 5b. Add Icon Assets to `assets/`
**Required files**:
| File | Size | Notes |
|------|------|-------|
| `icon.png` | 1024×1024 | App store icon |
| `adaptive-icon.png` | 1024×1024 | Transparent bg, safe zone 660×660 |
| `splash.png` | 1284×2772 | Launch screen |

**Quick generators**:
- https://icon.kitchen
- https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
- https://appicon.co

**Verify**:
```bash
ls -la assets/
# Should show: icon.png adaptive-icon.png splash.png
```

#### 5c. Commit & Push Tag
```bash
cd /home/deck/workspace/duasaku

# Verify all files
git status

# Commit
git add .
git commit -m "chore: configure EAS build + CI/CD for APK/AAB"

# Tag & push (triggers production build + submit)
git tag v1.0.0
git push origin main --tags
```

---

## Verification Checklist

After push tag, monitor:
- **GitHub Actions**: https://github.com/[owner]/duasaku/actions
- **EAS Build**: https://expo.dev/accounts/[username]/projects/duasaku/builds
- **Play Console**: https://play.google.com/console → App → Testing → Internal testing

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `eas: command not found` | `export PATH="/home/deck/.local/share/ai.openclaw.linux/browser-runtime/2026.11.4/tools/node-v24.22.1/lib/node_modules/eas-cli/bin:$PATH"` |
| Build fails: missing assets | Add `assets/icon.png`, `adaptive-icon.png`, `splash.png` |
| Build fails: keystore | Re-run `eas credentials --platform android` |
| Submit fails: 403 | Check `GOOGLE_SERVICE_ACCOUNT_KEY` has "Release Manager" role |
| Version conflict | Increment `versionCode` in `app.json` + new tag `v1.0.1` |

---

## File Reference

```
/home/deck/workspace/duasaku/
├── eas.json                    # EAS build profiles
├── app.json                    # Expo config (versionCode, owner, icons)
├── .env.production             # Template (gitignored)
├── .github/workflows/build-apk.yml  # CI/CD
├── assets/
│   ├── README.md               # Icon specs
│   ├── icon.svg                # Placeholder
│   ├── icon.png                # ← ADD THIS
│   ├── adaptive-icon.png       # ← ADD THIS
│   └── splash.png              # ← ADD THIS
├── google-play-key.json        # ← ADD THIS (gitignored)
└── APK_BUILD.md                # Status summary
```

---

## Quick Commands Reference

```bash
# Local preview build
eas build --profile preview --platform android

# Local production build
eas build --profile production --platform android

# Check build status
eas build:list --profile preview --platform android --limit 5

# Submit manually
eas submit --profile production --platform android

# View logs
eas build:view [BUILD_ID]
```

---

**Handoff Complete** — Bot can execute Steps 1-5 sequentially. Each step has commands, links, and expected outputs.