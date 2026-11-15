// Client minimale DLNA/UPnP ContentDirectory (Browse) — gira nel processo principale (niente CORS)
'use strict';

function decode(s) {
  return String(s == null ? '' : s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function attr(tag, name) { const m = new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(tag); return m ? decode(m[1]) : ''; }
function text(xml, tag) { const m = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i').exec(xml); return m ? decode(m[1]).trim() : ''; }

// DIDL-Lite -> [{ title, id, dir, mime, size, duration, art, url, desc }]
function parseDidl(didl) {
  const out = [];
  const re = /<(container|item)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(didl))) {
    const isDir = m[1].toLowerCase() === 'container', head = m[2], body = m[3];
    const e = { title: text(body, 'dc:title') || '(senza titolo)', id: attr(head, 'id'), dir: isDir, mime: '', size: 0, duration: '', art: '', url: '', desc: '' };
    if (!isDir) {
      const rr = /<res\b([^>]*)>([\s\S]*?)<\/res>/gi; let r, best = null;
      while ((r = rr.exec(body))) {
        const pi = attr(r[1], 'protocolInfo'), mime = (pi.split(':')[2] || '').toLowerCase();
        if (!/^(video|audio)\//.test(mime) && !/mpegurl|octet-stream/.test(mime)) continue;
        const c = { mime: mime, url: decode(r[2]).trim(), size: +attr(r[1], 'size') || 0, duration: attr(r[1], 'duration').replace(/\.\d+$/, '') };
        if (!best || (/^video\//.test(mime) && !/^video\//.test(best.mime))) best = c;
      }
      if (best) { e.mime = best.mime; e.url = best.url; e.size = best.size; e.duration = best.duration; }
      const cls = text(body, 'upnp:class');
      if (!e.mime) e.mime = /videoItem|movie/i.test(cls) ? 'video/unknown' : /audio|music/i.test(cls) ? 'audio/unknown' : '';
    }
    e.art = text(body, 'upnp:albumArtURI');
    e.desc = text(body, 'dc:description') || text(body, 'upnp:longDescription');
    out.push(e);
  }
  return out;
}

async function browseOnce(control, id, start, count) {
  const body = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
    '<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>' + String(id).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter>' +
    '<StartingIndex>' + start + '</StartingIndex><RequestedCount>' + count + '</RequestedCount><SortCriteria></SortCriteria></u:Browse></s:Body></s:Envelope>';
  const r = await fetch(control, {
    method: 'POST', body: body, signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"' }
  });
  const xml = await r.text();
  if (!r.ok) throw new Error('Il server DLNA ha risposto ' + r.status + (/<errorDescription>([^<]*)/.exec(xml) ? ': ' + /<errorDescription>([^<]*)/.exec(xml)[1] : ''));
  return { items: parseDidl(text(xml, 'Result')), returned: +text(xml, 'NumberReturned') || 0, total: +text(xml, 'TotalMatches') || 0 };
}

async function browse(control, id) {
  let all = [], start = 0;
  for (let guard = 0; guard < 30; guard++) {
    const r = await browseOnce(control, id || '0', start, 200);
    all = all.concat(r.items); start += r.returned || r.items.length;
    if (!r.returned || (r.total && start >= r.total) || all.length >= 3000) break;
  }
  return all;
}

module.exports = { browse, parseDidl, decode };
