(function (U, n, l, v, e, y, B, k) {
  "use strict";
  const { FormSection: N, FormInput: f, FormRow: A } = v.Forms,
    F = l.findByProps("getCurrentUser", "getUser"),
    O = l.findByProps("getChannel", "getChannelId"),
    $ = l.findByProps("getChannelId", "getLastSelectedChannelId"),
    _ = l.findByProps("openLazy", "hideActionSheet"),
    w = l.findByProps("ActionSheetRow")?.ActionSheetRow ?? v.Forms.FormRow,
    G = l.findByStoreName("MessageStore"),
    j = l.findByStoreName("UserStore"),
    R = l.findByProps("sendMessage", "startEditMessage", "editMessage"),
    W = l.findByProps("showToast"),
    NV = l.findByProps("useNavigation"),
    Q = l.findByStoreName("GuildStore"),
    I = new Map();
  let S = !1;

  function x(r) {
    return ((new Date(r).getTime() - 14200704e5) * 4194304).toString();
  }
  let _lastSnow = 0;
  function genId(r) {
    let b = (new Date(r).getTime() - 14200704e5) * 4194304;
    if (!(b > _lastSnow)) b = _lastSnow + 8192;
    _lastSnow = b;
    return b.toString();
  }
  function lastSundayDate(year, month1) {
    const last = new Date(Date.UTC(year, month1, 0));
    return last.getUTCDate() - last.getUTCDay();
  }
  function ukIsBSTInstant(t) {
    const y = t.getUTCFullYear();
    const start = Date.UTC(y, 2, lastSundayDate(y, 3), 1, 0, 0);
    const end = Date.UTC(y, 9, lastSundayDate(y, 10), 1, 0, 0);
    const ms = t.getTime();
    return ms >= start && ms < end;
  }
  function ukNowDate() {
    const now = new Date();
    const off = ukIsBSTInstant(now) ? 60 : 0;
    const s = new Date(now.getTime() + off * 60000);
    return new Date(
      s.getUTCFullYear(),
      s.getUTCMonth(),
      s.getUTCDate(),
      s.getUTCHours(),
      s.getUTCMinutes(),
      s.getUTCSeconds(),
      s.getUTCMilliseconds(),
    );
  }
  function ukOn() {
    try {
      return e.storage.ukTime !== !1;
    } catch {
      return !0;
    }
  }
  function nowDate() {
    return ukOn() ? ukNowDate() : new Date();
  }
  function nowISO() {
    return nowDate().toISOString();
  }
  const resolving = new Set();
  function extractId(x) {
    try {
      if (!x) return null;
      if (typeof x === "string") return /^\d+$/.test(x) ? x : null;
      if (x.id) return x.id;
      if (x.userId) return x.userId;
      if (x.user && x.user.id) return x.user.id;
    } catch {}
    return null;
  }
  function forceSet(o, k, v) {
    if (!o) return;
    try {
      o[k] = v;
    } catch {}
    try {
      if (o[k] !== v)
        Object.defineProperty(o, k, {
          value: v,
          writable: !0,
          configurable: !0,
          enumerable: !0,
        });
    } catch {}
  }
  function forceNull(o, k) {
    try {
      if (!(k in o)) return;
    } catch {
      return;
    }
    forceSet(o, k, null);
  }
  const EMPTY = {};
  function anyProf() {
    const p = e.storage.profiles;
    if (!p) return !1;
    for (const k in p) return !0;
    return !1;
  }
  function firstProfiledId(args) {
    if (!args) return null;
    if (!anyProf()) return null;
    const profs = e.storage.profiles || EMPTY;
    for (let i5 = 0; i5 < args.length; i5++) {
      const id = extractId(args[i5]);
      if (id && profs[id]) return id;
    }
    return null;
  }
  function createdAtFromId(id) {
    try {
      const ms = Math.floor(Number(id) / 4194304) + 1420070400000;
      if (isFinite(ms)) return new Date(ms);
    } catch {}
    return null;
  }
  function parseUserDate(str) {
    str = ("" + str).trim();
    if (!str) return null;
    let m = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) {
      const yr = +m[1],
        mo = +m[2],
        dy = +m[3];
      const d = new Date(yr, mo - 1, dy);
      if (!isNaN(d.getTime()) && d.getMonth() === mo - 1 && d.getDate() === dy)
        return d;
      return null;
    }
    m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      let a = +m[1],
        b = +m[2],
        y = +m[3];
      if (y < 100) y += 2000;
      let dy = a,
        mo = b;
      if (mo > 12 && dy <= 12) {
        dy = b;
        mo = a;
      }
      const d = new Date(y, mo - 1, dy);
      if (!isNaN(d.getTime()) && d.getMonth() === mo - 1 && d.getDate() === dy)
        return d;
      return null;
    }
    const d2 = new Date(str);
    if (!isNaN(d2.getTime())) return d2;
    return null;
  }
  function fmtSimple(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear();
    } catch {
      return "";
    }
  }
  function resolveJoined(uid) {
    const prof = (e.storage.profiles || EMPTY)[uid];
    if (!prof) return null;
    if (prof.joinedAt) return prof.joinedAt;
    if (prof.sourceId) {
      const d = createdAtFromId(prof.sourceId);
      if (d) return d.toISOString();
    }
    return null;
  }
  function resolveCreated(uid) {
    const prof = (e.storage.profiles || EMPTY)[uid];
    if (!prof) return null;
    if (prof.accountDate) {
      const d = new Date(prof.accountDate);
      if (!isNaN(d.getTime())) return d;
    }
    if (prof.sourceId) return createdAtFromId(prof.sourceId);
    return null;
  }
  function resolveName(uid) {
    const prof = (e.storage.profiles || EMPTY)[uid];
    if (!prof) return null;
    if (prof.name) return prof.name;
    if (prof.sourceId && !resolving.has(uid)) {
      resolving.add(uid);
      try {
        const src = j.getUser(prof.sourceId);
        if (src)
          return src.globalName || src.global_name || src.username || null;
      } catch {
      } finally {
        resolving.delete(uid);
      }
    }
    return null;
  }
  function resolveUsername(uid) {
    const prof = (e.storage.profiles || EMPTY)[uid];
    if (!prof) return null;
    if (prof.sourceId && !resolving.has(uid)) {
      resolving.add(uid);
      try {
        const src = j.getUser(prof.sourceId);
        if (src) return src.username || null;
      } catch {
      } finally {
        resolving.delete(uid);
      }
    }
    return prof.name || null;
  }
  function resolveAvatar(uid) {
    const prof = (e.storage.profiles || EMPTY)[uid];
    if (!prof) return null;
    if (prof.sourceId && !resolving.has(uid)) {
      resolving.add(uid);
      try {
        const src = j.getUser(prof.sourceId);
        if (src && typeof src.getAvatarURL === "function") {
          const u = src.getAvatarURL();
          if (u) return u;
        }
      } catch {
      } finally {
        resolving.delete(uid);
      }
    }
    return prof.avatar || null;
  }
  const _avSrc = new Map();
  function mirrorSource(id, ret) {
    const uri = resolveAvatar(id);
    if (!uri) return ret;
    const prev = _avSrc.get(id);
    if (prev && prev.uri === uri) return prev.obj;
    const obj =
      ret && typeof ret === "object"
        ? Object.assign({}, ret, { uri: uri })
        : { uri: uri };
    _avSrc.set(id, { uri: uri, obj: obj });
    return obj;
  }
  function resolveBanner(uid) {
    const prof = (e.storage.profiles || EMPTY)[uid];
    if (!prof || !prof.sourceId) return null;
    if (resolving.has("b" + uid)) return null;
    resolving.add("b" + uid);
    try {
      const src = j.getUser(prof.sourceId);
      if (src && typeof src.getBannerURL === "function") {
        let u;
        try {
          u = src.getBannerURL({ size: 2048 });
        } catch {}
        if (!u)
          try {
            u = src.getBannerURL();
          } catch {}
        if (u) return u;
      }
      let bh = src && src.banner;
      if (!bh)
        try {
          const UPS = l.findByStoreName("UserProfileStore");
          const sp = UPS && UPS.getUserProfile(prof.sourceId);
          if (sp && sp.banner) bh = sp.banner;
        } catch {}
      if (bh) {
        const ext = ("" + bh).indexOf("a_") === 0 ? "gif" : "png";
        return (
          "https://cdn.discordapp.com/banners/" +
          prof.sourceId +
          "/" +
          bh +
          "." +
          ext +
          "?size=2048"
        );
      }
    } catch {
    } finally {
      resolving.delete("b" + uid);
    }
    return null;
  }
  function resolveAccent(uid) {
    const prof = (e.storage.profiles || EMPTY)[uid];
    if (!prof || !prof.sourceId) return null;
    if (resolving.has("a" + uid)) return null;
    resolving.add("a" + uid);
    try {
      const src = j.getUser(prof.sourceId);
      if (src && src.accentColor != null) return src.accentColor;
    } catch {
    } finally {
      resolving.delete("a" + uid);
    }
    return null;
  }
  function mkAuthor(uid) {
    let u = null;
    try {
      u = j.getUser(uid);
    } catch {}
    const dn = resolveName(uid);
    const un = resolveUsername(uid);
    const av = resolveAvatar(uid);
    return {
      id: uid,
      username: un || (u ? u.username : "FakeUser"),
      global_name: dn || (u ? u.globalName || u.global_name || null : null),
      discriminator: u ? u.discriminator : "0001",
      avatar: av || (u ? u.avatar : null),
      bot: u ? u.bot : !1,
    };
  }
  let selfActive = !1,
    selfId = null,
    selfAt = 0,
    _cuReal = null,
    _cuId = null,
    _cuProxy = null;
  function spoofCU(real, id) {
    try {
      if (_cuProxy && _cuReal === real && _cuId === id) return _cuProxy;
      const desc = Object.getOwnPropertyDescriptors(real);
      delete desc.id;
      const clone = Object.create(Object.getPrototypeOf(real), desc);
      Object.defineProperty(clone, "id", {
        value: id,
        writable: !0,
        enumerable: !0,
        configurable: !0,
      });
      try {
        const ca = resolveCreated(id);
        if (ca) forceSet(clone, "createdAt", ca);
      } catch {}
      ((_cuReal = real), (_cuId = id), (_cuProxy = clone));
      return clone;
    } catch {
      return real;
    }
  }
  function resolveServerName(inlineId, channelId) {
    try {
      let id = inlineId;
      if (!id) id = ("" + (e.storage.serverTagId || "")).trim();
      if (!id) {
        const ch = O && O.getChannel && O.getChannel(channelId);
        id = ch && ch.guild_id;
      }
      if (id && Q && Q.getGuild) {
        const g = Q.getGuild(id);
        if (g && g.name) return g.name;
      }
    } catch {}
    return null;
  }
  function applyTags(content, channelId) {
    if (!content || content.indexOf("[server") === -1) return content;
    let out = content.replace(/\[server:(\d{5,25})\]/gi, function (m, id) {
      return resolveServerName(id, channelId) || m;
    });
    out = out.replace(/\[server\]/gi, function (m) {
      return resolveServerName(null, channelId) || m;
    });
    return out;
  }
  
  async function P(r, s, c, u, t, ref) {
    c = applyTags(c, r);
    const d = t || genId(u || nowISO());
    try {
      const g = u || nowISO(),
        h = {
          id: d,
          type: 0,
          channel_id: r,
          author: mkAuthor(s),
          content: c,
          nonce: d,
          mentions: [],
          mention_roles: [],
          pinned: !1,
          tts: !1,
          attachments: [],
          embeds: [],
          timestamp: g,
          edited_timestamp: null,
          state: "SENT",
          fake: !0,
        };
      if (ref && ref.id) {
        h.type = 19;
        h.message_reference = { message_id: ref.id, channel_id: r };
        try {
          const gid = O?.getChannel?.(r)?.guild_id;
          if (gid) h.message_reference.guild_id = gid;
        } catch {}
        h.referenced_message = {
          id: ref.id,
          type: 0,
          channel_id: r,
          author: mkAuthor(ref.userId),
          content: ref.content,
          mentions: [],
          mention_roles: [],
          pinned: !1,
          tts: !1,
          attachments: [],
          embeds: [],
          timestamp: ref.timestamp || g,
          edited_timestamp: null,
          state: "SENT",
          fake: !0,
        };
      }
      n.FluxDispatcher.dispatch({
        type: "MESSAGE_CREATE",
        channelId: r,
        message: h,
        otherPluginBypass: !0,
      });
      try {
        n.FluxDispatcher.dispatch({
          type: "MESSAGE_ACK",
          channelId: r,
          messageId: d,
          manual: !0,
          immediate: !0,
        });
      } catch {}
      try {
        addLinkEmbeds(r, h, c);
      } catch {}
    } catch {}
  }

  function decodeEntities(str) {
    return ("" + str)
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x2F;/gi, "/")
      .trim();
  }
  async function fetchT(url, ms, opts) {
    const ctl =
      typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl
      ? setTimeout(function () {
          try {
            ctl.abort();
          } catch {}
        }, ms || 8000)
      : null;
    try {
      return await fetch(
        url,
        Object.assign({}, opts, ctl ? { signal: ctl.signal } : {}),
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  function metaTag(html, prop) {
    try {
      let m = html.match(
        new RegExp(
          '<meta[^>]+(?:property|name)=["\\\']' +
            prop +
            '["\\\'][^>]*?content=["\\\']([^"\\\']*)["\\\']',
          "i",
        ),
      );
      if (m && m[1]) return decodeEntities(m[1]);
      m = html.match(
        new RegExp(
          '<meta[^>]+content=["\\\']([^"\\\']*)["\\\'][^>]*?(?:property|name)=["\\\']' +
            prop +
            '["\\\']',
          "i",
        ),
      );
      if (m && m[1]) return decodeEntities(m[1]);
    } catch {}
    return null;
  }
  function ytId(url) {
    let m;
    if ((m = url.match(/[?&]v=([\w-]{11})/))) return m[1];
    if ((m = url.match(/youtu\.be\/([\w-]{11})/))) return m[1];
    if ((m = url.match(/youtube\.com\/shorts\/([\w-]{11})/))) return m[1];
    if ((m = url.match(/youtube\.com\/embed\/([\w-]{11})/))) return m[1];
    if ((m = url.match(/youtube\.com\/live\/([\w-]{11})/))) return m[1];
    return null;
  }
  async function fetchYouTube(url) {
    const vid = ytId(url);
    let data = {};
    try {
      const res = await fetchT(
        "https://www.youtube.com/oembed?format=json&url=" +
          encodeURIComponent(url),
        8000,
      );
      if (res && res.ok) data = await res.json();
    } catch {}
    if (!vid && !data.title) return null;
    const w = data.thumbnail_width || 1280,
      h = data.thumbnail_height || 720,
      embed = {
        type: vid ? "video" : "rich",
        url: url,
        color: 0xff0000,
        provider: { name: "YouTube", url: "https://www.youtube.com" },
      };
    if (data.title) embed.title = ("" + data.title).slice(0, 256);
    if (data.author_name)
      embed.author = { name: data.author_name, url: data.author_url };
    const thumb =
      data.thumbnail_url ||
      (vid ? "https://i.ytimg.com/vi/" + vid + "/hqdefault.jpg" : null);
    if (thumb)
      embed.thumbnail = { url: thumb, proxy_url: thumb, width: w, height: h };
    if (vid)
      embed.video = {
        url: "https://www.youtube.com/embed/" + vid,
        width: 1280,
        height: 720,
      };
    return embed;
  }
  async function fetchOpenGraph(url) {
    try {
      const res = await fetchT(url, 8000, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
        },
      });
      if (!res || !res.ok) return null;
      let html = await res.text();
      if (html && html.length > 6e5) html = html.slice(0, 6e5);
      const title =
        metaTag(html, "og:title") ||
        metaTag(html, "twitter:title") ||
        (function () {
          const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
          return m ? decodeEntities(m[1]) : null;
        })();
      const desc =
        metaTag(html, "og:description") ||
        metaTag(html, "twitter:description") ||
        metaTag(html, "description");
      const image =
        metaTag(html, "og:image") ||
        metaTag(html, "og:image:url") ||
        metaTag(html, "twitter:image");
      const site = metaTag(html, "og:site_name");
      if (!title && !desc && !image) return null;
      const embed = { type: "rich", url: url, color: 0x4f545c };
      if (title) embed.title = title.slice(0, 256);
      if (desc) embed.description = desc.slice(0, 350);
      if (site) embed.footer = { text: site };
      if (image)
        embed.image = {
          url: image,
          proxy_url: image,
        };
      return embed;
    } catch {
      return null;
    }
  }
  async function fetchOneEmbed(url) {
    try {
      if (
        /(?:youtube\.com\/watch\?|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)/i.test(
          url,
        )
      )
        return await fetchYouTube(url);
      if (/\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(url))
        return {
          type: "image",
          url: url,
          image: { url: url, proxy_url: url },
        };
      return await fetchOpenGraph(url);
    } catch {
      return null;
    }
  }
  async function fetchEmbeds(content) {
    const out = [];
    try {
      const urls = ("" + (content || "")).match(/https?:\/\/[^\s<>]+/g) || [];
      const seen = {};
      for (let i2 = 0; i2 < urls.length && out.length < 4; i2++) {
        let url = urls[i2].replace(/[)\]\.,!?'"]+$/, "");
        if (seen[url]) continue;
        seen[url] = !0;
        const em = await fetchOneEmbed(url);
        if (em) out.push(em);
      }
    } catch {}
    return out;
  }
  function addLinkEmbeds(channelId, message, content) {
    try {
      if (e.storage.embedsEnabled === !1) return;
      if (!/https?:\/\//i.test("" + (content || ""))) return;
      fetchEmbeds(content)
        .then(function (embeds) {
          if (!embeds || !embeds.length) return;
          try {
            n.FluxDispatcher.dispatch({
              type: "MESSAGE_UPDATE",
              message: Object.assign({}, message, { embeds: embeds }),
              otherPluginBypass: !0,
            });
          } catch {}
        })
        .catch(function () {});
    } catch {}
  }
  function L(r) {
    ((e.storage.savedMessages = r), (e.storage._lastUpdate = Date.now()));
  }
  function z(r, s, c, u, t, ref) {
    const d = e.storage.savedMessages || [];
    const rec = {
      id: u,
      channelId: r,
      userId: s,
      content: c,
      timestamp: t,
      createdAt: Date.now(),
    };
    if (ref) rec.replyTo = ref;
    (d.push(rec), L(d));
  }
  function H(r) {
    (e.storage.savedMessages || [])
      .filter(function (s) {
        return s.channelId === r;
      })
      .forEach(function (s) {
        P(s.channelId, s.userId, s.content, s.timestamp, s.id, s.replyTo);
      });
  }
  function Y() {
    return $?.getChannelId() || O?.getChannelId?.() || null;
  }
  function tt(r) {
    try {
      W?.showToast?.(r);
    } catch {}
  }
  function mkISO(Y0, Mo, D0, H0, Mi, useUTC) {
    const dt = useUTC
      ? new Date(Date.UTC(Y0, Mo - 1, D0, H0, Mi, 0, 0))
      : new Date(Y0, Mo - 1, D0, H0, Mi, 0, 0);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  function parseTime(str, base, useUTC) {
    const s = (str || "").trim();
    if (!s) return null;
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})$/)))
      return mkISO(+m[1], +m[2], +m[3], +m[4], +m[5], useUTC);
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)))
      return mkISO(+m[1], +m[2], +m[3], 0, 0, useUTC);
    if ((m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i))) {
      let H0 = +m[1];
      const Mi = m[2] ? +m[2] : 0,
        ap = m[3].toLowerCase();
      (ap === "pm" && H0 !== 12 && (H0 += 12), ap === "am" && H0 === 12 && (H0 = 0));
      return mkISO(base.y, base.mo, base.d, H0, Mi, useUTC);
    }
    if ((m = s.match(/^(\d{1,2}):(\d{2})$/)))
      return mkISO(base.y, base.mo, base.d, +m[1], +m[2], useUTC);
    return null;
  }
  function pRef(tok) {
    if (!tok) return null;
    const nn = tok.slice(1);
    return nn ? { line: parseInt(nn, 10) } : { prev: !0 };
  }
  function parseLine(line) {
    const raw = (line || "").trim();
    if (!raw) return null;
    let m;
    if (
      (m = raw.match(
        /^([^\s\[\^|:\-\u2013\u2014]+)\s*\[([^\]]+)\]\s*(\^\d*)?\s*[-\u2013\u2014|:]\s*([\s\S]*)$/,
      ))
    )
      return { uid: m[1], time: m[2].trim(), reply: pRef(m[3]), content: m[4] };
    if (
      (m = raw.match(
        /^([^\s\[\^|:\-\u2013\u2014]+)\s*(\^\d*)?\s*[-\u2013\u2014|:]\s*([\s\S]*)$/,
      ))
    )
      return { uid: m[1], time: null, reply: pRef(m[2]), content: m[3] };
    return null;
  }
  function _randGapMs() {
    return Math.floor(6e4 + Math.random() * 6e4);
  }
  async function runConvo() {
    const ch = Y();
    if (!ch) {
      tt("No channel selected.");
      return;
    }
    const text = e.storage.conversationText || "",
      lines = text.split(/\r?\n/),
      useUTC = ukOn() ? !1 : e.storage.useUTC || !1,
      now = nowDate(),
      base = {
        y: e.storage.customYear || now.getFullYear(),
        mo: e.storage.customMonth || now.getMonth() + 1,
        d: e.storage.customDay || now.getDate(),
      };
    const items = [];
    for (const line of lines) {
      const parsed = parseLine(line);
      if (!parsed || !parsed.content.trim()) continue;
      let uid = parsed.uid;
      if (/^(me|self)$/i.test(uid)) uid = F.getCurrentUser()?.id;
      else if (/^(them|they|user)$/i.test(uid)) uid = (e.storage.userId || "").trim();
      if (!uid) continue;
      const explicit = parsed.time ? parseTime(parsed.time, base, useUTC) : null;
      items.push({
        uid: uid,
        content: parsed.content,
        reply: parsed.reply,
        explicit: explicit || null,
      });
    }
    let cursor = nowDate().getTime();
    for (let i = 0; i < items.length; i++) {
      if (items[i].explicit) {
        const t0 = new Date(items[i].explicit).getTime();
        if (!isNaN(t0)) {
          cursor = t0;
          break;
        }
      }
    }
    let count = 0;
    const built = [];
    for (const it of items) {
      let iso;
      if (it.explicit) {
        const t = new Date(it.explicit).getTime();
        if (!isNaN(t)) {
          cursor = t;
          iso = new Date(t).toISOString();
        } else {
          iso = new Date(cursor).toISOString();
        }
      } else {
        iso = new Date(cursor).toISOString();
      }
      cursor += _randGapMs();
      const id = genId(iso);
      let ref = null;
      if (it.reply) {
        const target = it.reply.prev
          ? built[built.length - 1]
          : built[it.reply.line - 1];
        if (target)
          ref = {
            id: target.id,
            userId: target.userId,
            content: target.content,
            timestamp: target.timestamp,
          };
      }
      (await P(ch, it.uid, it.content, iso, id, ref),
        z(ch, it.uid, it.content, id, iso, ref),
        built.push({
          id: id,
          userId: it.uid,
          content: it.content,
          timestamp: iso,
        }),
        count++);
    }
    tt(count ? `Sent ${count} message${count === 1 ? "" : "s"}.` : "No valid lines found.");
  }
  function _extractUserId(input) {
    const s = ("" + (input || "")).trim();
    if (!s) return null;
    let m = s.match(/^<@!?(\d{17,20})>$/);
    if (m) return m[1];
    m = s.match(/users\/(\d{17,20})\b/);
    if (m) return m[1];
    if (/^\d{17,20}$/.test(s)) return s;
    return null;
  }
  function _dmNameFor(id) {
    try {
      const u = j.getUser(id);
      if (u) return u.globalName || u.global_name || u.username || id;
    } catch {}
    return id;
  }
  function _tryOpenPrivate(acts, id) {
    if (!acts || typeof acts.openPrivateChannel !== "function") return !1;
    const shapes = [id, { recipientId: id }, { userId: id }];
    for (let i = 0; i < shapes.length; i++) {
      try {
        acts.openPrivateChannel(shapes[i]);
        return !0;
      } catch {}
    }
    return !1;
  }
  function _pushMessagesScreen(channelId) {
    try {
      const RA = l.findByProps("handleTapChannel");
      if (RA && typeof RA.handleTapChannel === "function") {
        RA.handleTapChannel(channelId);
        return !0;
      }
    } catch {}
    try {
      const RA2 = l.findByProps("handlePressChannel");
      if (RA2 && typeof RA2.handlePressChannel === "function") {
        RA2.handlePressChannel(channelId);
        return !0;
      }
    } catch {}
    try {
      const NavRef = l.findByProps("getRootNavigationRef");
      const ref =
        NavRef &&
        typeof NavRef.getRootNavigationRef === "function" &&
        NavRef.getRootNavigationRef();
      if (ref && typeof ref.navigate === "function") {
        const routes = ["messages", "Messages", "Channel", "channel"];
        for (let i = 0; i < routes.length; i++) {
          try {
            ref.navigate(routes[i], { channelId: channelId });
            return !0;
          } catch {}
        }
      }
    } catch {}
    return !1;
  }
  function _tryNavigate(channelId) {
    if (!channelId) return !1;
    const sc = l.findByProps("selectChannel");
    if (sc && typeof sc.selectChannel === "function") {
      const shapes = [
        { guildId: null, channelId: channelId },
        { guildId: "@me", channelId: channelId },
        { channelId: channelId },
        channelId,
      ];
      for (let i = 0; i < shapes.length; i++) {
        try {
          sc.selectChannel(shapes[i]);
          _pushMessagesScreen(channelId);
          return !0;
        } catch {}
      }
    }
    if (_pushMessagesScreen(channelId)) return !0;
    const tr = l.findByProps("transitionToChannel");
    if (tr && typeof tr.transitionToChannel === "function") {
      try {
        tr.transitionToChannel(channelId);
        return !0;
      } catch {}
    }
    const oc = l.findByProps("openChannel");
    if (oc && typeof oc.openChannel === "function") {
      try {
        oc.openChannel({ channelId: channelId });
        return !0;
      } catch {}
    }
    return !1;
  }
  function _findExistingDM(id) {
    try {
      const CS = l.findByStoreName("ChannelStore");
      const PCS = l.findByStoreName("PrivateChannelStore");
      let cid = null;
      try {
        if (PCS && typeof PCS.getDMFromUserId === "function")
          cid = PCS.getDMFromUserId(id);
      } catch {}
      if (cid) {
        const ch = CS && CS.getChannel ? CS.getChannel(cid) : null;
        if (ch && ch.type === 1) return cid;
      }
      let ids = [];
      try {
        if (PCS && typeof PCS.getPrivateChannelIds === "function")
          ids = PCS.getPrivateChannelIds() || [];
      } catch {}
      for (let i = 0; i < ids.length; i++) {
        const ch = CS && CS.getChannel ? CS.getChannel(ids[i]) : null;
        if (!ch || ch.type !== 1) continue;
        const r = ch.recipients || [];
        if (r.length !== 1) continue;
        const rid = typeof r[0] === "string" ? r[0] : r[0] && r[0].id;
        if (rid === id) return ids[i];
      }
    } catch {}
    return null;
  }
  function _isDM(channelId) {
    try {
      const CS = l.findByStoreName("ChannelStore");
      const ch = CS && CS.getChannel ? CS.getChannel(channelId) : null;
      return !!ch && ch.type === 1;
    } catch {}
    return !1;
  }

  async function openDM(userId) {
    const id = _extractUserId(userId);
    if (!id) {
      tt("Invalid user - expected an ID, mention, or profile link.");
      return null;
    }
    const acts = l.findByProps("openPrivateChannel");
    const ens = l.findByProps("ensurePrivateChannel");

    let channelId = _findExistingDM(id);
    if (channelId && _tryNavigate(channelId)) {
      tt("Opening DM with " + _dmNameFor(id));
      return { channelId: channelId, userId: id };
    }

    if (!channelId && ens && typeof ens.ensurePrivateChannel === "function") {
      try {
        channelId = await ens.ensurePrivateChannel(id);
      } catch {}
    }
    if (channelId) {
      if (_isDM(channelId)) {
        if (_tryNavigate(channelId)) {
          tt("Opening DM with " + _dmNameFor(id));
          return { channelId: channelId, userId: id };
        }
      } else {
        const real = _findExistingDM(id);
        if (real && _tryNavigate(real)) {
          tt("Opening DM with " + _dmNameFor(id));
          return { channelId: real, userId: id };
        }
        tt("This build's create call makes a group, not a 1:1 DM.");
        return null;
      }
    }

    if (_tryOpenPrivate(acts, id)) {
      const real = _findExistingDM(id);
      if (real && _tryNavigate(real)) {
        tt("Opening DM with " + _dmNameFor(id));
        return { channelId: real, userId: id };
      }
      tt("Opened a channel but couldn't confirm it's a 1:1 DM.");
      return null;
    }

    tt("Couldn't open a DM - no working DM API found on this build.");
    return null;
  }

  function closePanel(nav) {
    try {
      if (nav && typeof nav.goBack === "function") return void nav.goBack();
    } catch {}
    try {
      if (nav && typeof nav.pop === "function") return void nav.pop();
    } catch {}
    try {
      const N2 = l.findByProps("pop", "popToTop", "push");
      if (N2 && typeof N2.pop === "function") return void N2.pop();
    } catch {}
  }
  function PanelSheet() {
    const panel = n.React.createElement(J.settings, { inSheet: !0 });
    const RN = n.ReactNative || l.findByProps("ScrollView", "View");
    const spacer =
      RN && RN.View
        ? n.React.createElement(RN.View, { style: { height: 80 } })
        : null;
    let ActionSheet = null;
    try {
      ActionSheet =
        (l.findByProps("ActionSheet", "ActionSheetRow") || {}).ActionSheet ||
        (l.findByProps("ActionSheet") || {}).ActionSheet ||
        (l.findByProps("ActionSheetRow") || {}).ActionSheet ||
        null;
    } catch {}
    if (ActionSheet)
      return n.React.createElement(ActionSheet, {}, panel, spacer);
    if (!RN || !RN.ScrollView) return panel;
    let screenH = 800;
    try {
      if (RN.Dimensions && RN.Dimensions.get)
        screenH = RN.Dimensions.get("window").height || 800;
    } catch {}
    const sheetMax = Math.round(screenH * 0.88);
    return n.React.createElement(
      RN.View,
      {
        style: {
          backgroundColor: "#1e1f22",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          paddingTop: 10,
          maxHeight: sheetMax,
        },
      },
      n.React.createElement(
        RN.ScrollView,
        {
          style: { maxHeight: sheetMax - 10 },
          contentContainerStyle: { paddingBottom: 240 },
          keyboardShouldPersistTaps: "handled",
          showsVerticalScrollIndicator: !0,
          nestedScrollEnabled: !0,
        },
        panel,
        spacer,
      ),
    );
  }
  function openPanel() {
    try {
      if (_ && typeof _.openLazy === "function") {
        _.openLazy(
          Promise.resolve({ default: PanelSheet }),
          "LocalMessageSpooferSheet",
          {},
        );
        return;
      }
    } catch {}
    tt("Couldn't open the panel on this client. Open it from the Plugins list.");
  }
  function fillFromChat() {
    try {
      const ch = Y();
      if (!ch) return null;
      let channel = null;
      try {
        channel = O?.getChannel?.(ch);
      } catch {}
      if (!channel) {
        try {
          channel = l.findByStoreName("ChannelStore")?.getChannel?.(ch);
        } catch {}
      }
      let rec = channel?.recipients;
      if (rec && rec.length) {
        let id = rec[0];
        if (id && typeof id === "object") id = id.id || id.userId || id.user_id;
        if (id) return "" + id;
      }
      let raw = channel?.rawRecipients;
      if (raw && raw.length && raw[0]) {
        const id = raw[0].id || raw[0].user_id;
        if (id) return "" + id;
      }
      try {
        const ids = l.findByProps("getDMUserIds")?.getDMUserIds?.(ch);
        if (ids && ids.length) return "" + ids[0];
      } catch {}
      let arr = [];
      try {
        const msgs = G?.getMessages?.(ch);
        arr =
          msgs && msgs.toArray ? msgs.toArray() : (msgs && msgs._array) || [];
      } catch {}
      const meId = j?.getCurrentUser?.()?.id;
      for (let i2 = arr.length - 1; i2 >= 0; i2--) {
        const au = arr[i2] && arr[i2].author && arr[i2].author.id;
        if (au && au !== meId) return "" + au;
      }
    } catch {}
    return null;
  }
  function clearSaved() {
    try {
      const count = (e.storage.savedMessages || []).length;
      L([]);
      tt(
        "Cleared " + count + " saved message" + (count === 1 ? "" : "s") + ".",
      );
    } catch {
      tt("Couldn't clear saved messages.");
    }
  }
  function removeAllFakes() {
    try {
      const list = (e.storage.savedMessages || []).slice();
      let removed = 0;
      for (let i6 = 0; i6 < list.length; i6++) {
        const rec = list[i6];
        if (rec && rec.id && rec.channelId) {
          try {
            n.FluxDispatcher.dispatch({
              type: "MESSAGE_DELETE",
              id: rec.id,
              channelId: rec.channelId,
              otherPluginBypass: !0,
            });
            removed++;
          } catch {}
        }
      }
      L([]);
      tt(
        "Removed " +
          removed +
          " spoofed message" +
          (removed === 1 ? "" : "s") +
          " and cleared saved.",
      );
    } catch {
      tt("Couldn't remove spoofed messages.");
    }
  }
  let _fp;
  function fetchProfileSafe(uid) {
    if (!uid) return;
    try {
      if (_fp === undefined) _fp = l.findByProps("fetchProfile") || null;
    } catch {
      _fp = null;
    }
    if (_fp && typeof _fp.fetchProfile === "function") {
      try {
        const r = _fp.fetchProfile(uid);
        if (r && typeof r.catch === "function") r.catch(function () {});
      } catch {}
    }
  }
  function prefetchSources() {
    let n = 0;
    try {
      const profs = e.storage.profiles || {};
      const seen = {};
      for (const k in profs) {
        const sid = profs[k] && profs[k].sourceId;
        if (sid && !seen[sid]) {
          seen[sid] = 1;
          fetchProfileSafe(sid);
          n++;
        }
      }
    } catch {}
    return n;
  }
  function saveProfile() {
    try {
      const id = ("" + (e.storage.profileId || "")).trim();
      if (!/^\d{5,}$/.test(id)) {
        tt("Enter a valid numeric user ID first.");
        return;
      }
      const name = ("" + (e.storage.profileName || "")).trim();
      const avatar = ("" + (e.storage.profileAvatar || "")).trim();
      const sourceId = ("" + (e.storage.profileSource || ""))
        .trim()
        .replace(/[^0-9]/g, "");
      const self = !!e.storage.profileSelf;
      if (sourceId && sourceId === id) {
        tt("Source ID must differ from the user ID.");
        return;
      }
      let joinedAt = void 0,
        accountDate = void 0,
        dateWarn = "";
      const joinedRaw = ("" + (e.storage.profileJoined || "")).trim();
      if (joinedRaw) {
        const jd = parseUserDate(joinedRaw);
        if (jd) joinedAt = jd.toISOString();
        else dateWarn += " (server date not understood, left default)";
      }
      const accountRaw = ("" + (e.storage.profileAccount || "")).trim();
      if (accountRaw) {
        const ad = parseUserDate(accountRaw);
        if (ad) accountDate = ad.toISOString();
        else dateWarn += " (Discord date not understood, left default)";
      }
      if (!name && !avatar && !sourceId && !self && !joinedAt && !accountDate) {
        tt("Set a name, avatar, source ID, or a date first.");
        return;
      }
      const p = Object.assign({}, e.storage.profiles || {});
      p[id] = {
        name: name || void 0,
        avatar: avatar || void 0,
        sourceId: sourceId || void 0,
        self: self || void 0,
        joinedAt: joinedAt,
        accountDate: accountDate,
      };
      e.storage.profiles = p;
      e.storage._lastUpdate = Date.now();
      ((_cuProxy = null), (_cuReal = null), (_cuId = null));
      try {
        _avSrc.clear();
      } catch {}
      if (sourceId) fetchProfileSafe(sourceId);
      tt(
        "Saved profile for " +
          id +
          (sourceId ? " (mirroring " + sourceId + ")" : "") +
          (self ? " [self-profile]" : "") +
          "." +
          dateWarn,
      );
    } catch {
      tt("Couldn't save that profile.");
    }
  }
  function removeProfile(id) {
    try {
      const key = ("" + (id || e.storage.profileId || "")).trim();
      const p = Object.assign({}, e.storage.profiles || {});
      if (!p[key]) {
        tt("No profile saved for that ID.");
        return;
      }
      delete p[key];
      e.storage.profiles = p;
      e.storage._lastUpdate = Date.now();
      tt("Removed profile for " + key + ".");
    } catch {
      tt("Couldn't remove that profile.");
    }
  }
  let D = null,
    T = null,
    E = [],
    b = null,
    K = [],
    patchInfo = "(not loaded)";
  var J = {
    onLoad() {
      try {
        K.forEach(function (fn) {
          try {
            fn();
          } catch {}
        });
      } catch {}
      K = [];
      try {
        const cmds = globalThis.vendetta?.commands;
        const reg =
          cmds && typeof cmds.registerCommand === "function"
            ? cmds.registerCommand.bind(cmds)
            : null;
        if (reg) {
          const u1 = reg({
            name: "spoofer",
            displayName: "spoofer",
            description: "Open the Local Message Spoofer panel.",
            displayDescription: "Open the Local Message Spoofer panel.",
            type: 1,
            inputType: 1,
            applicationId: "-1",
            options: [],
            execute: function () {
              openPanel();
            },
          });
          if (typeof u1 === "function") K.push(u1);
          const u2 = reg({
            name: "filluid",
            displayName: "filluid",
            description:
              "Fill the spoofer User ID from this chat, or pass a specific ID.",
            displayDescription:
              "Fill the spoofer User ID from this chat, or pass a specific ID.",
            type: 1,
            inputType: 1,
            applicationId: "-1",
            options: [
              {
                name: "userid",
                displayName: "userid",
                description: "Optional: a specific user ID to set.",
                displayDescription: "Optional: a specific user ID to set.",
                type: 3,
                required: !1,
              },
            ],
            execute: function (args) {
              try {
                const map = Array.isArray(args)
                  ? Object.fromEntries(
                      args.map(function (aa) {
                        return [aa?.name, aa?.value];
                      }),
                    )
                  : args ?? {};
                let id = ("" + (map.userid ?? "")).trim();
                if (!id) id = fillFromChat();
                if (id) {
                  e.storage.userId = id;
                  tt("User ID set: " + id);
                } else
                  tt("No user found here. Try: /filluid userid:123456789");
              } catch (err2) {
                tt("Couldn't set the User ID.");
              }
            },
          });
          if (typeof u2 === "function") K.push(u2);
          const u3 = reg({
            name: "clearfakes",
            displayName: "clearfakes",
            description: "Clear all saved fake messages (stops them replaying).",
            displayDescription:
              "Clear all saved fake messages (stops them replaying).",
            type: 1,
            inputType: 1,
            applicationId: "-1",
            options: [],
            execute: function () {
              clearSaved();
            },
          });
          if (typeof u3 === "function") K.push(u3);
          const u4 = reg({
            name: "dm",
            displayName: "dm",
            description: "Open a DM with a user by ID, mention, or profile link.",
            displayDescription:
              "Open a DM with a user by ID, mention, or profile link.",
            type: 1,
            inputType: 1,
            applicationId: "-1",
            options: [
              {
                name: "user",
                displayName: "user",
                description: "User ID, mention, or profile URL.",
                displayDescription: "User ID, mention, or profile URL.",
                type: 3,
                required: !0,
              },
            ],
            execute: function (args) {
              try {
                const map = Array.isArray(args)
                  ? Object.fromEntries(
                      args.map(function (aa) {
                        return [aa?.name, aa?.value];
                      }),
                    )
                  : args ?? {};
                openDM("" + (map.user ?? ""));
              } catch {
                tt("Couldn't run /dm.");
              }
            },
          });
          if (typeof u4 === "function") K.push(u4);

          const sdmCommand = reg({
            name: "sdm",
            displayName: "sdm",
            description: "Open a DM and add a local spoofed message.",
            displayDescription: "Open a DM and add a local spoofed message.",
            type: 1,
            inputType: 1,
            applicationId: "-1",
            options: [
              {
                name: "user",
                displayName: "user",
                description: "User ID, mention, or profile URL.",
                displayDescription: "User ID, mention, or profile URL.",
                type: 3,
                required: !0,
              },
              {
                name: "message",
                displayName: "message",
                description: "The local-only spoofed message to add.",
                displayDescription: "The local-only spoofed message to add.",
                type: 3,
                required: !0,
              },
            ],
            execute: async function (args) {
              try {
                const map = Array.isArray(args)
                  ? Object.fromEntries(
                      args.map(function (aa) {
                        return [aa?.name, aa?.value];
                      }),
                    )
                  : args ?? {};

                const result = await openDM("" + (map.user ?? ""));
                if (!result) {
                  tt("Failed to open DM or user not found.");
                  return;
                }

                const content = ("" + (map.message ?? "")).trim();
                if (!content) {
                  tt("Enter a message to spoof.");
                  return;
                }

                await new Promise(function (resolve) {
                  setTimeout(resolve, 250);
                });

                const timestamp = nowISO();
                const id = genId(timestamp);

                await P(result.channelId, result.userId, content, timestamp, id);
                z(result.channelId, result.userId, content, id, timestamp);

                tt("Spoofed message sent in DM.");
              } catch (e) {
                tt("Error: " + (e.message || "unknown"));
              }
            },
          });
          if (typeof sdmCommand === "function") K.push(sdmCommand);
        }
      } catch {}

      b = y.before("dispatch", n.FluxDispatcher, function (s) {
        const [c] = s;
        if (
          c.type === "MESSAGE_UPDATE" &&
          c.message?.fake &&
          !c.otherPluginBypass &&
          !S
        )
          return [];
      });
      try {
        const AV = l.findByProps("getUserAvatarURL");
        if (AV && typeof AV.getUserAvatarURL === "function")
          E.push(
            y.after("getUserAvatarURL", AV, function (a, ret) {
              try {
                const id = firstProfiledId(a);
                if (id) {
                  const o = resolveAvatar(id);
                  if (o) return o;
                }
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const AV2 = l.findByProps("getUserAvatarSource");
        if (AV2 && typeof AV2.getUserAvatarSource === "function")
          E.push(
            y.after("getUserAvatarSource", AV2, function (a, ret) {
              try {
                const id = firstProfiledId(a);
                if (id) return mirrorSource(id, ret);
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const GAV = l.findByProps("getGuildMemberAvatarURLSimple");
        if (GAV && typeof GAV.getGuildMemberAvatarURLSimple === "function")
          E.push(
            y.after("getGuildMemberAvatarURLSimple", GAV, function (a, ret) {
              try {
                const id = firstProfiledId(a);
                if (id) {
                  const o = resolveAvatar(id);
                  if (o) return o;
                }
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const cu = j && j.getCurrentUser && j.getCurrentUser();
        const proto = cu && cu.constructor && cu.constructor.prototype;
        if (proto && typeof proto.getAvatarURL === "function")
          E.push(
            y.after("getAvatarURL", proto, function (a, ret) {
              try {
                const id = this && this.id;
                if (id && (e.storage.profiles || EMPTY)[id]) {
                  const o = resolveAvatar(id);
                  if (o) return o;
                }
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        if (j && typeof j.getUser === "function")
          E.push(
            y.after("getUser", j, function (a, ret) {
              try {
                const profs = e.storage.profiles;
                const id = a && a[0];
                if (profs && id && profs[id] && ret) {
                  const dn = resolveName(id);
                  const un = resolveUsername(id);
                  if (un && ret.username !== un) forceSet(ret, "username", un);
                  if (dn && ret.globalName !== dn)
                    forceSet(ret, "globalName", dn);
                  forceNull(ret, "avatarDecorationData");
                  forceNull(ret, "avatarDecoration");
                  forceNull(ret, "primaryGuild");
                  forceNull(ret, "clan");
                  forceSet(ret, "premiumType", 0);
                  forceNull(ret, "premiumSince");
                  forceNull(ret, "premiumGuildSince");
                  const ca0 = resolveCreated(id);
                  if (ca0) forceSet(ret, "createdAt", ca0);
                  if (profs[id].sourceId) {
                    const ac = resolveAccent(id);
                    if (ac != null) forceSet(ret, "accentColor", ac);
                  }
                }
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const GMS = l.findByStoreName("GuildMemberStore");
        if (GMS && typeof GMS.getNick === "function")
          E.push(
            y.after("getNick", GMS, function (a, ret) {
              try {
                const profs = e.storage.profiles;
                if (profs && a) {
                  const id = profs[a[1]] ? a[1] : profs[a[0]] ? a[0] : null;
                  if (id) {
                    const nm = resolveName(id);
                    if (nm) return nm;
                  }
                }
              } catch {}
              return ret;
            }),
          );
        if (GMS && typeof GMS.getMember === "function")
          E.push(
            y.after("getMember", GMS, function (a, ret) {
              try {
                const profs = e.storage.profiles;
                if (profs && a && ret) {
                  const id = profs[a[1]] ? a[1] : profs[a[0]] ? a[0] : null;
                  if (id) {
                    const nm = resolveName(id);
                    if (nm) {
                      if (ret.nick !== nm) {
                        try {
                          ret.nick = nm;
                        } catch {}
                      }
                      if ("nickname" in ret && ret.nickname !== nm) {
                        try {
                          ret.nickname = nm;
                        } catch {}
                      }
                    }
                    const ja = resolveJoined(id);
                    if (ja) {
                      forceSet(ret, "joinedAt", ja);
                      if ("joinedAtTimestamp" in ret)
                        forceSet(
                          ret,
                          "joinedAtTimestamp",
                          new Date(ja).getTime(),
                        );
                    }
                  }
                }
              } catch {}
              return ret;
            }),
          );
        if (GMS && typeof GMS.getMembers === "function")
          E.push(
            y.after("getMembers", GMS, function (a, ret) {
              try {
                if (!anyProf()) return ret;
                const profs = e.storage.profiles;
                if (profs && ret) {
                  const arr = Array.isArray(ret)
                    ? ret
                    : ret && typeof ret === "object"
                      ? Object.values(ret)
                      : null;
                  if (arr)
                    for (let i3 = 0; i3 < arr.length; i3++) {
                      const m = arr[i3];
                      const mid = m && (m.userId || (m.user && m.user.id));
                      if (mid && profs[mid]) {
                        const nm = resolveName(mid);
                        if (nm) {
                          forceSet(m, "nick", nm);
                          if ("nickname" in m) forceSet(m, "nickname", nm);
                        }
                        const ja = resolveJoined(mid);
                        if (ja) {
                          forceSet(m, "joinedAt", ja);
                          if ("joinedAtTimestamp" in m)
                            forceSet(
                              m,
                              "joinedAtTimestamp",
                              new Date(ja).getTime(),
                            );
                        }
                      }
                    }
                }
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const NK = l.findByProps("getNickname");
        if (NK && typeof NK.getNickname === "function")
          E.push(
            y.after("getNickname", NK, function (a, ret) {
              try {
                const profs = e.storage.profiles;
                if (profs && a) {
                  for (let i4 = 0; i4 < a.length; i4++) {
                    const id = extractId(a[i4]);
                    if (id && profs[id]) {
                      const nm = resolveName(id);
                      if (nm) return nm;
                    }
                  }
                }
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const NM = l.findByProps("getName");
        if (NM && typeof NM.getName === "function")
          E.push(
            y.after("getName", NM, function (a, ret) {
              try {
                const profs = e.storage.profiles;
                if (profs && a) {
                  for (let i2 = 0; i2 < a.length; i2++) {
                    const id = extractId(a[i2]);
                    if (id && profs[id]) {
                      const nm = resolveName(id);
                      if (nm) return nm;
                    }
                  }
                }
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const BU = l.findByProps("getUserBannerURL");
        if (BU && typeof BU.getUserBannerURL === "function")
          E.push(
            y.after("getUserBannerURL", BU, function (a, ret) {
              try {
                const id = firstProfiledId(a);
                const prof = id && (e.storage.profiles || EMPTY)[id];
                if (prof && prof.sourceId) return resolveBanner(id);
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const cu = j && j.getCurrentUser && j.getCurrentUser();
        const proto = cu && cu.constructor && cu.constructor.prototype;
        if (proto && typeof proto.getBannerURL === "function")
          E.push(
            y.after("getBannerURL", proto, function (a, ret) {
              try {
                const id = this && this.id;
                const prof = id && (e.storage.profiles || EMPTY)[id];
                if (prof && prof.sourceId) return resolveBanner(id);
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const DU = l.findByProps("getAvatarDecorationURL");
        if (DU && typeof DU.getAvatarDecorationURL === "function")
          E.push(
            y.after("getAvatarDecorationURL", DU, function (a, ret) {
              try {
                const id = extractId(a && a[0]);
                if (id && (e.storage.profiles || EMPTY)[id]) return null;
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const cu = j && j.getCurrentUser && j.getCurrentUser();
        const proto = cu && cu.constructor && cu.constructor.prototype;
        if (proto && typeof proto.getAvatarDecorationURL === "function")
          E.push(
            y.after("getAvatarDecorationURL", proto, function (a, ret) {
              try {
                const id = this && this.id;
                if (id && (e.storage.profiles || EMPTY)[id]) return null;
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const UPS = l.findByStoreName("UserProfileStore");
        if (UPS && typeof UPS.getUserProfile === "function")
          E.push(
            y.after("getUserProfile", UPS, function (a, ret) {
              try {
                const profs = e.storage.profiles;
                const id = a && a[0];
                if (profs && id && profs[id] && ret) {
                  const prof = profs[id];
                  forceNull(ret, "avatarDecoration");
                  forceNull(ret, "avatarDecorationData");
                  forceNull(ret, "profileEffectId");
                  forceNull(ret, "primaryGuild");
                  forceNull(ret, "clan");
                  forceSet(ret, "badges", []);
                  forceSet(ret, "premiumType", 0);
                  forceNull(ret, "premiumSince");
                  forceNull(ret, "premiumGuildSince");
                  if (prof.sourceId && !resolving.has("p" + id)) {
                    resolving.add("p" + id);
                    try {
                      const sp = UPS.getUserProfile(prof.sourceId);
                      if (sp) {
                        if (sp.bio != null) forceSet(ret, "bio", sp.bio);
                        if (sp.pronouns != null)
                          forceSet(ret, "pronouns", sp.pronouns);
                        if (sp.accentColor != null)
                          forceSet(ret, "accentColor", sp.accentColor);
                        if (sp.themeColors != null)
                          forceSet(ret, "themeColors", sp.themeColors);
                      }
                      let sbh = null;
                      try {
                        const src2 = j.getUser(prof.sourceId);
                        sbh = (src2 && src2.banner) || (sp && sp.banner) || null;
                      } catch {}
                      forceSet(ret, "banner", sbh);
                    } catch {
                    } finally {
                      resolving.delete("p" + id);
                    }
                  }
                }
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const BG = l.findByProps("getBadges");
        if (BG && typeof BG.getBadges === "function")
          E.push(
            y.after("getBadges", BG, function (a, ret) {
              try {
                const id = firstProfiledId(a);
                if (id) return [];
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const BG2 = l.findByProps("getUserProfileBadges");
        if (BG2 && typeof BG2.getUserProfileBadges === "function")
          E.push(
            y.after("getUserProfileBadges", BG2, function (a, ret) {
              try {
                const id = firstProfiledId(a);
                if (id) return [];
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        if (j && typeof j.getCurrentUser === "function")
          E.push(
            y.after("getCurrentUser", j, function (a, ret) {
              try {
                if (selfActive && selfId && ret) return spoofCU(ret, selfId);
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const ICU = l.findByProps("isCurrentUser");
        if (ICU && typeof ICU.isCurrentUser === "function")
          E.push(
            y.after("isCurrentUser", ICU, function (a, ret) {
              try {
                const profs = e.storage.profiles;
                const id = extractId(a && a[0]) || (a && a[0]);
                if (profs && id && profs[id] && profs[id].self) return !0;
              } catch {}
              return ret;
            }),
          );
        const IM = l.findByProps("isMe");
        if (IM && typeof IM.isMe === "function")
          E.push(
            y.after("isMe", IM, function (a, ret) {
              try {
                const profs = e.storage.profiles;
                const id = extractId(a && a[0]) || (a && a[0]);
                if (profs && id && profs[id] && profs[id].self) return !0;
              } catch {}
              return ret;
            }),
          );
      } catch {}
      try {
        const hasP = function (fn) {
          try {
            const o = l.findByProps(fn);
            return !!(o && typeof o[fn] === "function");
          } catch {
            return !1;
          }
        };
        let protoHas = !1;
        try {
          const cu0 = j && j.getCurrentUser && j.getCurrentUser();
          protoHas = !!(
            cu0 &&
            cu0.constructor &&
            cu0.constructor.prototype &&
            typeof cu0.constructor.prototype.getAvatarURL === "function"
          );
        } catch {}
        let gms0 = null;
        try {
          gms0 = l.findByStoreName("GuildMemberStore");
        } catch {}
        let ups0 = !1;
        try {
          const u0 = l.findByStoreName("UserProfileStore");
          ups0 = !!(u0 && typeof u0.getUserProfile === "function");
        } catch {}
        let protoBan = !1,
          protoDec = !1;
        try {
          const cu1 = j && j.getCurrentUser && j.getCurrentUser();
          const pr1 = cu1 && cu1.constructor && cu1.constructor.prototype;
          protoBan = !!(pr1 && typeof pr1.getBannerURL === "function");
          protoDec = !!(
            pr1 && typeof pr1.getAvatarDecorationURL === "function"
          );
        } catch {}
        patchInfo =
          "avURL:" +
          (hasP("getUserAvatarURL") ? "Y" : "N") +
          " avSrc:" +
          (hasP("getUserAvatarSource") ? "Y" : "N") +
          " guildAv:" +
          (hasP("getGuildMemberAvatarURLSimple") ? "Y" : "N") +
          " recAv:" +
          (protoHas ? "Y" : "N") +
          " getName:" +
          (hasP("getName") ? "Y" : "N") +
          " getNick:" +
          (gms0 && typeof gms0.getNick === "function" ? "Y" : "N") +
          " getMember:" +
          (gms0 && typeof gms0.getMember === "function" ? "Y" : "N") +
          " getMembers:" +
          (gms0 && typeof gms0.getMembers === "function" ? "Y" : "N") +
          " getNickname:" +
          (function () {
            try {
              const k0 = l.findByProps("getNickname");
              return k0 && typeof k0.getNickname === "function" ? "Y" : "N";
            } catch {
              return "N";
            }
          })() +
          " banURL:" +
          (hasP("getUserBannerURL") ? "Y" : "N") +
          " recBan:" +
          (protoBan ? "Y" : "N") +
          " decURL:" +
          (hasP("getAvatarDecorationURL") ? "Y" : "N") +
          " recDec:" +
          (protoDec ? "Y" : "N") +
          " profile:" +
          (ups0 ? "Y" : "N") +
          " fetchP:" +
          (function () {
            try {
              const f0 = l.findByProps("fetchProfile");
              return f0 && typeof f0.fetchProfile === "function" ? "Y" : "N";
            } catch {
              return "N";
            }
          })() +
          " isCurUser:" +
          (hasP("isCurrentUser") ? "Y" : "N") +
          " isMe:" +
          (hasP("isMe") ? "Y" : "N");
      } catch {
        patchInfo = "(diagnostic failed)";
      }
      try {
        const s = l.findByProps("openUserContextMenu");
        s?.openUserContextMenu &&
          (D = y.after("openUserContextMenu", s, function (c) {
            const u = c[0]?.userId || c[0]?.user?.id;
            u && (e.storage.userId = u);
          }));
      } catch {}
      try {
        T = n.FluxDispatcher.subscribe("CHANNEL_SELECT", function (s) {
          const c = s?.channelId;
          c &&
            setTimeout(function () {
              return H(c);
            }, 500);
        });
      } catch {}
      const r = Y();
      (r &&
        setTimeout(function () {
          return H(r);
        }, 1e3),
        (function () {
          try {
            if (_ && typeof _.hideActionSheet === "function")
              E.push(
                y.after("hideActionSheet", _, function () {
                  try {
                    if (selfActive && Date.now() - selfAt > 400)
                      ((selfActive = !1), (selfId = null));
                  } catch {}
                }),
              );
          } catch {}
        })(),
        E.push(
          y.before("openLazy", _, function ([s, c, u]) {
            try {
              const profs = e.storage.profiles;
              if (profs && u) {
                let fid = null;
                const cands = [
                  u.userId,
                  u.user && u.user.id,
                  u.user && u.user.userId,
                ];
                for (let ci = 0; ci < cands.length; ci++) {
                  const cv = cands[ci];
                  if (cv && profs[cv] && profs[cv].self) {
                    fid = cv;
                    break;
                  }
                }
                if (!fid)
                  try {
                    for (const key in u) {
                      const val = u[key];
                      if (
                        typeof val === "string" &&
                        profs[val] &&
                        profs[val].self
                      ) {
                        fid = val;
                        break;
                      }
                      if (val && typeof val === "object") {
                        const sub = val.id || val.userId;
                        if (sub && profs[sub] && profs[sub].self) {
                          fid = sub;
                          break;
                        }
                      }
                    }
                  } catch {}
                if (fid) {
                  ((selfId = fid), (selfActive = !0), (selfAt = Date.now()));
                  setTimeout(function () {
                    ((selfActive = !1), (selfId = null));
                  }, 8000);
                }
              }
            } catch {}
            const t = u?.message;
            c !== "MessageLongPressActionSheet" ||
              !t ||
              s.then(function (d) {
                const i = y.after("default", d, function (g, h) {
                  setTimeout(i, 0);
                  const M = k.findInReactTree(h, function (m) {
                    return m?.[0]?.type?.name === "ActionSheetRow";
                  });
                  if (!M) return;
                  const o = j.getCurrentUser(),
                    a = G.getMessage(t.channel_id, t.id) ?? t;
                  if (
                    a.author.id === o.id ||
                    M.some(function (m) {
                      return m?.props?.label === "Edit Locally";
                    })
                  )
                    return;
                  const p = Math.max(
                      M.findIndex(function (m) {
                        return m.props.message === n.i18n.Messages.MARK_UNREAD;
                      }),
                      0,
                    ),
                    C = function () {
                      ((S = !0),
                        I.has(a.id) ||
                          I.set(a.id, JSON.parse(JSON.stringify(a))),
                        _.hideActionSheet(),
                        R.startEditMessage(a.channel_id, a.id, a.content));
                    };
                  M.splice(
                    p,
                    0,
                    n.React.createElement(w, {
                      label: "Edit Locally",
                      icon: n.React.createElement(w.Icon, {
                        source: B.getAssetIDByName("ic_edit_24px"),
                      }),
                      onPress: C,
                    }),
                  );
                  M.splice(
                    p,
                    0,
                    n.React.createElement(w, {
                      label: "Use as Fake User",
                      icon: n.React.createElement(w.Icon, {
                        source: B.getAssetIDByName("ic_members"),
                      }),
                      onPress: function () {
                        try {
                          e.storage.userId = a.author.id;
                          _.hideActionSheet();
                          tt(
                            "Fake user set: " +
                              (a.author.username || a.author.id),
                          );
                        } catch {}
                      },
                    }),
                  );
                });
              });
          }),
        ),
        E.push(
          y.before("editMessage", R, function (s) {
            const [c, u, t] = s;
            if (S) {
              const d = I.get(u);
              if (!d) return;
              const i = e.storage.savedMessages || [],
                g = i.find(function (h) {
                  return h.id === u;
                });
              return (
                g && ((g.content = t.content), L(i)),
                n.FluxDispatcher.dispatch({
                  type: "MESSAGE_UPDATE",
                  message: { ...d, content: t.content, edited_timestamp: null },
                  otherPluginBypass: !0,
                }),
                []
              );
            }
          }),
        ),
        E.push(
          y.after("endEditMessage", R, function () {
            S && (S = !1);
          }),
        ));
      try {
        prefetchSources();
      } catch {}
    },
    onUnload() {
      try {
        K.forEach(function (fn) {
          try {
            fn();
          } catch {}
        });
      } catch {}
      K = [];
      (D && (D(), (D = null)),
        T && (n.FluxDispatcher.unsubscribe("CHANNEL_SELECT", T), (T = null)),
        b && (b(), (b = null)),
        E.forEach(function (r) {
          return r();
        }),
        (E = []),
        I.clear());
    },
    settings: function (props) {
      const [tick, setTick] = n.React.useState(0);
      const [tab, setTab] = n.React.useState(0);
      const _scrollRef = n.React.useRef(null);
      const _RN = n.ReactNative || l.findByProps("ScrollView", "View");
      const _View = _RN && _RN.View;
      const _SV = _RN && _RN.ScrollView;
      const _Touch = (_RN && _RN.TouchableOpacity) || (_RN && _RN.Pressable);
      const _Text = _RN && _RN.Text;
      let _width = 380;
      try { if (_RN && _RN.Dimensions && _RN.Dimensions.get) _width = _RN.Dimensions.get("window").width || 380; } catch {}
      const _canSwipe = !!(_View && _SV && _Touch && _Text);
      let nav = null;
      try {
        if (NV && NV.useNavigation) nav = NV.useNavigation();
      } catch {}
      const r = e.storage.userId || "",
        s = e.storage.message || "",
        c = r ? F.getUser(r) : null,
        u = (e.storage.savedMessages || []).length,
        pid = e.storage.profileId || "",
        pname = e.storage.profileName || "",
        pavatar = e.storage.profileAvatar || "",
        psource = e.storage.profileSource || "",
        pjoined = e.storage.profileJoined || "",
        paccount = e.storage.profileAccount || "",
        psel = e.storage.profileSelf || !1,
        profs = e.storage.profiles || {},
        profKeys = Object.keys(profs),
        t = nowDate(),
        d = e.storage.customYear || t.getFullYear(),
        i = e.storage.customMonth || t.getMonth() + 1,
        g = e.storage.customDay || t.getDate(),
        h =
          e.storage.customHour !== void 0 ? e.storage.customHour : t.getHours(),
        M =
          e.storage.customMinute !== void 0
            ? e.storage.customMinute
            : t.getMinutes();
      return n.React.createElement(
        props && props.inSheet ? n.React.Fragment : v.Forms.Form,
        {},
        n.React.createElement(A, {
          label: "Local Message Spoofer",
          subLabel: "Local-only fake messages \u00b7 nothing leaves your device",
        }),
        n.React.createElement(A, {
          label: "Close Panel",
          leading: A.Icon
            ? n.React.createElement(A.Icon, {
                source: B.getAssetIDByName("ic_close"),
              })
            : void 0,
          onPress: function () {
            if (props && props.inSheet) {
              try {
                _.hideActionSheet();
              } catch {}
            } else {
              closePanel(nav);
            }
          },
        }),
        _canSwipe
          ? n.React.createElement(
              _View,
              { key: "pager" },
              n.React.createElement(
                _View,
                { style: { flexDirection: "row", paddingHorizontal: 6, marginBottom: 4 } },
                ["Message", "Time", "Convo", "Saved"].map(function (lbl, i) {
                  return n.React.createElement(
                    _Touch,
                    {
                      key: "tab" + i,
                      style: { flex: 1, paddingVertical: 9, alignItems: "center", borderBottomWidth: 2, borderBottomColor: tab === i ? "#5865f2" : "rgba(255,255,255,0.08)" },
                      onPress: function () { setTab(i); try { _scrollRef.current && _scrollRef.current.scrollTo({ x: i * _width, animated: true }); } catch {} },
                    },
                    n.React.createElement(_Text, { style: { color: tab === i ? "#ffffff" : "#949ba4", fontSize: 13, fontWeight: tab === i ? "600" : "400" } }, lbl)
                  );
                })
              ),
              n.React.createElement(
                _SV,
                { ref: _scrollRef, horizontal: true, pagingEnabled: true, showsHorizontalScrollIndicator: false, keyboardShouldPersistTaps: "handled", onMomentumScrollEnd: function (ev) { try { setTab(Math.round(ev.nativeEvent.contentOffset.x / _width)); } catch {} } },
                n.React.createElement(
                  _View,
                  { style: { width: _width } },
                  n.React.createElement(
                    _SV,
                    { style: { maxHeight: 520 }, contentContainerStyle: { paddingBottom: 160 }, keyboardShouldPersistTaps: "handled", nestedScrollEnabled: true },
        n.React.createElement(
          N,
          { title: "Fake Message" },
          n.React.createElement(f, {
            key: "uid" + tick,
            title: "User ID (Optional)",
            placeholder: "Leave empty to use current user",
            value: r,
            onChange: function (o) {
              e.storage.userId = o || "";
            },
            helperText: c
              ? `User: ${c.username} - use "them" in the builder`
              : r
                ? 'User not found (still usable as "them")'
                : "Will use your account",
          }),
          n.React.createElement(A, {
            label: "Fill from current chat",
            subLabel:
              "Grab the other person in this DM (or the last sender in this channel).",
            leading: A.Icon
              ? n.React.createElement(A.Icon, {
                  source: B.getAssetIDByName("ic_members"),
                })
              : void 0,
            onPress: function () {
              const id = fillFromChat();
              if (id) {
                e.storage.userId = id;
                setTick(function (kk) {
                  return kk + 1;
                });
                tt("Filled User ID: " + id);
              } else
                tt(
                  'Couldn\'t find a user here. Open a DM, or long-press a message and pick "Use as Fake User".',
                );
            },
          }),
          n.React.createElement(f, {
            title: "Message",
            placeholder: "Enter message content",
            value: s,
            onChange: function (o) {
              e.storage.message = o || "";
            },
            multiline: !0,
          }),
          n.React.createElement(f, {
            title: "Server ID for [server] tag (optional)",
            placeholder: "Paste a server ID; [server] becomes its name",
            value: e.storage.serverTagId || "",
            onChange: function (o) {
              e.storage.serverTagId = o || "";
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
          n.React.createElement(A, {
            label:
              "[server] = " +
              (resolveServerName(null, Y()) ||
                "(no match - join that server or recheck the ID)"),
            subLabel:
              "Type [server] in your message and it's swapped for the name when sent. Use [server:123] to name a specific server inline.",
          }),
          n.React.createElement(A, {
            label: "Use the server I'm in now",
            subLabel: "One tap - fills the box above with your current server.",
            onPress: function () {
              const ch = O && O.getChannel && O.getChannel(Y());
              const gid = ch && ch.guild_id;
              if (!gid) {
                tt("You're not in a server right now - open a server channel first.");
                return;
              }
              e.storage.serverTagId = gid;
              const g = Q && Q.getGuild && Q.getGuild(gid);
              tt('Set to "' + ((g && g.name) || gid) + '".');
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
          n.React.createElement(A, {
            label: e.storage.serverPickerOpen
              ? "Hide server list"
              : "Pick from my servers",
            subLabel: "Choose a server by name - no ID needed.",
            onPress: function () {
              e.storage.serverPickerOpen = !e.storage.serverPickerOpen;
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
          e.storage.serverPickerOpen
            ? (function () {
                let guilds = [];
                try {
                  const all = (Q && Q.getGuilds && Q.getGuilds()) || {};
                  guilds = Object.keys(all)
                    .map(function (k) {
                      return all[k];
                    })
                    .filter(function (g) {
                      return g && g.name;
                    });
                  guilds.sort(function (a, b) {
                    return ("" + a.name).localeCompare("" + b.name);
                  });
                } catch {}
                const sq = ("" + (e.storage.serverSearch || ""))
                  .trim()
                  .toLowerCase();
                if (sq)
                  guilds = guilds.filter(function (g) {
                    return ("" + g.name).toLowerCase().indexOf(sq) !== -1;
                  });
                const total = guilds.length,
                  shown = guilds.slice(0, 30),
                  rows = [
                    n.React.createElement(f, {
                      key: "ssearch",
                      title: "Search servers",
                      placeholder: "Type a server name",
                      value: e.storage.serverSearch || "",
                      onChange: function (o) {
                        e.storage.serverSearch = o || "";
                        setTick(function (kk) {
                          return kk + 1;
                        });
                      },
                    }),
                  ];
                if (!shown.length)
                  rows.push(
                    n.React.createElement(A, {
                      key: "snone",
                      label: sq ? "(no servers match)" : "(no servers found)",
                    }),
                  );
                shown.forEach(function (g) {
                  rows.push(
                    n.React.createElement(A, {
                      key: "g" + g.id,
                      label: g.name,
                      onPress: function () {
                        e.storage.serverTagId = g.id;
                        e.storage.serverPickerOpen = !1;
                        e.storage.serverSearch = "";
                        tt('Set to "' + g.name + '".');
                        setTick(function (kk) {
                          return kk + 1;
                        });
                      },
                    }),
                  );
                });
                if (total > shown.length)
                  rows.push(
                    n.React.createElement(A, {
                      key: "smore",
                      label:
                        total - shown.length + " more - keep typing to narrow",
                      subLabel: "Showing the first 30 matches.",
                    }),
                  );
                return rows;
              })()
            : null,
          n.React.createElement(A, {
            label: "Link Previews",
            subLabel:
              "Show embeds for links in fake messages (YouTube, websites, images).",
            trailing: n.React.createElement(v.Forms.FormSwitch, {
              value: e.storage.embedsEnabled !== !1,
              onValueChange: function (o) {
                e.storage.embedsEnabled = o;
              },
            }),
          }),
          n.React.createElement(A, {
            label: "Send Fake Message",
            subLabel: "Sends using the current timestamp settings.",
            leading: A.Icon
              ? n.React.createElement(A.Icon, {
                  source: B.getAssetIDByName("ic_send"),
                })
              : void 0,
            onPress: async function () {
              const o = Y(),
                a = (e.storage.message || "").trim();
              if (!a || !o) {
                tt("Enter a message and open a channel first.");
                return;
              }
              const p =
                (e.storage.userId || "").trim() || F.getCurrentUser()?.id;
              if (!p) return;
              const _nd = nowDate();
              const C = (
                e.storage.useUTC && !ukOn()
                  ? new Date(
                      Date.UTC(
                        e.storage.customYear || _nd.getFullYear(),
                        (e.storage.customMonth || _nd.getMonth() + 1) - 1,
                        e.storage.customDay || _nd.getDate(),
                        e.storage.customHour !== void 0 ? e.storage.customHour : _nd.getHours(),
                        e.storage.customMinute !== void 0 ? e.storage.customMinute : _nd.getMinutes(),
                        0, 0,
                      ),
                    )
                  : new Date(
                      e.storage.customYear || _nd.getFullYear(),
                      (e.storage.customMonth || _nd.getMonth() + 1) - 1,
                      e.storage.customDay || _nd.getDate(),
                      e.storage.customHour !== void 0 ? e.storage.customHour : _nd.getHours(),
                      e.storage.customMinute !== void 0 ? e.storage.customMinute : _nd.getMinutes(),
                      0, 0,
                    )
              ).toISOString();
              const m = genId(C);
              await P(o, p, a, C, m);
              z(o, p, a, m, C);
              tt("Fake message sent.");
            },
          }),
        )
                  )
                ),
                n.React.createElement(
                  _View,
                  { style: { width: _width } },
                  n.React.createElement(
                    _SV,
                    { style: { maxHeight: 520 }, contentContainerStyle: { paddingBottom: 160 }, keyboardShouldPersistTaps: "handled", nestedScrollEnabled: true },
        n.React.createElement(
          N,
          { title: "Custom Timestamp" },
          n.React.createElement(A, {
            label:
              "UK time (GMT/BST)" + (ukOn() ? " - ON" : " - off"),
            subLabel:
              "Automatic timestamps use UK time, and times you enter are treated as UK. Handles BST/GMT automatically.",
            trailing: n.React.createElement(v.Forms.FormSwitch, {
              value: ukOn(),
              onValueChange: function (o) {
                e.storage.ukTime = o;
                setTick(function (kk) {
                  return kk + 1;
                });
              },
            }),
          }),
          n.React.createElement(A, {
            label: ukOn()
              ? "UTC mode (ignored while UK is on)"
              : e.storage.useUTC
                ? "Using UTC Time"
                : "Using Local Time",
            subLabel: ukOn()
              ? "Turn off UK time above to use this."
              : e.storage.useUTC
                ? "Time will be the same for everyone"
                : "Time will adjust to viewer's timezone",
            trailing: n.React.createElement(v.Forms.FormSwitch, {
              value: e.storage.useUTC || !1,
              onValueChange: function (o) {
                e.storage.useUTC = o;
                setTick(function (kk) {
                  return kk + 1;
                });
              },
            }),
          }),
          n.React.createElement(f, {
            title: "Year",
            placeholder: "YYYY (e.g., 2024)",
            value: String(d),
            onChange: function (o) {
              const a = parseInt(o);
              e.storage.customYear = isNaN(a) ? t.getFullYear() : a;
            },
            keyboardType: "number-pad",
          }),
          n.React.createElement(f, {
            title: "Month",
            placeholder: "1-12",
            value: String(i),
            onChange: function (o) {
              const a = parseInt(o);
              e.storage.customMonth = isNaN(a)
                ? t.getMonth() + 1
                : Math.min(Math.max(a, 1), 12);
            },
            keyboardType: "number-pad",
          }),
          n.React.createElement(f, {
            title: "Day",
            placeholder: "1-31",
            value: String(g),
            onChange: function (o) {
              const a = parseInt(o);
              e.storage.customDay = isNaN(a)
                ? t.getDate()
                : Math.min(Math.max(a, 1), 31);
            },
            keyboardType: "number-pad",
          }),
          n.React.createElement(f, {
            title: "Hour",
            placeholder: "0-23",
            value: String(h),
            onChange: function (o) {
              const a = parseInt(o);
              e.storage.customHour = isNaN(a)
                ? t.getHours()
                : Math.min(Math.max(a, 0), 23);
            },
            keyboardType: "number-pad",
          }),
          n.React.createElement(f, {
            title: "Minute",
            placeholder: "0-59",
            value: String(M),
            onChange: function (o) {
              const a = parseInt(o);
              e.storage.customMinute = isNaN(a)
                ? t.getMinutes()
                : Math.min(Math.max(a, 0), 59);
            },
            keyboardType: "number-pad",
          }),
          n.React.createElement(A, {
            label: "Send Fake Message",
            subLabel: `${u} messages saved | Timestamp: ${d}-${String(i).padStart(2, "0")}-${String(g).padStart(2, "0")} ${String(h).padStart(2, "0")}:${String(M).padStart(2, "0")}`,
            onPress: async function () {
              const o = Y(),
                a = (e.storage.message || "").trim();
              if (!a || !o) return;
              const p =
                (e.storage.userId || "").trim() || F.getCurrentUser()?.id;
              if (!p) return;
              const C = (
                  e.storage.useUTC && !ukOn()
                    ? new Date(
                        Date.UTC(
                          e.storage.customYear || t.getFullYear(),
                          (e.storage.customMonth || t.getMonth() + 1) - 1,
                          e.storage.customDay || t.getDate(),
                          e.storage.customHour !== void 0
                            ? e.storage.customHour
                            : t.getHours(),
                          e.storage.customMinute !== void 0
                            ? e.storage.customMinute
                            : t.getMinutes(),
                          0,
                          0,
                        ),
                      )
                    : new Date(
                        e.storage.customYear || t.getFullYear(),
                        (e.storage.customMonth || t.getMonth() + 1) - 1,
                        e.storage.customDay || t.getDate(),
                        e.storage.customHour !== void 0
                          ? e.storage.customHour
                          : t.getHours(),
                        e.storage.customMinute !== void 0
                          ? e.storage.customMinute
                          : t.getMinutes(),
                        0,
                        0,
                      )
                ).toISOString(),
                m = genId(C);
              (await P(o, p, a, C, m),
                z(o, p, a, m, C),
                tt("Fake message sent."));
            },
          }),
        )
                  )
                ),
                n.React.createElement(
                  _View,
                  { style: { width: _width } },
                  n.React.createElement(
                    _SV,
                    { style: { maxHeight: 520 }, contentContainerStyle: { paddingBottom: 160 }, keyboardShouldPersistTaps: "handled", nestedScrollEnabled: true },
        n.React.createElement(
          N,
          { title: "Conversation Builder" },
          n.React.createElement(f, {
            title: "Conversation",
            placeholder:
              "One line each:\nuserId [time] [^reply] - message\n\nme = you  |  them = the User ID above\n^N = reply to line N  |  ^ = reply to previous\n\nExample:\nme [9pm] - hey\nthem [9:01pm] ^1 - hi back\nme ^ - lol",
            value: e.storage.conversationText || "",
            onChange: function (o) {
              e.storage.conversationText = o || "";
            },
            multiline: !0,
          }),
          n.React.createElement(A, {
            label: "Build Conversation",
            subLabel:
              "'me' = you, 'them' = the User ID above. Reply with ^N or ^ (previous). Time optional; untimed lines space 1 min apart.",
            onPress: async function () {
              await runConvo();
            },
          }),
          n.React.createElement(f, {
            title: "Save this conversation as (optional)",
            placeholder: "A name to find it later",
            value: e.storage.convoSaveName || "",
            onChange: function (o) {
              e.storage.convoSaveName = o || "";
            },
          }),
          n.React.createElement(A, {
            label: "Save conversation",
            subLabel:
              "Saves the text above on-device to reload later. Stays local.",
            onPress: function () {
              const txt = e.storage.conversationText || "";
              if (!txt.trim()) {
                tt("Nothing to save - the conversation box is empty.");
                return;
              }
              const arr = (e.storage.savedConvos || []).slice();
              const nm =
                ("" + (e.storage.convoSaveName || "")).trim() ||
                "Saved " + (arr.length + 1);
              arr.push({ name: nm, text: txt });
              e.storage.savedConvos = arr;
              e.storage.convoSaveName = "";
              tt('Saved "' + nm + '".');
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
          (e.storage.savedConvos || []).length
            ? n.React.createElement(A, {
                label: "Clear saved conversations",
                subLabel:
                  (e.storage.savedConvos || []).length +
                  " saved. Removes them all.",
                onPress: function () {
                  e.storage.savedConvos = [];
                  tt("Cleared saved conversations.");
                  setTick(function (kk) {
                    return kk + 1;
                  });
                },
              })
            : null,
          (e.storage.savedConvos || []).map(function (sc, idx) {
            return n.React.createElement(A, {
              key: "sc" + idx,
              label: sc.name,
              subLabel: "Tap to load this into the builder.",
              onPress: function () {
                e.storage.conversationText = sc.text || "";
                tt('Loaded "' + sc.name + '".');
                setTick(function (kk) {
                  return kk + 1;
                });
              },
            });
          }),
        )
                  )
                ),
                n.React.createElement(
                  _View,
                  { style: { width: _width } },
                  n.React.createElement(
                    _SV,
                    { style: { maxHeight: 520 }, contentContainerStyle: { paddingBottom: 160 }, keyboardShouldPersistTaps: "handled", nestedScrollEnabled: true },
        n.React.createElement(
          N,
          { title: "Saved Messages" },
          n.React.createElement(A, {
            label: "Clear Saved Messages",
            subLabel:
              u +
              " saved. These replay each time you reopen a channel - clearing stops that.",
            leading: A.Icon
              ? n.React.createElement(A.Icon, {
                  source: B.getAssetIDByName("ic_trash_24px"),
                })
              : void 0,
            onPress: function () {
              clearSaved();
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
          n.React.createElement(A, {
            label: "Remove All Spoofed Messages",
            subLabel:
              "Deletes every spoofed message from view now and clears the saved list.",
            leading: A.Icon
              ? n.React.createElement(A.Icon, {
                  source: B.getAssetIDByName("ic_trash_24px"),
                })
              : void 0,
            onPress: function () {
              removeAllFakes();
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
        )
                  )
                ),
              )
            )
          : n.React.createElement(
              n.React.Fragment,
              {},
        n.React.createElement(
          N,
          { title: "Fake Message" },
          n.React.createElement(f, {
            key: "uid" + tick,
            title: "User ID (Optional)",
            placeholder: "Leave empty to use current user",
            value: r,
            onChange: function (o) {
              e.storage.userId = o || "";
            },
            helperText: c
              ? `User: ${c.username} - use "them" in the builder`
              : r
                ? 'User not found (still usable as "them")'
                : "Will use your account",
          }),
          n.React.createElement(A, {
            label: "Fill from current chat",
            subLabel:
              "Grab the other person in this DM (or the last sender in this channel).",
            leading: A.Icon
              ? n.React.createElement(A.Icon, {
                  source: B.getAssetIDByName("ic_members"),
                })
              : void 0,
            onPress: function () {
              const id = fillFromChat();
              if (id) {
                e.storage.userId = id;
                setTick(function (kk) {
                  return kk + 1;
                });
                tt("Filled User ID: " + id);
              } else
                tt(
                  'Couldn\'t find a user here. Open a DM, or long-press a message and pick "Use as Fake User".',
                );
            },
          }),
          n.React.createElement(f, {
            title: "Message",
            placeholder: "Enter message content",
            value: s,
            onChange: function (o) {
              e.storage.message = o || "";
            },
            multiline: !0,
          }),
          n.React.createElement(f, {
            title: "Server ID for [server] tag (optional)",
            placeholder: "Paste a server ID; [server] becomes its name",
            value: e.storage.serverTagId || "",
            onChange: function (o) {
              e.storage.serverTagId = o || "";
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
          n.React.createElement(A, {
            label:
              "[server] = " +
              (resolveServerName(null, Y()) ||
                "(no match - join that server or recheck the ID)"),
            subLabel:
              "Type [server] in your message and it's swapped for the name when sent. Use [server:123] to name a specific server inline.",
          }),
          n.React.createElement(A, {
            label: "Use the server I'm in now",
            subLabel: "One tap - fills the box above with your current server.",
            onPress: function () {
              const ch = O && O.getChannel && O.getChannel(Y());
              const gid = ch && ch.guild_id;
              if (!gid) {
                tt("You're not in a server right now - open a server channel first.");
                return;
              }
              e.storage.serverTagId = gid;
              const g = Q && Q.getGuild && Q.getGuild(gid);
              tt('Set to "' + ((g && g.name) || gid) + '".');
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
          n.React.createElement(A, {
            label: e.storage.serverPickerOpen
              ? "Hide server list"
              : "Pick from my servers",
            subLabel: "Choose a server by name - no ID needed.",
            onPress: function () {
              e.storage.serverPickerOpen = !e.storage.serverPickerOpen;
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
          e.storage.serverPickerOpen
            ? (function () {
                let guilds = [];
                try {
                  const all = (Q && Q.getGuilds && Q.getGuilds()) || {};
                  guilds = Object.keys(all)
                    .map(function (k) {
                      return all[k];
                    })
                    .filter(function (g) {
                      return g && g.name;
                    });
                  guilds.sort(function (a, b) {
                    return ("" + a.name).localeCompare("" + b.name);
                  });
                } catch {}
                const sq = ("" + (e.storage.serverSearch || ""))
                  .trim()
                  .toLowerCase();
                if (sq)
                  guilds = guilds.filter(function (g) {
                    return ("" + g.name).toLowerCase().indexOf(sq) !== -1;
                  });
                const total = guilds.length,
                  shown = guilds.slice(0, 30),
                  rows = [
                    n.React.createElement(f, {
                      key: "ssearch",
                      title: "Search servers",
                      placeholder: "Type a server name",
                      value: e.storage.serverSearch || "",
                      onChange: function (o) {
                        e.storage.serverSearch = o || "";
                        setTick(function (kk) {
                          return kk + 1;
                        });
                      },
                    }),
                  ];
                if (!shown.length)
                  rows.push(
                    n.React.createElement(A, {
                      key: "snone",
                      label: sq ? "(no servers match)" : "(no servers found)",
                    }),
                  );
                shown.forEach(function (g) {
                  rows.push(
                    n.React.createElement(A, {
                      key: "g" + g.id,
                      label: g.name,
                      onPress: function () {
                        e.storage.serverTagId = g.id;
                        e.storage.serverPickerOpen = !1;
                        e.storage.serverSearch = "";
                        tt('Set to "' + g.name + '".');
                        setTick(function (kk) {
                          return kk + 1;
                        });
                      },
                    }),
                  );
                });
                if (total > shown.length)
                  rows.push(
                    n.React.createElement(A, {
                      key: "smore",
                      label:
                        total - shown.length + " more - keep typing to narrow",
                      subLabel: "Showing the first 30 matches.",
                    }),
                  );
                return rows;
              })()
            : null,
          n.React.createElement(A, {
            label: "Link Previews",
            subLabel:
              "Show embeds for links in fake messages (YouTube, websites, images).",
            trailing: n.React.createElement(v.Forms.FormSwitch, {
              value: e.storage.embedsEnabled !== !1,
              onValueChange: function (o) {
                e.storage.embedsEnabled = o;
              },
            }),
          }),
        ),
        n.React.createElement(
          N,
          { title: "Custom Timestamp" },
          n.React.createElement(A, {
            label:
              "UK time (GMT/BST)" + (ukOn() ? " - ON" : " - off"),
            subLabel:
              "Automatic timestamps use UK time, and times you enter are treated as UK. Handles BST/GMT automatically.",
            trailing: n.React.createElement(v.Forms.FormSwitch, {
              value: ukOn(),
              onValueChange: function (o) {
                e.storage.ukTime = o;
                setTick(function (kk) {
                  return kk + 1;
                });
              },
            }),
          }),
          n.React.createElement(A, {
            label: ukOn()
              ? "UTC mode (ignored while UK is on)"
              : e.storage.useUTC
                ? "Using UTC Time"
                : "Using Local Time",
            subLabel: ukOn()
              ? "Turn off UK time above to use this."
              : e.storage.useUTC
                ? "Time will be the same for everyone"
                : "Time will adjust to viewer's timezone",
            trailing: n.React.createElement(v.Forms.FormSwitch, {
              value: e.storage.useUTC || !1,
              onValueChange: function (o) {
                e.storage.useUTC = o;
                setTick(function (kk) {
                  return kk + 1;
                });
              },
            }),
          }),
          n.React.createElement(f, {
            title: "Year",
            placeholder: "YYYY (e.g., 2024)",
            value: String(d),
            onChange: function (o) {
              const a = parseInt(o);
              e.storage.customYear = isNaN(a) ? t.getFullYear() : a;
            },
            keyboardType: "number-pad",
          }),
          n.React.createElement(f, {
            title: "Month",
            placeholder: "1-12",
            value: String(i),
            onChange: function (o) {
              const a = parseInt(o);
              e.storage.customMonth = isNaN(a)
                ? t.getMonth() + 1
                : Math.min(Math.max(a, 1), 12);
            },
            keyboardType: "number-pad",
          }),
          n.React.createElement(f, {
            title: "Day",
            placeholder: "1-31",
            value: String(g),
            onChange: function (o) {
              const a = parseInt(o);
              e.storage.customDay = isNaN(a)
                ? t.getDate()
                : Math.min(Math.max(a, 1), 31);
            },
            keyboardType: "number-pad",
          }),
          n.React.createElement(f, {
            title: "Hour",
            placeholder: "0-23",
            value: String(h),
            onChange: function (o) {
              const a = parseInt(o);
              e.storage.customHour = isNaN(a)
                ? t.getHours()
                : Math.min(Math.max(a, 0), 23);
            },
            keyboardType: "number-pad",
          }),
          n.React.createElement(f, {
            title: "Minute",
            placeholder: "0-59",
            value: String(M),
            onChange: function (o) {
              const a = parseInt(o);
              e.storage.customMinute = isNaN(a)
                ? t.getMinutes()
                : Math.min(Math.max(a, 0), 59);
            },
            keyboardType: "number-pad",
          }),
          n.React.createElement(A, {
            label: "Send Fake Message",
            subLabel: `${u} messages saved | Timestamp: ${d}-${String(i).padStart(2, "0")}-${String(g).padStart(2, "0")} ${String(h).padStart(2, "0")}:${String(M).padStart(2, "0")}`,
            onPress: async function () {
              const o = Y(),
                a = (e.storage.message || "").trim();
              if (!a || !o) return;
              const p =
                (e.storage.userId || "").trim() || F.getCurrentUser()?.id;
              if (!p) return;
              const C = (
                  e.storage.useUTC && !ukOn()
                    ? new Date(
                        Date.UTC(
                          e.storage.customYear || t.getFullYear(),
                          (e.storage.customMonth || t.getMonth() + 1) - 1,
                          e.storage.customDay || t.getDate(),
                          e.storage.customHour !== void 0
                            ? e.storage.customHour
                            : t.getHours(),
                          e.storage.customMinute !== void 0
                            ? e.storage.customMinute
                            : t.getMinutes(),
                          0,
                          0,
                        ),
                      )
                    : new Date(
                        e.storage.customYear || t.getFullYear(),
                        (e.storage.customMonth || t.getMonth() + 1) - 1,
                        e.storage.customDay || t.getDate(),
                        e.storage.customHour !== void 0
                          ? e.storage.customHour
                          : t.getHours(),
                        e.storage.customMinute !== void 0
                          ? e.storage.customMinute
                          : t.getMinutes(),
                        0,
                        0,
                      )
                ).toISOString(),
                m = genId(C);
              (await P(o, p, a, C, m),
                z(o, p, a, m, C),
                tt("Fake message sent."));
            },
          }),
        ),
        n.React.createElement(
          N,
          { title: "Conversation Builder" },
          n.React.createElement(f, {
            title: "Conversation",
            placeholder:
              "One line each:\nuserId [time] [^reply] - message\n\nme = you  |  them = the User ID above\n^N = reply to line N  |  ^ = reply to previous\n\nExample:\nme [9pm] - hey\nthem [9:01pm] ^1 - hi back\nme ^ - lol",
            value: e.storage.conversationText || "",
            onChange: function (o) {
              e.storage.conversationText = o || "";
            },
            multiline: !0,
          }),
          n.React.createElement(A, {
            label: "Build Conversation",
            subLabel:
              "'me' = you, 'them' = the User ID above. Reply with ^N or ^ (previous). Time optional; untimed lines space 1 min apart.",
            onPress: async function () {
              await runConvo();
            },
          }),
          n.React.createElement(f, {
            title: "Save this conversation as (optional)",
            placeholder: "A name to find it later",
            value: e.storage.convoSaveName || "",
            onChange: function (o) {
              e.storage.convoSaveName = o || "";
            },
          }),
          n.React.createElement(A, {
            label: "Save conversation",
            subLabel:
              "Saves the text above on-device to reload later. Stays local.",
            onPress: function () {
              const txt = e.storage.conversationText || "";
              if (!txt.trim()) {
                tt("Nothing to save - the conversation box is empty.");
                return;
              }
              const arr = (e.storage.savedConvos || []).slice();
              const nm =
                ("" + (e.storage.convoSaveName || "")).trim() ||
                "Saved " + (arr.length + 1);
              arr.push({ name: nm, text: txt });
              e.storage.savedConvos = arr;
              e.storage.convoSaveName = "";
              tt('Saved "' + nm + '".');
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
          (e.storage.savedConvos || []).length
            ? n.React.createElement(A, {
                label: "Clear saved conversations",
                subLabel:
                  (e.storage.savedConvos || []).length +
                  " saved. Removes them all.",
                onPress: function () {
                  e.storage.savedConvos = [];
                  tt("Cleared saved conversations.");
                  setTick(function (kk) {
                    return kk + 1;
                  });
                },
              })
            : null,
          (e.storage.savedConvos || []).map(function (sc, idx) {
            return n.React.createElement(A, {
              key: "sc" + idx,
              label: sc.name,
              subLabel: "Tap to load this into the builder.",
              onPress: function () {
                e.storage.conversationText = sc.text || "";
                tt('Loaded "' + sc.name + '".');
                setTick(function (kk) {
                  return kk + 1;
                });
              },
            });
          }),
        ),
        n.React.createElement(
          N,
          { title: "Saved Messages" },
          n.React.createElement(A, {
            label: "Clear Saved Messages",
            subLabel:
              u +
              " saved. These replay each time you reopen a channel - clearing stops that.",
            leading: A.Icon
              ? n.React.createElement(A.Icon, {
                  source: B.getAssetIDByName("ic_trash_24px"),
                })
              : void 0,
            onPress: function () {
              clearSaved();
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
          n.React.createElement(A, {
            label: "Remove All Spoofed Messages",
            subLabel:
              "Deletes every spoofed message from view now and clears the saved list.",
            leading: A.Icon
              ? n.React.createElement(A.Icon, {
                  source: B.getAssetIDByName("ic_trash_24px"),
                })
              : void 0,
            onPress: function () {
              removeAllFakes();
              setTick(function (kk) {
                return kk + 1;
              });
            },
          }),
        )
            )
      );
    },
  };
  return (
    (U.default = J),
    Object.defineProperty(U, "__esModule", { value: !0 }),
    U
  );
})(
  {},
  vendetta.metro.common,
  vendetta.metro,
  vendetta.ui.components,
  vendetta.plugin,
  vendetta.patcher,
  vendetta.ui.assets,
  vendetta.utils,
);
