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
node ../scripts/shell.js www   # guscio auto-aggiornante
npx cap add android
# Indietro tenuto premuto riconosciuto lato nativo (vedi MainActivity.java)
cp ../packaging/android/MainActivity.java android/app/src/main/java/com/maxenta/app/MainActivity.java
# lettore ExoPlayer (Media3) per il video nativo sotto la WebView
cp ../packaging/android/MaxPlayerPlugin.java android/app/src/main/java/com/maxenta/app/MaxPlayerPlugin.java
python3 - <<'PYG'
p='android/app/build.gradle'
s=open(p).read()
dep='''    def media3 = "1.4.1"
    implementation "androidx.media3:media3-exoplayer:$media3"
    implementation "androidx.media3:media3-exoplayer-hls:$media3"
    implementation "androidx.media3:media3-ui:$media3"
'''
if 'media3-exoplayer' not in s:
    i=s.index('dependencies {')+len('dependencies {')
    s=s[:i]+'\n'+dep+s[i:]
    open(p,'w').write(s)
print('build.gradle: media3 aggiunto')
PYG
# icona e banner MAXENTA (banner 320x180 per il launcher TV; icone launcher dal logo 512x512)
mkdir -p android/app/src/main/res/drawable-xhdpi
cp ../packaging/android/banner-1280x720.png android/app/src/main/res/drawable-xhdpi/banner.png
python3 - <<'PY2'
import os
try:
    from PIL import Image
    L=Image.open('../packaging/vidaa/icon.png').convert('RGBA')
    for d,sz in {'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}.items():
        for n in ('ic_launcher.png','ic_launcher_round.png','ic_launcher_foreground.png'):
            q='android/app/src/main/res/mipmap-'+d
            if os.path.isdir(q): L.resize((sz,sz)).save(q+'/'+n)
except ImportError:
    print('Pillow non installato: icone launcher lasciate di default (pip install pillow)')
PY2
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
    s=s.replace('<application','<application android:usesCleartextTraffic="true" android:banner="@drawable/banner"',1)
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
