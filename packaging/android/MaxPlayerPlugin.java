package com.maxenta.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.Display;
import android.view.WindowManager;
import android.view.Gravity;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.common.text.CueGroup;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DecoderCounters;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.SubtitleView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lettore ExoPlayer per MAXENTA.
 * Il video è disegnato in una SurfaceView messa SOTTO la WebView (resa trasparente): l'hardware compone il video
 * direttamente, senza passare dalla GPU della pagina. L'interfaccia web resta sopra (informazioni, pannelli, finestrella).
 * Comandato da src/ui/native/exo.js; lo stato viene letto dalla pagina con status() più volte al secondo.
 */
@CapacitorPlugin(name = "MaxPlayer")
public class MaxPlayerPlugin extends Plugin {
    private ExoPlayer player;
    private FrameLayout box;
    private AspectRatioFrameLayout ratio;
    private SubtitleView subs;
    private String lastError = null;
    private boolean matchRate = true;   // adatta la frequenza dello schermo al video (25/50 fps -> 50 Hz)
    private int origMode = 0;           // modo dello schermo prima del cambio, da ripristinare
    private float lastFps = 0;

    private void ui(Runnable r) { getActivity().runOnUiThread(r); }

    private void ensure(String ua) {
        if (player != null) return;
        WebView wv = getBridge().getWebView();
        wv.setBackgroundColor(Color.TRANSPARENT);
        ViewGroup parent = (ViewGroup) wv.getParent();
        box = new FrameLayout(getContext());
        box.setBackgroundColor(Color.BLACK);
        ratio = new AspectRatioFrameLayout(getContext());
        ratio.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        SurfaceView sv = new SurfaceView(getContext());
        ratio.addView(sv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        box.addView(ratio, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        subs = new SubtitleView(getContext());
        box.addView(subs, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        parent.addView(box, 0, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000).setReadTimeoutMs(20000)
            .setUserAgent(ua != null && ua.length() > 0 ? ua : "MAXENTA");
        player = new ExoPlayer.Builder(getContext(),
                new DefaultRenderersFactory(getContext()).setEnableDecoderFallback(true))
            .setMediaSourceFactory(new DefaultMediaSourceFactory(getContext()).setDataSourceFactory(http))
            .build();
        player.setVideoSurfaceView(sv);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException e) { lastError = e.getErrorCodeName(); }
            @Override public void onVideoSizeChanged(VideoSize vs) {
                if (vs.height > 0) ratio.setAspectRatio(vs.width * vs.pixelWidthHeightRatio / vs.height);
            }
            @Override public void onCues(CueGroup cg) { subs.setCues(cg.cues); }
            @Override public void onTracksChanged(Tracks tracks) {
                for (Tracks.Group g : tracks.getGroups()) {
                    if (g.getType() != C.TRACK_TYPE_VIDEO) continue;
                    for (int i = 0; i < g.length; i++) if (g.isTrackSelected(i)) { applyRate(g.getTrackFormat(i).frameRate); return; }
                }
            }
        });
    }

    /** Sceglie, tra i modi dello schermo con la stessa risoluzione, quello la cui frequenza è un multiplo esatto dei fotogrammi del video. */
    private void applyRate(float fps) {
        if (!matchRate || fps <= 0 || Build.VERSION.SDK_INT < 23) return;
        if (Math.abs(fps - lastFps) < 0.01f) return;
        lastFps = fps;
        try {
            Activity a = getActivity();
            Display d = a.getWindowManager().getDefaultDisplay();
            Display.Mode cur = d.getMode(), best = null;
            for (Display.Mode m : d.getSupportedModes()) {
                if (m.getPhysicalWidth() != cur.getPhysicalWidth() || m.getPhysicalHeight() != cur.getPhysicalHeight()) continue;
                float hz = m.getRefreshRate(), k = hz / fps;
                if (hz < 47f || Math.abs(k - Math.round(k)) > 0.01f) continue;
                if (best == null || hz < best.getRefreshRate()) best = m; // 25 fps -> 50 Hz (non 100), 24 -> 48 o 72, 30 -> 60
            }
            if (best == null) return;
            if (best.getModeId() == cur.getModeId()) return;
            if (origMode == 0) origMode = cur.getModeId();
            WindowManager.LayoutParams lp = a.getWindow().getAttributes();
            lp.preferredDisplayModeId = best.getModeId();
            a.getWindow().setAttributes(lp);
        } catch (Exception e) { }
    }
    private void restoreRate() {
        lastFps = 0;
        if (origMode == 0 || Build.VERSION.SDK_INT < 23) return;
        try {
            WindowManager.LayoutParams lp = getActivity().getWindow().getAttributes();
            lp.preferredDisplayModeId = 0; // torna alla scelta del sistema
            getActivity().getWindow().setAttributes(lp);
        } catch (Exception e) { }
        origMode = 0;
    }

    @PluginMethod
    public void load(PluginCall call) {
        final String url = call.getString("url");
        final String ua = call.getString("ua");
        matchRate = call.getBoolean("matchRate", true);
        ui(() -> {
            try {
                ensure(ua);
                lastError = null;
                MediaItem.Builder b = new MediaItem.Builder().setUri(url);
                String u = url == null ? "" : url.toLowerCase();
                if (u.contains(".m3u8") || u.contains("m3u8")) b.setMimeType(MimeTypes.APPLICATION_M3U8);
                player.setMediaItem(b.build());
                player.prepare();
                player.setPlayWhenReady(true);
                box.setVisibility(View.VISIBLE);
                call.resolve();
            } catch (Exception e) { call.reject(e.toString()); }
        });
    }

