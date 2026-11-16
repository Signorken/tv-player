package com.maxenta.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

// Indietro tenuto premuto (~0,8 s) = "chiudi" (player / finestrella).
// Android non passa alla pagina la durata della pressione: la si misura qui e si avvisa l'app con un evento.
// Una pressione breve resta il normale tasto Indietro.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MaxPlayerPlugin.class); // lettore ExoPlayer (video sotto la pagina)
        super.onCreate(savedInstanceState);
        // la dimensione del testo la decide l'app (Aspetto > Dimensione testo): ignora lo zoom dei caratteri di sistema,
        // che ingrandiva le scritte senza ingrandire i riquadri (testi dei tasti fuori dai tondi)
        try { getBridge().getWebView().getSettings().setTextZoom(100); } catch (Exception e) { }
    }

    private final Handler h = new Handler(Looper.getMainLooper());
    private KeyEvent down = null;
    private boolean longDone = false;
    private final Runnable longPress = new Runnable() {
        @Override public void run() {
            longDone = true;
            try {
                getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('maxenta-longback'))", null);
            } catch (Exception e) { /* WebView non pronta */ }
        }
    };

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_DOWN) {
                if (e.getRepeatCount() == 0) { down = e; longDone = false; h.postDelayed(longPress, 800); }
                return true;
            }
            if (e.getAction() == KeyEvent.ACTION_UP) {
                h.removeCallbacks(longPress);
                boolean wasLong = longDone; longDone = false;
                KeyEvent d = down; down = null;
                if (wasLong) return true;
                if (d != null) super.dispatchKeyEvent(d);
                return super.dispatchKeyEvent(e);
            }
        }
        return super.dispatchKeyEvent(e);
    }
}
