const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} = require('expo/config-plugins');

const SHORTCUTS = [
  {
    id: 'quick_add_expense',
    shortNameKey: 'shortcut_expense_short',
    shortLabel: '+ Pengeluaran',
    longNameKey: 'shortcut_expense_long',
    longLabel: 'Catat Pengeluaran Baru',
    uri: 'duasaku://quick-add?type=expense',
  },
  {
    id: 'quick_add_income',
    shortNameKey: 'shortcut_income_short',
    shortLabel: '+ Pemasukan',
    longNameKey: 'shortcut_income_long',
    longLabel: 'Catat Pemasukan Baru',
    uri: 'duasaku://quick-add?type=income',
  },
  {
    id: 'quick_add_transfer',
    shortNameKey: 'shortcut_transfer_short',
    shortLabel: 'Transfer',
    longNameKey: 'shortcut_transfer_long',
    longLabel: 'Transfer Antar Dompet',
    uri: 'duasaku://quick-add?type=transfer',
  },
];

function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildShortcutsXml(packageName) {
  const targetPkg = escapeXmlAttr(packageName);
  const targetClass = escapeXmlAttr(`${packageName}.MainActivity`);

  const entries = SHORTCUTS.map(
    (s) => `  <shortcut
    android:shortcutId="${escapeXmlAttr(s.id)}"
    android:enabled="true"
    android:icon="@mipmap/ic_launcher"
    android:shortcutShortLabel="@string/${escapeXmlAttr(s.shortNameKey)}"
    android:shortcutLongLabel="@string/${escapeXmlAttr(s.longNameKey)}">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="${targetPkg}"
      android:targetClass="${targetClass}"
      android:data="${escapeXmlAttr(s.uri)}" />
  </shortcut>`
  ).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${entries}
</shortcuts>
`;
}

function withShortcutStrings(config) {
  return withStringsXml(config, (cfg) => {
    const items = [];
    for (const s of SHORTCUTS) {
      items.push({ $: { name: s.shortNameKey }, _: s.shortLabel });
      items.push({ $: { name: s.longNameKey }, _: s.longLabel });
    }
    cfg.modResults = AndroidConfig.Strings.setStringItem(items, cfg.modResults);
    return cfg;
  });
}

function withShortcutXmlFile(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const packageName = cfg.android?.package || 'com.duasaku.couplefinance';
      const resDir = await AndroidConfig.Paths.getResourceFolderAsync(
        cfg.modRequest.projectRoot
      );
      const xmlDir = path.join(resDir, 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      const shortcutsPath = path.join(xmlDir, 'shortcuts.xml');
      fs.writeFileSync(shortcutsPath, buildShortcutsXml(packageName), 'utf8');
      return cfg;
    },
  ]);
}

function withShortcutManifestMetaData(config) {
  return withAndroidManifest(config, (cfg) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const existingMetaData = Array.isArray(mainActivity['meta-data'])
      ? mainActivity['meta-data']
      : [];

    const shortcutMetaData = {
      $: {
        'android:name': 'android.app.shortcuts',
        'android:resource': '@xml/shortcuts',
      },
    };

    const idx = existingMetaData.findIndex(
      (item) => item?.$?.['android:name'] === 'android.app.shortcuts'
    );
    if (idx >= 0) {
      existingMetaData[idx] = shortcutMetaData;
    } else {
      existingMetaData.push(shortcutMetaData);
    }
    mainActivity['meta-data'] = existingMetaData;

    return cfg;
  });
}

module.exports = function withAppShortcuts(config) {
  let updated = withShortcutStrings(config);
  updated = withShortcutXmlFile(updated);
  updated = withShortcutManifestMetaData(updated);
  return updated;
};
