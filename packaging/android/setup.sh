#!/bin/sh
# Genera il progetto Android TV / Google TV (Capacitor) a partire da ../../www
# Requisiti: Node 18+, JDK 17, Android SDK (Android Studio). NON è stato possibile provarlo qui: vedi README.
set -e
cd "$(dirname "$0")/../.."
./build.sh
rm -rf android-tv && mkdir android-tv && cd android-tv
npm init -y >/dev/null
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/app @capacitor/keyboard
cp ../packaging/android/capacitor.config.json .
rm -rf www && cp -r ../www www
npx cap add android
python3 - <<'PY'
import re,io
p='android/app/src/main/AndroidManifest.xml'
s=open(p,encoding='utf-8').read()
# 1) TV: niente touchscreen obbligatorio + leanback
if 'android.software.leanback' not in s:
    s=s.replace('<application','<uses-feature android:name="android.software.leanback" android:required="false" />\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n    <application',1)
# 2) icona nel launcher dei dispositivi TV
s=s.replace('<category android:name="android.intent.category.LAUNCHER" />','<category android:name="android.intent.category.LAUNCHER" />\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />',1)
# 3) HTTP in chiaro (server IPTV/NAS locali)
if 'usesCleartextTraffic' not in s:
    s=s.replace('<application','<application android:usesCleartextTraffic="true" android:banner="@mipmap/ic_launcher"',1)
open(p,'w',encoding='utf-8').write(s)
print('AndroidManifest.xml aggiornato')
PY
npx cap sync android
echo
echo "Fatto. Apri android-tv/android in Android Studio, oppure:"
echo "  cd android-tv/android && ./gradlew assembleDebug"
echo "  adb connect <IP-TV>:5555 && adb install -r app/build/outputs/apk/debug/app-debug.apk"
echo
echo "Amazon Fire TV (Fire OS, Android-based: Stick 4K/4K Max/4K Plus, Cube, Stick Lite/HD, TV Omni/4-Series):"
echo "  Impostazioni > Il mio Fire TV > Opzioni sviluppatore > Debug ADB = ON + Installa app sconosciute = ON, poi gli stessi comandi adb di sopra"
echo "  oppure copia l'APK su un server/cloud e scaricalo con l'app Downloader. NON funziona su Vega OS (Fire TV Stick 4K Select, Stick HD 2026)."