    @PluginMethod public void play(PluginCall call) { ui(() -> { if (player != null) player.play(); call.resolve(); }); }
    @PluginMethod public void pause(PluginCall call) { ui(() -> { if (player != null) player.pause(); call.resolve(); }); }

    @PluginMethod
    public void seek(PluginCall call) {
        final long ms = call.getLong("ms", 0L);
        ui(() -> { if (player != null) player.seekTo(ms); call.resolve(); });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        ui(() -> {
            if (player != null) { player.stop(); player.clearMediaItems(); subs.setCues(java.util.Collections.emptyList()); }
            if (box != null) box.setVisibility(View.GONE);
            restoreRate();
            call.resolve();
        });
    }

    /** Posizione del video in pixel fisici: schermo intero oppure riquadro della finestrella. */
    @PluginMethod
    public void rect(PluginCall call) {
        final boolean full = call.getBoolean("full", true);
        final int x = call.getInt("x", 0), y = call.getInt("y", 0), w = call.getInt("w", 0), h = call.getInt("h", 0);
        ui(() -> {
            if (box == null) { call.resolve(); return; }
            ViewGroup.LayoutParams lp = box.getLayoutParams();
            if (full || w <= 0 || h <= 0) {
                lp.width = ViewGroup.LayoutParams.MATCH_PARENT; lp.height = ViewGroup.LayoutParams.MATCH_PARENT;
                box.setTranslationX(0); box.setTranslationY(0);
            } else {
                lp.width = w; lp.height = h; box.setTranslationX(x); box.setTranslationY(y);
            }
            box.setLayoutParams(lp);
            call.resolve();
        });
    }

    @PluginMethod
    public void fit(PluginCall call) {
        final String m = call.getString("mode", "contain");
        ui(() -> {
            if (ratio != null) ratio.setResizeMode("cover".equals(m) ? AspectRatioFrameLayout.RESIZE_MODE_ZOOM : AspectRatioFrameLayout.RESIZE_MODE_FIT);
            call.resolve();
        });
    }

    @PluginMethod
    public void status(PluginCall call) {
        ui(() -> {
            JSObject o = new JSObject();
            if (player == null) { o.put("state", "idle"); call.resolve(o); return; }
            int st = player.getPlaybackState();
            o.put("pos", player.getCurrentPosition());
            long d = player.getDuration();
            o.put("dur", d == C.TIME_UNSET ? -1 : d);
            o.put("live", player.isCurrentMediaItemLive());
            o.put("playing", player.isPlaying());
            o.put("state", st == Player.STATE_BUFFERING ? "buffering" : st == Player.STATE_READY ? "ready" : st == Player.STATE_ENDED ? "ended" : "idle");
            VideoSize vs = player.getVideoSize();
            o.put("w", vs.width); o.put("h", vs.height);
            DecoderCounters dc = player.getVideoDecoderCounters();
            if (dc != null) { o.put("dropped", dc.droppedBufferCount); o.put("total", dc.renderedOutputBufferCount + dc.droppedBufferCount); }
            if (lastError != null) o.put("error", lastError);
            call.resolve(o);
        });
    }

    @PluginMethod
    public void tracks(PluginCall call) {
        ui(() -> {
            JSObject o = new JSObject();
            JSArray audio = new JSArray(), text = new JSArray();
            if (player != null) {
                java.util.List<Tracks.Group> groups = player.getCurrentTracks().getGroups();
                for (int g = 0; g < groups.size(); g++) {
                    Tracks.Group grp = groups.get(g);
                    int type = grp.getType();
                    if (type != C.TRACK_TYPE_AUDIO && type != C.TRACK_TYPE_TEXT) continue;
                    for (int t = 0; t < grp.length; t++) {
                        if (!grp.isTrackSupported(t)) continue;
                        Format f = grp.getTrackFormat(t);
                        JSObject x = new JSObject();
                        x.put("g", g); x.put("t", t);
                        x.put("lang", f.language == null ? "" : f.language);
                        x.put("label", f.label == null ? "" : f.label);
                        x.put("codec", f.sampleMimeType == null ? "" : f.sampleMimeType.replace("audio/", "").replace("text/", ""));
                        x.put("ch", f.channelCount == Format.NO_VALUE ? 0 : f.channelCount);
                        x.put("on", grp.isTrackSelected(t));
                        if (type == C.TRACK_TYPE_AUDIO) audio.put(x); else text.put(x);
                    }
                }
            }
            o.put("audio", audio); o.put("text", text);
            call.resolve(o);
        });
    }

    @PluginMethod
    public void select(PluginCall call) {
        final String type = call.getString("type", "audio");
        final int g = call.getInt("g", -1), t = call.getInt("t", -1);
        ui(() -> {
            if (player == null) { call.resolve(); return; }
            int tt = "text".equals(type) ? C.TRACK_TYPE_TEXT : C.TRACK_TYPE_AUDIO;
            TrackSelectionParameters.Builder b = player.getTrackSelectionParameters().buildUpon();
            if (g < 0) b.setTrackTypeDisabled(tt, true);
            else {
                java.util.List<Tracks.Group> groups = player.getCurrentTracks().getGroups();
                if (g < groups.size()) {
                    b.setTrackTypeDisabled(tt, false);
                    b.setOverrideForType(new TrackSelectionOverride(groups.get(g).getMediaTrackGroup(), t));
                }
            }
            player.setTrackSelectionParameters(b.build());
            call.resolve();
        });
    }

    // app in secondo piano: pausa; chiusa: libera il decoder
    @Override protected void handleOnPause() { if (player != null) player.pause(); restoreRate(); }
    @Override protected void handleOnResume() { if (player != null && player.getVideoFormat() != null) applyRate(player.getVideoFormat().frameRate); }
    @Override protected void handleOnDestroy() { restoreRate(); if (player != null) { player.release(); player = null; } }
}
