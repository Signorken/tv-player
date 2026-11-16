package com.maxenta.app;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.UriPermission;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import android.provider.DocumentsContract;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;

/**
 * Funzioni di sistema per MAXENTA su Android:
 *  - versione dell'APK e aggiornamento dall'app (scarica l'APK da GitHub e apre l'installazione di Android);
 *  - chiavette e dischi USB: elenco, autorizzazione (una volta per chiavetta), lettura delle cartelle, avviso quando si collegano/scollegano.
 * Comandato da src/core/android.js.
 */
@CapacitorPlugin(name = "MaxSystem")
public class MaxSystemPlugin extends Plugin {
    private static final String EXT = "com.android.externalstorage.documents";
    private BroadcastReceiver usbRx;
    private volatile boolean downloading = false;

    @Override
    public void load() {
        // chiavetta collegata o tolta: la pagina aggiorna la riga "File di rete"
        usbRx = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) { notifyListeners("usbChange", new JSObject()); }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_MEDIA_MOUNTED); f.addAction(Intent.ACTION_MEDIA_UNMOUNTED);
        f.addAction(Intent.ACTION_MEDIA_REMOVED); f.addAction(Intent.ACTION_MEDIA_EJECT);
        f.addDataScheme("file");
        try {
            if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(usbRx, f, Context.RECEIVER_EXPORTED);
            else getContext().registerReceiver(usbRx, f);
        } catch (Exception e) { }
    }

    @Override protected void handleOnDestroy() { try { getContext().unregisterReceiver(usbRx); } catch (Exception e) { } }

    // ---------------------------------------------------------------- versione e aggiornamento
    @PluginMethod
    public void info(PluginCall call) {
        JSObject o = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            o.put("version", pi.versionName);
        } catch (Exception e) { o.put("version", ""); }
        o.put("sdk", Build.VERSION.SDK_INT);
        o.put("canInstall", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(o);
    }

    /** Scarica l'APK (con avanzamento) e apre la schermata di installazione di Android. */
    @PluginMethod
    public void installApk(PluginCall call) {
        final String url = call.getString("url");
        if (url == null) { call.reject("url mancante"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // una volta sola: permesso "installa app sconosciute" per MAXENTA
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception e) { }
            JSObject o = new JSObject(); o.put("needPermission", true); call.resolve(o); return;
        }
        if (downloading) { call.reject("già in corso"); return; }
        downloading = true;
        new Thread(() -> {
            File out = new File(getContext().getCacheDir(), "maxenta-update.apk");
            try {
                String u = url;
                HttpURLConnection c = null;
                for (int hop = 0; hop < 6; hop++) { // GitHub reindirizza al server dei file
                    c = (HttpURLConnection) new URL(u).openConnection();
                    c.setInstanceFollowRedirects(false); c.setConnectTimeout(15000); c.setReadTimeout(30000);
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) { u = new URL(new URL(u), c.getHeaderField("Location")).toString(); c.disconnect(); continue; }
                    if (code != 200) throw new Exception("HTTP " + code);
                    break;
                }
                long total = c.getContentLength(), got = 0; int last = -1;
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
                    byte[] b = new byte[65536]; int n;
                    while ((n = in.read(b)) > 0) {
                        fo.write(b, 0, n); got += n;
                        int p = total > 0 ? (int) (got * 100 / total) : -1;
                        if (p != last) { last = p; JSObject e = new JSObject(); e.put("p", p); notifyListeners("apkProgress", e); }
                    }
                }
                if (out.length() < 1000000) throw new Exception("file troppo piccolo");
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", out);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                JSObject o = new JSObject(); o.put("started", true); call.resolve(o);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
            } finally { downloading = false; }
        }).start();
    }

    // ---------------------------------------------------------------- chiavette USB
    private static String treeFor(String uuid) { return "content://" + EXT + "/tree/" + Uri.encode(uuid + ":"); }

    private String grantedTree(String uuid) {
        List<UriPermission> ps = getContext().getContentResolver().getPersistedUriPermissions();
        String want = uuid + ":";
        for (UriPermission p : ps) {
            Uri u = p.getUri();
            if (!p.isReadPermission() || !EXT.equals(u.getAuthority())) continue;
            try { if (want.equals(DocumentsContract.getTreeDocumentId(u))) return u.toString(); } catch (Exception e) { }
        }
        return null;
    }

    /** Memorie rimovibili collegate: [{id, name, granted, tree}] */
    @PluginMethod
    public void usbVolumes(PluginCall call) {
        JSArray a = new JSArray();
        if (Build.VERSION.SDK_INT >= 24) {
            StorageManager sm = (StorageManager) getContext().getSystemService(Context.STORAGE_SERVICE);
            for (StorageVolume v : sm.getStorageVolumes()) {
                if (!v.isRemovable() || v.getUuid() == null) continue;
                if (!"mounted".equals(v.getState()) && !"mounted_ro".equals(v.getState())) continue;
                JSObject o = new JSObject();
                o.put("id", v.getUuid());
                o.put("name", v.getDescription(getContext()));
                String g = grantedTree(v.getUuid());
                o.put("granted", g != null);
                if (g != null) o.put("tree", g);
                a.put(o);
            }
        }
        JSObject r = new JSObject(); r.put("volumes", a); call.resolve(r);
    }

    /** Chiede (una volta) il permesso di leggere la chiavetta: si apre la finestra di sistema, basta confermare. */
    @PluginMethod
    public void usbGrant(PluginCall call) {
        String id = call.getString("id");
        Intent i = null;
        if (Build.VERSION.SDK_INT >= 29 && id != null) {
            StorageManager sm = (StorageManager) getContext().getSystemService(Context.STORAGE_SERVICE);
            for (StorageVolume v : sm.getStorageVolumes()) if (id.equals(v.getUuid())) { i = v.createOpenDocumentTreeIntent(); break; }
        }
        if (i == null) {
            i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            if (Build.VERSION.SDK_INT >= 26 && id != null) i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(treeFor(id)));
        }
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try { startActivityForResult(call, i, "grantResult"); }
        catch (Exception e) { call.reject("Selettore di cartelle non disponibile su questo dispositivo"); }
    }

    @ActivityCallback
    private void grantResult(PluginCall call, ActivityResult res) {
        if (call == null) return;
        Intent d = res.getData();
        if (res.getResultCode() != Activity.RESULT_OK || d == null || d.getData() == null) { JSObject o = new JSObject(); o.put("cancelled", true); call.resolve(o); return; }
        Uri tree = d.getData();
        try { getContext().getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception e) { }
        JSObject o = new JSObject(); o.put("tree", tree.toString()); call.resolve(o);
    }

    /** Contenuto di una cartella della chiavetta: {tree, doc} (doc vuoto = cartella principale). */
    @PluginMethod
    public void usbList(PluginCall call) {
        final String treeS = call.getString("tree"), docS = call.getString("doc");
        new Thread(() -> {
            try {
                Uri tree = Uri.parse(treeS);
                String doc = docS != null && docS.length() > 0 ? docS : DocumentsContract.getTreeDocumentId(tree);
                Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, doc);
                JSArray a = new JSArray();
                String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE, DocumentsContract.Document.COLUMN_LAST_MODIFIED };
                try (Cursor c = getContext().getContentResolver().query(kids, cols, null, null, null)) {
                    while (c != null && c.moveToNext()) {
                        JSObject o = new JSObject();
                        String id = c.getString(0);
                        o.put("doc", id);
                        o.put("name", c.getString(1));
                        o.put("dir", DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2)));
                        o.put("mime", c.getString(2));
                        o.put("size", c.isNull(3) ? 0 : c.getLong(3));
                        o.put("mtime", c.isNull(4) ? 0 : c.getLong(4));
                        o.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                        a.put(o);
                    }
                }
                JSObject r = new JSObject(); r.put("items", a); call.resolve(r);
            } catch (Exception e) { call.reject(e.getMessage() == null ? e.toString() : e.getMessage()); }
        }).start();
    }
}
