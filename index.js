(function (exports, common, metro, components, plugin, patcher, assets, utils) {
  "use strict";

  const DEBUG = true;
  function log(...args) {
    if (DEBUG) console.log("[Spoofer]", ...args);
  }
  function warn(...args) {
    if (DEBUG) console.warn("[Spoofer]", ...args);
  }

  // ─── Module References (null-safe: must never throw at load) ─────────────────

  const _loadErrors = [];

  const Forms = (components && components.Forms) || {};

  // Newer Discord builds removed components.Forms - try to recover the pieces
  let _FormSection = Forms.FormSection;
  let _FormInput = Forms.FormInput;
  let _FormRow = Forms.FormRow;
  let _FormSwitch = Forms.FormSwitch;
  let _FormDivider = Forms.FormDivider;

  if (!_FormRow) {
    try {
      const alt = metro.findByProps("FormRow", "FormSection")
        || metro.findByProps("FormRow")
        || null;
      if (alt) {
        _FormSection = _FormSection || alt.FormSection;
        _FormInput = _FormInput || alt.FormInput;
        _FormRow = _FormRow || alt.FormRow;
        _FormSwitch = _FormSwitch || alt.FormSwitch;
        _FormDivider = _FormDivider || alt.FormDivider;
      }
    } catch {}
  }
  // if FormSwitch is missing, try dedicated module
  if (!_FormSwitch) {
    try { _FormSwitch = metro.findByProps("FormSwitch")?.FormSwitch; } catch {}
  }

  const FormSection = _FormSection;
  const FormInput = _FormInput;
  const FormRow = _FormRow;
  const FormSwitch = _FormSwitch;
  const FormContainer = Forms.Form || common?.React?.Fragment;
  if (!_FormRow) _loadErrors.push("Forms.FormRow");

  const UserStore = metro.findByProps("getCurrentUser", "getUser");
  const ChannelModule = metro.findByProps("getChannel", "getChannelId");
  const ChannelSelection = metro.findByProps("getChannelId", "getLastSelectedChannelId");
  const ActionSheetModule = metro.findByProps("openLazy", "hideActionSheet");
  const ActionSheetRow = metro.findByProps("ActionSheetRow")?.ActionSheetRow ?? Forms.FormRow;
  const MessageStore = metro.findByStoreName("MessageStore");
  const UserStoreByName = metro.findByStoreName("UserStore");
  const MessageActions = metro.findByProps("sendMessage", "startEditMessage", "editMessage");
  const ToastModule = metro.findByProps("showToast");
  const NavigationModule = metro.findByProps("useNavigation");
  const GuildStore = metro.findByStoreName("GuildStore");

  // resilient FluxDispatcher - some builds don't expose it on common
  const FluxDispatcher = (common && common.FluxDispatcher)
    || metro.findByProps("dispatch", "subscribe", "_actionHandlers")
    || metro.findByProps("dispatch", "register")
    || null;

  function dispatchFlux(payload) {
    if (!FluxDispatcher || typeof FluxDispatcher.dispatch !== "function") {
      showToast("[Spoofer] FluxDispatcher not found on this build");
      return false;
    }
    try {
      FluxDispatcher.dispatch(payload);
      return true;
    } catch (err) {
      warn("dispatch failed", err);
      showToast("[Spoofer] dispatch error: " + (err.message || "unknown"));
      return false;
    }
  }

  // ─── State ───────────────────────────────────────────────────────────────────

  const originalMessages = new Map();
  const resolving = new Set();
  const avatarSourceCache = new Map();
  const EMPTY = {};

  let isLocalEditing = false;
  let selfActive = false;
  let selfId = null;
  let selfAt = 0;
  let cachedCurrentUser = null;
  let cachedCurrentUserId = null;
  let cachedCurrentUserProxy = null;
  let lastSnowflake = 0;
  let fetchProfileModule;

  let contextMenuPatch = null;
  let channelSelectSub = null;
  let patches = [];
  let dispatchGuard = null;
  let cleanupCallbacks = [];
  let patchInfo = "(not loaded)";

  // ─── Utilities ───────────────────────────────────────────────────────────────

  function genId(timestamp) {
    let snowflake = (new Date(timestamp).getTime() - 1420070400000) * 4194304;
    if (snowflake <= lastSnowflake) snowflake = lastSnowflake + 8192;
    lastSnowflake = snowflake;
    return snowflake.toString();
  }

  function lastSundayDate(year, month1) {
    const last = new Date(Date.UTC(year, month1, 0));
    return last.getUTCDate() - last.getUTCDay();
  }

  function ukIsBST(date) {
    const y = date.getUTCFullYear();
    const start = Date.UTC(y, 2, lastSundayDate(y, 3), 1, 0, 0);
    const end = Date.UTC(y, 9, lastSundayDate(y, 10), 1, 0, 0);
    const ms = date.getTime();
    return ms >= start && ms < end;
  }

  function ukNowDate() {
    const now = new Date();
    const offsetMinutes = ukIsBST(now) ? 60 : 0;
    const shifted = new Date(now.getTime() + offsetMinutes * 60000);
    return new Date(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      shifted.getUTCHours(),
      shifted.getUTCMinutes(),
      shifted.getUTCSeconds(),
      shifted.getUTCMilliseconds(),
    );
  }

  function isUkTimeEnabled() {
    try {
      return plugin.storage.ukTime !== false;
    } catch {
      return true;
    }
  }

  function nowDate() {
    return isUkTimeEnabled() ? ukNowDate() : new Date();
  }

  function nowISO() {
    return nowDate().toISOString();
  }

  function extractId(input) {
    try {
      if (!input) return null;
      if (typeof input === "string") return /^\d+$/.test(input) ? input : null;
      if (input.id) return input.id;
      if (input.userId) return input.userId;
      if (input.user && input.user.id) return input.user.id;
    } catch (err) {
      warn("extractId failed", err);
    }
    return null;
  }

  function forceSet(obj, key, value) {
    if (!obj) return;
    try {
      obj[key] = value;
    } catch {}
    try {
      if (obj[key] !== value)
        Object.defineProperty(obj, key, {
          value,
          writable: true,
          configurable: true,
          enumerable: true,
        });
    } catch {}
  }

  function forceNull(obj, key) {
    try {
      if (!(key in obj)) return;
    } catch {
      return;
    }
    forceSet(obj, key, null);
  }

  function showToast(message) {
    try {
      ToastModule?.showToast?.(message);
    } catch (err) {
      warn("showToast failed", err);
    }
  }

  function getCurrentChannelId() {
    // try every known way to get the current channel
    try {
      const a = ChannelSelection?.getChannelId?.();
      if (a) return a;
    } catch {}
    try {
      const b = ChannelModule?.getChannelId?.();
      if (b) return b;
    } catch {}
    try {
      const sel = metro.findByProps("getLastSelectedChannelId");
      const c = sel?.getChannelId?.() || sel?.getLastSelectedChannelId?.();
      if (c) return c;
    } catch {}
    try {
      const sel2 = metro.findByProps("getCurrentlySelectedChannelId");
      const d = sel2?.getCurrentlySelectedChannelId?.();
      if (d) return d;
    } catch {}
    return null;
  }

  // ─── Date Parsing ───────────────────────────────────────────────────────────

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
      const yr = +m[1], mo = +m[2], dy = +m[3];
      const d = new Date(yr, mo - 1, dy);
      if (!isNaN(d.getTime()) && d.getMonth() === mo - 1 && d.getDate() === dy)
        return d;
      return null;
    }

    m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      let dy = a, mo = b;
      if (mo > 12 && dy <= 12) { dy = b; mo = a; }
      const d = new Date(y, mo - 1, dy);
      if (!isNaN(d.getTime()) && d.getMonth() === mo - 1 && d.getDate() === dy)
        return d;
      return null;
    }

    const fallback = new Date(str);
    if (!isNaN(fallback.getTime())) return fallback;
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

  function mkISO(year, month, day, hour, minute, useUTC) {
    const dt = useUTC
      ? new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
      : new Date(year, month - 1, day, hour, minute, 0, 0);
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
      let h = +m[1];
      const mi = m[2] ? +m[2] : 0;
      const ap = m[3].toLowerCase();
      if (ap === "pm" && h !== 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      return mkISO(base.y, base.mo, base.d, h, mi, useUTC);
    }

    if ((m = s.match(/^(\d{1,2}):(\d{2})$/)))
      return mkISO(base.y, base.mo, base.d, +m[1], +m[2], useUTC);

    return null;
  }

  // ─── Profile Resolution ─────────────────────────────────────────────────────

  function hasAnyProfile() {
    const profiles = plugin.storage.profiles;
    if (!profiles) return false;
    for (const k in profiles) return true;
    return false;
  }

  function firstProfiledId(args) {
    if (!args || !hasAnyProfile()) return null;
    const profiles = plugin.storage.profiles || EMPTY;
    for (let i = 0; i < args.length; i++) {
      const id = extractId(args[i]);
      if (id && profiles[id]) return id;
    }
    return null;
  }

  function getProfile(uid) {
    return (plugin.storage.profiles || EMPTY)[uid] || null;
  }

  function resolveJoined(uid) {
    const prof = getProfile(uid);
    if (!prof) return null;
    if (prof.joinedAt) return prof.joinedAt;
    if (prof.sourceId) {
      const d = createdAtFromId(prof.sourceId);
      if (d) return d.toISOString();
    }
    return null;
  }

  function resolveCreated(uid) {
    const prof = getProfile(uid);
    if (!prof) return null;
    if (prof.accountDate) {
      const d = new Date(prof.accountDate);
      if (!isNaN(d.getTime())) return d;
    }
    if (prof.sourceId) return createdAtFromId(prof.sourceId);
    return null;
  }

  function resolveName(uid) {
    const prof = getProfile(uid);
    if (!prof) return null;
    if (prof.name) return prof.name;
    if (prof.sourceId && !resolving.has(uid)) {
      resolving.add(uid);
      try {
        const src = UserStoreByName.getUser(prof.sourceId);
        if (src) return src.globalName || src.global_name || src.username || null;
      } catch (err) {
        warn("resolveName lookup failed", err);
      } finally {
        resolving.delete(uid);
      }
    }
    return null;
  }

  function resolveUsername(uid) {
    const prof = getProfile(uid);
    if (!prof) return null;
    if (prof.sourceId && !resolving.has(uid)) {
      resolving.add(uid);
      try {
        const src = UserStoreByName.getUser(prof.sourceId);
        if (src) return src.username || null;
      } catch (err) {
        warn("resolveUsername lookup failed", err);
      } finally {
        resolving.delete(uid);
      }
    }
    return prof.name || null;
  }

  function resolveAvatar(uid) {
    const prof = getProfile(uid);
    if (!prof) return null;
    if (prof.sourceId && !resolving.has(uid)) {
      resolving.add(uid);
      try {
        const src = UserStoreByName.getUser(prof.sourceId);
        if (src && typeof src.getAvatarURL === "function") {
          const url = src.getAvatarURL();
          if (url) return url;
        }
      } catch (err) {
        warn("resolveAvatar lookup failed", err);
      } finally {
        resolving.delete(uid);
      }
    }
    return prof.avatar || null;
  }

  function mirrorSource(id, ret) {
    const uri = resolveAvatar(id);
    if (!uri) return ret;
    const prev = avatarSourceCache.get(id);
    if (prev && prev.uri === uri) return prev.obj;
    const obj = (ret && typeof ret === "object")
      ? Object.assign({}, ret, { uri })
      : { uri };
    avatarSourceCache.set(id, { uri, obj });
    return obj;
  }

  function resolveBanner(uid) {
    const prof = getProfile(uid);
    if (!prof || !prof.sourceId) return null;
    const key = "b" + uid;
    if (resolving.has(key)) return null;
    resolving.add(key);
    try {
      const src = UserStoreByName.getUser(prof.sourceId);
      if (src && typeof src.getBannerURL === "function") {
        let url;
        try { url = src.getBannerURL({ size: 2048 }); } catch {}
        if (!url) try { url = src.getBannerURL(); } catch {}
        if (url) return url;
      }
      let bannerHash = src && src.banner;
      if (!bannerHash) {
        try {
          const UPS = metro.findByStoreName("UserProfileStore");
          const sp = UPS && UPS.getUserProfile(prof.sourceId);
          if (sp && sp.banner) bannerHash = sp.banner;
        } catch {}
      }
      if (bannerHash) {
        const ext = ("" + bannerHash).indexOf("a_") === 0 ? "gif" : "png";
        return `https://cdn.discordapp.com/banners/${prof.sourceId}/${bannerHash}.${ext}?size=2048`;
      }
    } catch (err) {
      warn("resolveBanner failed", err);
    } finally {
      resolving.delete(key);
    }
    return null;
  }

  function resolveAccent(uid) {
    const prof = getProfile(uid);
    if (!prof || !prof.sourceId) return null;
    const key = "a" + uid;
    if (resolving.has(key)) return null;
    resolving.add(key);
    try {
      const src = UserStoreByName.getUser(prof.sourceId);
      if (src && src.accentColor != null) return src.accentColor;
    } catch (err) {
      warn("resolveAccent failed", err);
    } finally {
      resolving.delete(key);
    }
    return null;
  }

  function mkAuthor(uid) {
    let user = null;
    try { user = UserStoreByName.getUser(uid); } catch {}
    const displayName = resolveName(uid);
    const username = resolveUsername(uid);
    const avatar = resolveAvatar(uid);
    return {
      id: uid,
      username: username || (user ? user.username : "FakeUser"),
      global_name: displayName || (user ? user.globalName || user.global_name || null : null),
      discriminator: user ? user.discriminator : "0001",
      avatar: avatar || (user ? user.avatar : null),
      bot: user ? user.bot : false,
    };
  }

  // ─── Self-Profile Spoofing ──────────────────────────────────────────────────

  function spoofCurrentUser(real, id) {
    try {
      if (cachedCurrentUserProxy && cachedCurrentUser === real && cachedCurrentUserId === id)
        return cachedCurrentUserProxy;

      const desc = Object.getOwnPropertyDescriptors(real);
      delete desc.id;
      const clone = Object.create(Object.getPrototypeOf(real), desc);
      Object.defineProperty(clone, "id", {
        value: id,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      try {
        const created = resolveCreated(id);
        if (created) forceSet(clone, "createdAt", created);
      } catch {}

      cachedCurrentUser = real;
      cachedCurrentUserId = id;
      cachedCurrentUserProxy = clone;
      return clone;
    } catch {
      return real;
    }
  }

  // ─── Server Tag Resolution ──────────────────────────────────────────────────

  function resolveServerName(inlineId, channelId) {
    try {
      let id = inlineId;
      if (!id) id = ("" + (plugin.storage.serverTagId || "")).trim();
      if (!id) {
        const ch = ChannelModule?.getChannel?.(channelId);
        id = ch && ch.guild_id;
      }
      if (id && GuildStore?.getGuild) {
        const guild = GuildStore.getGuild(id);
        if (guild && guild.name) return guild.name;
      }
    } catch {}
    return null;
  }

  function applyServerTags(content, channelId) {
    if (!content || content.indexOf("[server") === -1) return content;
    let out = content.replace(/\[server:(\d{5,25})\]/gi, (match, id) => {
      return resolveServerName(id, channelId) || match;
    });
    out = out.replace(/\[server\]/gi, (match) => {
      return resolveServerName(null, channelId) || match;
    });
    return out;
  }

  // ─── Network Helpers ────────────────────────────────────────────────────────

  async function fetchWithTimeout(url, ms, opts) {
    const timeout = ms || 8000;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => {
      try { controller?.abort(); } catch {}
    }, timeout);

    try {
      const fetchOpts = Object.assign({}, opts, controller ? { signal: controller.signal } : {});
      const racePromises = [fetch(url, fetchOpts)];

      if (!controller) {
        racePromises.push(
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeout))
        );
      }

      return await Promise.race(racePromises);
    } finally {
      clearTimeout(timer);
    }
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

  function metaTag(html, prop) {
    try {
      const escapedProp = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let m = html.match(
        new RegExp(
          '<meta[^>]+(?:property|name)=["\']' + escapedProp + '["\'][^>]*?content=["\']([^"\']*)["\']', "i"
        ),
      );
      if (m && m[1]) return decodeEntities(m[1]);
      m = html.match(
        new RegExp(
          '<meta[^>]+content=["\']([^"\']*)["\'][^>]*?(?:property|name)=["\']' + escapedProp + '["\']', "i"
        ),
      );
      if (m && m[1]) return decodeEntities(m[1]);
    } catch {}
    return null;
  }

  // ─── Embed Fetching ─────────────────────────────────────────────────────────

  function extractYouTubeId(url) {
    let m;
    if ((m = url.match(/[?&]v=([\w-]{11})/))) return m[1];
    if ((m = url.match(/youtu\.be\/([\w-]{11})/))) return m[1];
    if ((m = url.match(/youtube\.com\/shorts\/([\w-]{11})/))) return m[1];
    if ((m = url.match(/youtube\.com\/embed\/([\w-]{11})/))) return m[1];
    if ((m = url.match(/youtube\.com\/live\/([\w-]{11})/))) return m[1];
    return null;
  }

  async function fetchYouTubeEmbed(url) {
    const vid = extractYouTubeId(url);
    let data = {};
    try {
      const res = await fetchWithTimeout(
        "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url),
        8000,
      );
      if (res && res.ok) data = await res.json();
    } catch {}

    if (!vid && !data.title) return null;

    const w = data.thumbnail_width || 1280;
    const h = data.thumbnail_height || 720;
    const embed = {
      type: vid ? "video" : "rich",
      url,
      color: 0xff0000,
      provider: { name: "YouTube", url: "https://www.youtube.com" },
    };

    if (data.title) embed.title = ("" + data.title).slice(0, 256);
    if (data.author_name) embed.author = { name: data.author_name, url: data.author_url };

    const thumb = data.thumbnail_url || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : null);
    if (thumb) embed.thumbnail = { url: thumb, proxy_url: thumb, width: w, height: h };
    if (vid) embed.video = { url: `https://www.youtube.com/embed/${vid}`, width: 1280, height: 720 };

    return embed;
  }

  async function fetchOpenGraphEmbed(url) {
    try {
      const res = await fetchWithTimeout(url, 8000, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
        },
      });
      if (!res || !res.ok) return null;

      let html = await res.text();
      if (html && html.length > 600000) html = html.slice(0, 600000);

      const title = metaTag(html, "og:title")
        || metaTag(html, "twitter:title")
        || (() => { const m = html.match(/<title[^>]*>([^<]*)<\/title>/i); return m ? decodeEntities(m[1]) : null; })();

      const desc = metaTag(html, "og:description")
        || metaTag(html, "twitter:description")
        || metaTag(html, "description");

      const image = metaTag(html, "og:image")
        || metaTag(html, "og:image:url")
        || metaTag(html, "twitter:image");

      const site = metaTag(html, "og:site_name");

      if (!title && !desc && !image) return null;

      const embed = { type: "rich", url, color: 0x4f545c };
      if (title) embed.title = title.slice(0, 256);
      if (desc) embed.description = desc.slice(0, 350);
      if (site) embed.footer = { text: site };
      if (image) embed.image = { url: image, proxy_url: image };

      return embed;
    } catch {
      return null;
    }
  }

  async function fetchSingleEmbed(url) {
    try {
      if (/(?:youtube\.com\/watch\?|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)/i.test(url))
        return await fetchYouTubeEmbed(url);
      if (/\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(url))
        return { type: "image", url, image: { url, proxy_url: url } };
      return await fetchOpenGraphEmbed(url);
    } catch {
      return null;
    }
  }

  async function fetchAllEmbeds(content) {
    const results = [];
    try {
      const urls = ("" + (content || "")).match(/https?:\/\/[^\s<>]+/g) || [];
      const seen = new Set();
      for (let i = 0; i < urls.length && results.length < 4; i++) {
        const url = urls[i].replace(/[)\]\.,!?'"]+$/, "");
        if (seen.has(url)) continue;
        seen.add(url);
        const embed = await fetchSingleEmbed(url);
        if (embed) results.push(embed);
      }
    } catch {}
    return results;
  }

  function attachLinkEmbeds(channelId, message, content) {
    try {
      if (plugin.storage.embedsEnabled === false) return;
      if (!/https?:\/\//i.test("" + (content || ""))) return;

      fetchAllEmbeds(content)
        .then((embeds) => {
          if (!embeds || !embeds.length) return;
          try {
            dispatchFlux({
              type: "MESSAGE_UPDATE",
              message: Object.assign({}, message, { embeds }),
              otherPluginBypass: true,
            });
          } catch {}
        })
        .catch(() => {});
    } catch {}
  }

  // ─── Message Creation & Storage ─────────────────────────────────────────────

  async function createFakeMessage(channelId, userId, content, timestamp, messageId, replyRef) {
    content = applyServerTags(content, channelId);
    const id = messageId || genId(timestamp || nowISO());

    try {
      const ts = timestamp || nowISO();
      const message = {
        id,
        type: 0,
        channel_id: channelId,
        author: mkAuthor(userId),
        content,
        nonce: id,
        mentions: [],
        mention_roles: [],
        pinned: false,
        tts: false,
        attachments: [],
        embeds: [],
        timestamp: ts,
        edited_timestamp: null,
        state: "SENT",
        fake: true,
      };

      if (replyRef && replyRef.id) {
        message.type = 19;
        message.message_reference = { message_id: replyRef.id, channel_id: channelId };
        try {
          const guildId = ChannelModule?.getChannel?.(channelId)?.guild_id;
          if (guildId) message.message_reference.guild_id = guildId;
        } catch {}
        message.referenced_message = {
          id: replyRef.id,
          type: 0,
          channel_id: channelId,
          author: mkAuthor(replyRef.userId),
          content: replyRef.content,
          mentions: [],
          mention_roles: [],
          pinned: false,
          tts: false,
          attachments: [],
          embeds: [],
          timestamp: replyRef.timestamp || ts,
          edited_timestamp: null,
          state: "SENT",
          fake: true,
        };
      }

      const dispatched = dispatchFlux({
        type: "MESSAGE_CREATE",
        channelId,
        message,
        otherPluginBypass: true,
      });
      if (!dispatched) return;

      try {
        dispatchFlux({
          type: "MESSAGE_ACK",
          channelId,
          messageId: id,
          manual: true,
          immediate: true,
        });
      } catch {}

      try {
        attachLinkEmbeds(channelId, message, content);
      } catch {}
    } catch (err) {
      warn("createFakeMessage failed", err);
      showToast("Message dispatch failed: " + (err.message || "unknown"));
    }
  }

  function saveMessage(channelId, userId, content, messageId, timestamp, replyRef) {
    const messages = plugin.storage.savedMessages || [];
    const record = {
      id: messageId,
      channelId,
      userId,
      content,
      timestamp,
      createdAt: Date.now(),
    };
    if (replyRef) record.replyTo = replyRef;
    messages.push(record);
    plugin.storage.savedMessages = messages;
    plugin.storage._lastUpdate = Date.now();
  }

  function replayChannel(channelId) {
    (plugin.storage.savedMessages || [])
      .filter((msg) => msg.channelId === channelId)
      .forEach((msg) => {
        createFakeMessage(msg.channelId, msg.userId, msg.content, msg.timestamp, msg.id, msg.replyTo);
      });
  }

  function clearSavedMessages() {
    try {
      const count = (plugin.storage.savedMessages || []).length;
      plugin.storage.savedMessages = [];
      plugin.storage._lastUpdate = Date.now();
      showToast(`Cleared ${count} saved message${count === 1 ? "" : "s"}.`);
    } catch {
      showToast("Couldn't clear saved messages.");
    }
  }

  function removeAllFakeMessages() {
    try {
      const list = (plugin.storage.savedMessages || []).slice();
      let removed = 0;
      for (const rec of list) {
        if (rec && rec.id && rec.channelId) {
          try {
            dispatchFlux({
              type: "MESSAGE_DELETE",
              id: rec.id,
              channelId: rec.channelId,
              otherPluginBypass: true,
            });
            removed++;
          } catch {}
        }
      }
      plugin.storage.savedMessages = [];
      plugin.storage._lastUpdate = Date.now();
      showToast(`Removed ${removed} spoofed message${removed === 1 ? "" : "s"} and cleared saved.`);
    } catch {
      showToast("Couldn't remove spoofed messages.");
    }
  }

  // ─── Conversation Builder ───────────────────────────────────────────────────

  function parseReplyRef(token) {
    if (!token) return null;
    const num = token.slice(1);
    return num ? { line: parseInt(num, 10) } : { prev: true };
  }

  function parseConversationLine(line) {
    const raw = (line || "").trim();
    if (!raw) return null;
    let m;

    if ((m = raw.match(/^([^\s\[\^|:\-\u2013\u2014]+)\s*\[([^\]]+)\]\s*(\^\d*)?\s*[-\u2013\u2014|:]\s*([\s\S]*)$/)))
      return { uid: m[1], time: m[2].trim(), reply: parseReplyRef(m[3]), content: m[4] };

    if ((m = raw.match(/^([^\s\[\^|:\-\u2013\u2014]+)\s*(\^\d*)?\s*[-\u2013\u2014|:]\s*([\s\S]*)$/)))
      return { uid: m[1], time: null, reply: parseReplyRef(m[2]), content: m[3] };

    return null;
  }

  function randomGapMs() {
    return Math.floor(60000 + Math.random() * 60000);
  }

  async function runConversation() {
    try {
      const channelId = getCurrentChannelId();
      if (!channelId) {
        showToast("No channel selected.");
        return;
      }

      const text = plugin.storage.conversationText || "";
      if (!text.trim()) {
        showToast("Conversation box is empty.");
        return;
      }

      const lines = text.split(/\r?\n/);
      const useUTC = isUkTimeEnabled() ? false : plugin.storage.useUTC || false;
      const now = nowDate();
      const base = {
        y: plugin.storage.customYear || now.getFullYear(),
        mo: plugin.storage.customMonth || now.getMonth() + 1,
        d: plugin.storage.customDay || now.getDate(),
      };

      const items = [];
      for (const line of lines) {
        const parsed = parseConversationLine(line);
        if (!parsed || !parsed.content.trim()) continue;

        let uid = parsed.uid;
        if (/^(me|self)$/i.test(uid)) uid = UserStore.getCurrentUser()?.id;
        else if (/^(them|they|user)$/i.test(uid)) uid = (plugin.storage.userId || "").trim();
        if (!uid) {
          log("Skipped line - no UID resolved:", line);
          continue;
        }

        const explicit = parsed.time ? parseTime(parsed.time, base, useUTC) : null;
        items.push({ uid, content: parsed.content, reply: parsed.reply, explicit });
      }

      if (!items.length) {
        showToast("No valid lines. Format: me - hello");
        return;
      }

      let cursor = nowDate().getTime();
      for (const item of items) {
        if (item.explicit) {
          const t = new Date(item.explicit).getTime();
          if (!isNaN(t)) { cursor = t; break; }
        }
      }

      let count = 0;
      const built = [];

      for (const item of items) {
        let iso;
        if (item.explicit) {
          const t = new Date(item.explicit).getTime();
          if (!isNaN(t)) {
            cursor = t;
            iso = new Date(t).toISOString();
          } else {
            iso = new Date(cursor).toISOString();
          }
        } else {
          iso = new Date(cursor).toISOString();
        }
        cursor += randomGapMs();

        const id = genId(iso);
        let ref = null;
        if (item.reply) {
          const target = item.reply.prev
            ? built[built.length - 1]
            : built[item.reply.line - 1];
          if (target) {
            ref = { id: target.id, userId: target.userId, content: target.content, timestamp: target.timestamp };
          }
        }

        await createFakeMessage(channelId, item.uid, item.content, iso, id, ref);
        saveMessage(channelId, item.uid, item.content, id, iso, ref);
        built.push({ id, userId: item.uid, content: item.content, timestamp: iso });
        count++;
      }

      showToast(count ? `Sent ${count} message${count === 1 ? "" : "s"}.` : "No valid lines found.");
    } catch (err) {
      showToast("Conversation error: " + (err.message || "unknown"));
      warn("runConversation failed", err);
    }
  }

  // ─── DM Navigation ─────────────────────────────────────────────────────────

  function extractUserId(input) {
    const s = ("" + (input || "")).trim();
    if (!s) return null;
    let m = s.match(/^<@!?(\d{17,20})>$/);
    if (m) return m[1];
    m = s.match(/users\/(\d{17,20})\b/);
    if (m) return m[1];
    if (/^\d{17,20}$/.test(s)) return s;
    return null;
  }

  function dmNameFor(id) {
    try {
      const user = UserStoreByName.getUser(id);
      if (user) return user.globalName || user.global_name || user.username || id;
    } catch {}
    return id;
  }

  function pushMessagesScreen(channelId) {
    try {
      const handler = metro.findByProps("handleTapChannel");
      if (handler && typeof handler.handleTapChannel === "function") {
        handler.handleTapChannel(channelId);
        return true;
      }
    } catch {}
    try {
      const handler = metro.findByProps("handlePressChannel");
      if (handler && typeof handler.handlePressChannel === "function") {
        handler.handlePressChannel(channelId);
        return true;
      }
    } catch {}
    try {
      const NavRef = metro.findByProps("getRootNavigationRef");
      const ref = NavRef?.getRootNavigationRef?.();
      if (ref && typeof ref.navigate === "function") {
        for (const route of ["messages", "Messages", "Channel", "channel"]) {
          try { ref.navigate(route, { channelId }); return true; } catch {}
        }
      }
    } catch {}
    return false;
  }

  function tryNavigate(channelId) {
    if (!channelId) return false;

    const sc = metro.findByProps("selectChannel");
    if (sc && typeof sc.selectChannel === "function") {
      const shapes = [
        { guildId: null, channelId },
        { guildId: "@me", channelId },
        { channelId },
        channelId,
      ];
      for (const shape of shapes) {
        try { sc.selectChannel(shape); pushMessagesScreen(channelId); return true; } catch {}
      }
    }

    if (pushMessagesScreen(channelId)) return true;

    const tr = metro.findByProps("transitionToChannel");
    if (tr && typeof tr.transitionToChannel === "function") {
      try { tr.transitionToChannel(channelId); return true; } catch {}
    }

    const oc = metro.findByProps("openChannel");
    if (oc && typeof oc.openChannel === "function") {
      try { oc.openChannel({ channelId }); return true; } catch {}
    }

    return false;
  }

  function findExistingDM(userId) {
    try {
      const ChannelStore = metro.findByStoreName("ChannelStore");
      const PrivateChannelStore = metro.findByStoreName("PrivateChannelStore");

      let channelId = null;
      try {
        if (PrivateChannelStore && typeof PrivateChannelStore.getDMFromUserId === "function")
          channelId = PrivateChannelStore.getDMFromUserId(userId);
      } catch {}

      if (channelId) {
        const ch = ChannelStore?.getChannel?.(channelId);
        if (ch && ch.type === 1) return channelId;
      }

      let ids = [];
      try {
        if (PrivateChannelStore && typeof PrivateChannelStore.getPrivateChannelIds === "function")
          ids = PrivateChannelStore.getPrivateChannelIds() || [];
      } catch {}

      for (const id of ids) {
        const ch = ChannelStore?.getChannel?.(id);
        if (!ch || ch.type !== 1) continue;
        const recipients = ch.recipients || [];
        if (recipients.length !== 1) continue;
        const rid = typeof recipients[0] === "string" ? recipients[0] : recipients[0]?.id;
        if (rid === userId) return id;
      }
    } catch {}
    return null;
  }

  function isDMChannel(channelId) {
    try {
      const ChannelStore = metro.findByStoreName("ChannelStore");
      const ch = ChannelStore?.getChannel?.(channelId);
      return !!ch && ch.type === 1;
    } catch {}
    return false;
  }

  function tryOpenPrivate(acts, id) {
    if (!acts || typeof acts.openPrivateChannel !== "function") return false;
    for (const shape of [id, { recipientId: id }, { userId: id }]) {
      try { acts.openPrivateChannel(shape); return true; } catch {}
    }
    return false;
  }

  async function openDM(userId) {
    const id = extractUserId(userId);
    if (!id) {
      showToast("Invalid user - expected an ID, mention, or profile link.");
      return null;
    }

    const acts = metro.findByProps("openPrivateChannel");
    const ens = metro.findByProps("ensurePrivateChannel");

    let channelId = findExistingDM(id);
    if (channelId && tryNavigate(channelId)) {
      showToast("Opening DM with " + dmNameFor(id));
      return { channelId, userId: id };
    }

    if (!channelId && ens && typeof ens.ensurePrivateChannel === "function") {
      try { channelId = await ens.ensurePrivateChannel(id); } catch {}
    }

    if (channelId) {
      if (isDMChannel(channelId)) {
        if (tryNavigate(channelId)) {
          showToast("Opening DM with " + dmNameFor(id));
          return { channelId, userId: id };
        }
      } else {
        const real = findExistingDM(id);
        if (real && tryNavigate(real)) {
          showToast("Opening DM with " + dmNameFor(id));
          return { channelId: real, userId: id };
        }
        showToast("This build's create call makes a group, not a 1:1 DM.");
        return null;
      }
    }

    if (tryOpenPrivate(acts, id)) {
      const real = findExistingDM(id);
      if (real && tryNavigate(real)) {
        showToast("Opening DM with " + dmNameFor(id));
        return { channelId: real, userId: id };
      }
      showToast("Opened a channel but couldn't confirm it's a 1:1 DM.");
      return null;
    }

    showToast("Couldn't open a DM - no working DM API found on this build.");
    return null;
  }

  // ─── Fill From Chat ─────────────────────────────────────────────────────────

  function fillFromChat() {
    try {
      const channelId = getCurrentChannelId();
      if (!channelId) return null;

      let channel = null;
      try { channel = ChannelModule?.getChannel?.(channelId); } catch {}
      if (!channel) {
        try { channel = metro.findByStoreName("ChannelStore")?.getChannel?.(channelId); } catch {}
      }

      const recipients = channel?.recipients;
      if (recipients && recipients.length) {
        let id = recipients[0];
        if (id && typeof id === "object") id = id.id || id.userId || id.user_id;
        if (id) return "" + id;
      }

      const rawRecipients = channel?.rawRecipients;
      if (rawRecipients && rawRecipients.length && rawRecipients[0]) {
        const id = rawRecipients[0].id || rawRecipients[0].user_id;
        if (id) return "" + id;
      }

      try {
        const ids = metro.findByProps("getDMUserIds")?.getDMUserIds?.(channelId);
        if (ids && ids.length) return "" + ids[0];
      } catch {}

      let messages = [];
      try {
        const msgs = MessageStore?.getMessages?.(channelId);
        messages = msgs && msgs.toArray ? msgs.toArray() : (msgs && msgs._array) || [];
      } catch {}

      const myId = UserStoreByName?.getCurrentUser?.()?.id;
      for (let i = messages.length - 1; i >= 0; i--) {
        const authorId = messages[i]?.author?.id;
        if (authorId && authorId !== myId) return "" + authorId;
      }
    } catch {}
    return null;
  }

  // ─── Profile Management ─────────────────────────────────────────────────────

  function fetchProfileSafe(uid) {
    if (!uid) return;
    try {
      if (fetchProfileModule === undefined)
        fetchProfileModule = metro.findByProps("fetchProfile") || null;
    } catch {
      fetchProfileModule = null;
    }
    if (fetchProfileModule && typeof fetchProfileModule.fetchProfile === "function") {
      try {
        const result = fetchProfileModule.fetchProfile(uid);
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch {}
    }
  }

  function prefetchSources() {
    let count = 0;
    try {
      const profiles = plugin.storage.profiles || {};
      const seen = new Set();
      for (const key in profiles) {
        const sourceId = profiles[key]?.sourceId;
        if (sourceId && !seen.has(sourceId)) {
          seen.add(sourceId);
          fetchProfileSafe(sourceId);
          count++;
        }
      }
    } catch {}
    return count;
  }

  function saveProfile() {
    try {
      const id = ("" + (plugin.storage.profileId || "")).trim();
      if (!/^\d{5,}$/.test(id)) {
        showToast("Enter a valid numeric user ID first.");
        return;
      }

      const name = ("" + (plugin.storage.profileName || "")).trim();
      const avatar = ("" + (plugin.storage.profileAvatar || "")).trim();
      const sourceId = ("" + (plugin.storage.profileSource || "")).trim().replace(/[^0-9]/g, "");
      const isSelf = !!plugin.storage.profileSelf;

      if (sourceId && sourceId === id) {
        showToast("Source ID must differ from the user ID.");
        return;
      }

      let joinedAt, accountDate;
      let dateWarn = "";

      const joinedRaw = ("" + (plugin.storage.profileJoined || "")).trim();
      if (joinedRaw) {
        const parsed = parseUserDate(joinedRaw);
        if (parsed) joinedAt = parsed.toISOString();
        else dateWarn += " (server date not understood, left default)";
      }

      const accountRaw = ("" + (plugin.storage.profileAccount || "")).trim();
      if (accountRaw) {
        const parsed = parseUserDate(accountRaw);
        if (parsed) accountDate = parsed.toISOString();
        else dateWarn += " (Discord date not understood, left default)";
      }

      if (!name && !avatar && !sourceId && !isSelf && !joinedAt && !accountDate) {
        showToast("Set a name, avatar, source ID, or a date first.");
        return;
      }

      const profiles = Object.assign({}, plugin.storage.profiles || {});
      profiles[id] = {
        name: name || undefined,
        avatar: avatar || undefined,
        sourceId: sourceId || undefined,
        self: isSelf || undefined,
        joinedAt,
        accountDate,
      };
      plugin.storage.profiles = profiles;
      plugin.storage._lastUpdate = Date.now();

      cachedCurrentUserProxy = null;
      cachedCurrentUser = null;
      cachedCurrentUserId = null;
      avatarSourceCache.clear();

      if (sourceId) fetchProfileSafe(sourceId);

      showToast(
        "Saved profile for " + id +
        (sourceId ? " (mirroring " + sourceId + ")" : "") +
        (isSelf ? " [self-profile]" : "") +
        "." + dateWarn
      );
    } catch {
      showToast("Couldn't save that profile.");
    }
  }

  function removeProfile(id) {
    try {
      const key = ("" + (id || plugin.storage.profileId || "")).trim();
      const profiles = Object.assign({}, plugin.storage.profiles || {});
      if (!profiles[key]) {
        showToast("No profile saved for that ID.");
        return;
      }
      delete profiles[key];
      plugin.storage.profiles = profiles;
      plugin.storage._lastUpdate = Date.now();
      avatarSourceCache.delete(key);
      showToast("Removed profile for " + key + ".");
    } catch {
      showToast("Couldn't remove that profile.");
    }
  }

  // ─── Panel / Action Sheet ───────────────────────────────────────────────────

  function closePanel(nav) {
    try { if (nav && typeof nav.goBack === "function") return void nav.goBack(); } catch {}
    try { if (nav && typeof nav.pop === "function") return void nav.pop(); } catch {}
    try {
      const navModule = metro.findByProps("pop", "popToTop", "push");
      if (navModule && typeof navModule.pop === "function") return void navModule.pop();
    } catch {}
  }

  function PanelSheet() {
    const panel = common.React.createElement(PluginExport.settings, { inSheet: true });
    const RN = common.ReactNative || metro.findByProps("ScrollView", "View");
    const spacer = RN?.View ? common.React.createElement(RN.View, { style: { height: 80 } }) : null;

    let ActionSheet = null;
    try {
      ActionSheet = (metro.findByProps("ActionSheet", "ActionSheetRow") || {}).ActionSheet
        || (metro.findByProps("ActionSheet") || {}).ActionSheet
        || null;
    } catch {}

    if (ActionSheet) return common.React.createElement(ActionSheet, {}, panel, spacer);
    if (!RN || !RN.ScrollView) return panel;

    let screenH = 800;
    try {
      if (RN.Dimensions?.get) screenH = RN.Dimensions.get("window").height || 800;
    } catch {}

    const sheetMax = Math.round(screenH * 0.88);
    return common.React.createElement(
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
      common.React.createElement(
        RN.ScrollView,
        {
          style: { maxHeight: sheetMax - 10 },
          contentContainerStyle: { paddingBottom: 240 },
          keyboardShouldPersistTaps: "handled",
          showsVerticalScrollIndicator: true,
          nestedScrollEnabled: true,
        },
        panel,
        spacer,
      ),
    );
  }

  function openPanel() {
    try {
      if (ActionSheetModule && typeof ActionSheetModule.openLazy === "function") {
        ActionSheetModule.openLazy(
          Promise.resolve({ default: PanelSheet }),
          "LocalMessageSpooferSheet",
          {},
        );
        return;
      }
    } catch {}
    showToast("Couldn't open the panel on this client. Open it from the Plugins list.");
  }

  // ─── Command Registration ───────────────────────────────────────────────────

  function registerCommands() {
    // Confirmed on Kettu: the API is vendetta.commands.registerCommand.
    // Access it directly - do NOT scan globalThis (some globals throw when touched).
    let cmds = null;
    try {
      if (typeof vendetta !== "undefined" && vendetta && vendetta.commands && typeof vendetta.commands.registerCommand === "function") {
        cmds = vendetta.commands;
      }
    } catch (e) {}
    if (!cmds) {
      try {
        const m = metro.findByProps("registerCommand");
        if (m && typeof m.registerCommand === "function") cmds = m;
      } catch (e) {}
    }

    let reg = cmds && typeof cmds.registerCommand === "function"
      ? cmds.registerCommand.bind(cmds)
      : null;

    if (!reg) {
      warn("No command API found");
      showToast("[Spoofer] No command API found");
      return;
    }

    log("Command API found, registering commands...");

    // Register each command in isolation - if one throws, the rest still register.
    function safeReg(def, label) {
      try {
        const un = reg(def);
        if (typeof un === "function") cleanupCallbacks.push(un);
        return true;
      } catch (e) {
        warn("register " + label + " failed", e);
        showToast("[Spoofer] /" + label + " failed: " + (e.message || "?"));
        return false;
      }
    }

    safeReg({
      name: "spoofer",
      displayName: "spoofer",
      description: "Open the Local Message Spoofer panel.",
      displayDescription: "Open the Local Message Spoofer panel.",
      type: 1, inputType: 1, applicationId: "-1", options: [],
      execute: () => openPanel(),
    }, "spoofer");

    safeReg({
      name: "filluid",
      displayName: "filluid",
      description: "Fill the spoofer User ID from this chat, or pass a specific ID.",
      displayDescription: "Fill the spoofer User ID from this chat, or pass a specific ID.",
      type: 1, inputType: 1, applicationId: "-1",
      options: [{
        name: "userid", displayName: "userid",
        description: "Optional: a specific user ID to set.",
        displayDescription: "Optional: a specific user ID to set.",
        type: 3, required: false,
      }],
      execute: (args) => {
        try {
          const map = Array.isArray(args)
            ? Object.fromEntries(args.map((a) => [a?.name, a?.value]))
            : args ?? {};
          let id = ("" + (map.userid ?? "")).trim();
          if (!id) id = fillFromChat();
          if (id) { plugin.storage.userId = id; showToast("User ID set: " + id); }
          else showToast("No user found here. Try: /filluid userid:123456789");
        } catch { showToast("Couldn't set the User ID."); }
      },
    }, "filluid");

    safeReg({
      name: "clearfakes",
      displayName: "clearfakes",
      description: "Clear all saved fake messages (stops them replaying).",
      displayDescription: "Clear all saved fake messages (stops them replaying).",
      type: 1, inputType: 1, applicationId: "-1", options: [],
      execute: () => clearSavedMessages(),
    }, "clearfakes");

    safeReg({
      name: "dm",
      displayName: "dm",
      description: "Open a DM with a user by ID, mention, or profile link.",
      displayDescription: "Open a DM with a user by ID, mention, or profile link.",
      type: 1, inputType: 1, applicationId: "-1",
      options: [{
        name: "user", displayName: "user",
        description: "User ID, mention, or profile URL.",
        displayDescription: "User ID, mention, or profile URL.",
        type: 3, required: true,
      }],
      execute: (args) => {
        try {
          const map = Array.isArray(args)
            ? Object.fromEntries(args.map((a) => [a?.name, a?.value]))
            : args ?? {};
          openDM("" + (map.user ?? ""));
        } catch { showToast("Couldn't run /dm."); }
      },
    }, "dm");

    safeReg({
      name: "sdm",
      displayName: "sdm",
      description: "Open a DM and add a local spoofed message.",
      displayDescription: "Open a DM and add a local spoofed message.",
      type: 1, inputType: 1, applicationId: "-1",
      options: [
        { name: "user", displayName: "user", description: "User ID, mention, or profile URL.", displayDescription: "User ID, mention, or profile URL.", type: 3, required: true },
        { name: "message", displayName: "message", description: "The local-only spoofed message to add.", displayDescription: "The local-only spoofed message to add.", type: 3, required: true },
      ],
      execute: async (args) => {
        try {
          const map = Array.isArray(args)
            ? Object.fromEntries(args.map((a) => [a?.name, a?.value]))
            : args ?? {};

          const result = await openDM("" + (map.user ?? ""));
          if (!result) { showToast("Failed to open DM or user not found."); return; }

          const content = ("" + (map.message ?? "")).trim();
          if (!content) { showToast("Enter a message to spoof."); return; }

          await new Promise((resolve) => setTimeout(resolve, 250));

          const timestamp = nowISO();
          const id = genId(timestamp);
          await createFakeMessage(result.channelId, result.userId, content, timestamp, id);
          saveMessage(result.channelId, result.userId, content, id, timestamp);
          showToast("Spoofed message sent in DM.");
        } catch (err) {
          showToast("Error: " + (err.message || "unknown"));
        }
      },
    }, "sdm");
  }

  // ─── Patching: Avatars ──────────────────────────────────────────────────────

  function patchAvatars() {
    try {
      const AvatarURL = metro.findByProps("getUserAvatarURL");
      if (AvatarURL && typeof AvatarURL.getUserAvatarURL === "function")
        patches.push(patcher.after("getUserAvatarURL", AvatarURL, (args, ret) => {
          try {
            const id = firstProfiledId(args);
            if (id) { const url = resolveAvatar(id); if (url) return url; }
          } catch {}
          return ret;
        }));
    } catch {}

    try {
      const AvatarSrc = metro.findByProps("getUserAvatarSource");
      if (AvatarSrc && typeof AvatarSrc.getUserAvatarSource === "function")
        patches.push(patcher.after("getUserAvatarSource", AvatarSrc, (args, ret) => {
          try {
            const id = firstProfiledId(args);
            if (id) return mirrorSource(id, ret);
          } catch {}
          return ret;
        }));
    } catch {}

    try {
      const GuildAv = metro.findByProps("getGuildMemberAvatarURLSimple");
      if (GuildAv && typeof GuildAv.getGuildMemberAvatarURLSimple === "function")
        patches.push(patcher.after("getGuildMemberAvatarURLSimple", GuildAv, (args, ret) => {
          try {
            const id = firstProfiledId(args);
            if (id) { const url = resolveAvatar(id); if (url) return url; }
          } catch {}
          return ret;
        }));
    } catch {}

    try {
      const currentUser = UserStoreByName?.getCurrentUser?.();
      const proto = currentUser?.constructor?.prototype;
      if (proto && typeof proto.getAvatarURL === "function")
        patches.push(patcher.after("getAvatarURL", proto, function (args, ret) {
          try {
            const id = this?.id;
            if (id && (plugin.storage.profiles || EMPTY)[id]) {
              const url = resolveAvatar(id);
              if (url) return url;
            }
          } catch {}
          return ret;
        }));
    } catch {}
  }

  // ─── Patching: Names ────────────────────────────────────────────────────────

  function patchNames() {
    try {
      if (UserStoreByName && typeof UserStoreByName.getUser === "function")
        patches.push(patcher.after("getUser", UserStoreByName, (args, ret) => {
          try {
            const profiles = plugin.storage.profiles;
            const id = args && args[0];
            if (profiles && id && profiles[id] && ret) {
              const displayName = resolveName(id);
              const username = resolveUsername(id);
              if (username && ret.username !== username) forceSet(ret, "username", username);
              if (displayName && ret.globalName !== displayName) forceSet(ret, "globalName", displayName);
              forceNull(ret, "avatarDecorationData");
              forceNull(ret, "avatarDecoration");
              forceNull(ret, "primaryGuild");
              forceNull(ret, "clan");
              forceSet(ret, "premiumType", 0);
              forceNull(ret, "premiumSince");
              forceNull(ret, "premiumGuildSince");
              const created = resolveCreated(id);
              if (created) forceSet(ret, "createdAt", created);
              if (profiles[id].sourceId) {
                const accent = resolveAccent(id);
                if (accent != null) forceSet(ret, "accentColor", accent);
              }
            }
          } catch {}
          return ret;
        }));
    } catch {}

    try {
      const GuildMemberStore = metro.findByStoreName("GuildMemberStore");

      if (GuildMemberStore && typeof GuildMemberStore.getNick === "function")
        patches.push(patcher.after("getNick", GuildMemberStore, (args, ret) => {
          try {
            const profiles = plugin.storage.profiles;
            if (profiles && args) {
              const id = profiles[args[1]] ? args[1] : profiles[args[0]] ? args[0] : null;
              if (id) { const nm = resolveName(id); if (nm) return nm; }
            }
          } catch {}
          return ret;
        }));

      if (GuildMemberStore && typeof GuildMemberStore.getMember === "function")
        patches.push(patcher.after("getMember", GuildMemberStore, (args, ret) => {
          try {
            const profiles = plugin.storage.profiles;
            if (profiles && args && ret) {
              const id = profiles[args[1]] ? args[1] : profiles[args[0]] ? args[0] : null;
              if (id) {
                const nm = resolveName(id);
                if (nm) {
                  try { ret.nick = nm; } catch {}
                  if ("nickname" in ret) try { ret.nickname = nm; } catch {}
                }
                const joined = resolveJoined(id);
                if (joined) {
                  forceSet(ret, "joinedAt", joined);
                  if ("joinedAtTimestamp" in ret)
                    forceSet(ret, "joinedAtTimestamp", new Date(joined).getTime());
                }
              }
            }
          } catch {}
          return ret;
        }));

      if (GuildMemberStore && typeof GuildMemberStore.getMembers === "function")
        patches.push(patcher.after("getMembers", GuildMemberStore, (args, ret) => {
          try {
            if (!hasAnyProfile()) return ret;
            const profiles = plugin.storage.profiles;
            if (profiles && ret) {
              const arr = Array.isArray(ret) ? ret
                : (ret && typeof ret === "object") ? Object.values(ret) : null;
              if (arr) {
                for (const member of arr) {
                  const mid = member && (member.userId || member.user?.id);
                  if (mid && profiles[mid]) {
                    const nm = resolveName(mid);
                    if (nm) {
                      forceSet(member, "nick", nm);
                      if ("nickname" in member) forceSet(member, "nickname", nm);
                    }
                    const joined = resolveJoined(mid);
                    if (joined) {
                      forceSet(member, "joinedAt", joined);
                      if ("joinedAtTimestamp" in member)
                        forceSet(member, "joinedAtTimestamp", new Date(joined).getTime());
                    }
                  }
                }
              }
            }
          } catch {}
          return ret;
        }));
    } catch {}

    try {
      const NicknameModule = metro.findByProps("getNickname");
      if (NicknameModule && typeof NicknameModule.getNickname === "function")
        patches.push(patcher.after("getNickname", NicknameModule, (args, ret) => {
          try {
            const profiles = plugin.storage.profiles;
            if (profiles && args) {
              for (let i = 0; i < args.length; i++) {
                const id = extractId(args[i]);
                if (id && profiles[id]) { const nm = resolveName(id); if (nm) return nm; }
              }
            }
          } catch {}
          return ret;
        }));
    } catch {}

    try {
      const NameModule = metro.findByProps("getName");
      if (NameModule && typeof NameModule.getName === "function")
        patches.push(patcher.after("getName", NameModule, (args, ret) => {
          try {
            const profiles = plugin.storage.profiles;
            if (profiles && args) {
              for (let i = 0; i < args.length; i++) {
                const id = extractId(args[i]);
                if (id && profiles[id]) { const nm = resolveName(id); if (nm) return nm; }
              }
            }
          } catch {}
          return ret;
        }));
    } catch {}
  }

  // ─── Patching: Banners & Decorations ────────────────────────────────────────

  function patchBannersAndDecorations() {
    try {
      const BannerModule = metro.findByProps("getUserBannerURL");
      if (BannerModule && typeof BannerModule.getUserBannerURL === "function")
        patches.push(patcher.after("getUserBannerURL", BannerModule, (args, ret) => {
          try {
            const id = firstProfiledId(args);
            const prof = id && getProfile(id);
            if (prof && prof.sourceId) return resolveBanner(id);
          } catch {}
          return ret;
        }));
    } catch {}

    try {
      const currentUser = UserStoreByName?.getCurrentUser?.();
      const proto = currentUser?.constructor?.prototype;
      if (proto && typeof proto.getBannerURL === "function")
        patches.push(patcher.after("getBannerURL", proto, function (args, ret) {
          try {
            const id = this?.id;
            const prof = id && getProfile(id);
            if (prof && prof.sourceId) return resolveBanner(id);
          } catch {}
          return ret;
        }));
    } catch {}

    try {
      const DecoModule = metro.findByProps("getAvatarDecorationURL");
      if (DecoModule && typeof DecoModule.getAvatarDecorationURL === "function")
        patches.push(patcher.after("getAvatarDecorationURL", DecoModule, (args, ret) => {
          try {
            const id = extractId(args && args[0]);
            if (id && (plugin.storage.profiles || EMPTY)[id]) return null;
          } catch {}
          return ret;
        }));
    } catch {}

    try {
      const currentUser = UserStoreByName?.getCurrentUser?.();
      const proto = currentUser?.constructor?.prototype;
      if (proto && typeof proto.getAvatarDecorationURL === "function")
        patches.push(patcher.after("getAvatarDecorationURL", proto, function (args, ret) {
          try {
            const id = this?.id;
            if (id && (plugin.storage.profiles || EMPTY)[id]) return null;
          } catch {}
          return ret;
        }));
    } catch {}
  }

  // ─── Patching: User Profile Store ───────────────────────────────────────────

  function patchUserProfile() {
    try {
      const UserProfileStore = metro.findByStoreName("UserProfileStore");
      if (UserProfileStore && typeof UserProfileStore.getUserProfile === "function")
        patches.push(patcher.after("getUserProfile", UserProfileStore, (args, ret) => {
          try {
            const profiles = plugin.storage.profiles;
            const id = args && args[0];
            if (profiles && id && profiles[id] && ret) {
              const prof = profiles[id];
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
                  const sourceProfile = UserProfileStore.getUserProfile(prof.sourceId);
                  if (sourceProfile) {
                    if (sourceProfile.bio != null) forceSet(ret, "bio", sourceProfile.bio);
                    if (sourceProfile.pronouns != null) forceSet(ret, "pronouns", sourceProfile.pronouns);
                    if (sourceProfile.accentColor != null) forceSet(ret, "accentColor", sourceProfile.accentColor);
                    if (sourceProfile.themeColors != null) forceSet(ret, "themeColors", sourceProfile.themeColors);
                  }
                  let bannerHash = null;
                  try {
                    const srcUser = UserStoreByName.getUser(prof.sourceId);
                    bannerHash = srcUser?.banner || sourceProfile?.banner || null;
                  } catch {}
                  forceSet(ret, "banner", bannerHash);
                } catch {
                } finally {
                  resolving.delete("p" + id);
                }
              }
            }
          } catch {}
          return ret;
        }));
    } catch {}

    try {
      const BadgeModule = metro.findByProps("getBadges");
      if (BadgeModule && typeof BadgeModule.getBadges === "function")
        patches.push(patcher.after("getBadges", BadgeModule, (args, ret) => {
          try { const id = firstProfiledId(args); if (id) return []; } catch {}
          return ret;
        }));
    } catch {}

    try {
      const BadgeModule2 = metro.findByProps("getUserProfileBadges");
      if (BadgeModule2 && typeof BadgeModule2.getUserProfileBadges === "function")
        patches.push(patcher.after("getUserProfileBadges", BadgeModule2, (args, ret) => {
          try { const id = firstProfiledId(args); if (id) return []; } catch {}
          return ret;
        }));
    } catch {}
  }

  // ─── Patching: Self Identity ────────────────────────────────────────────────

  function patchSelfIdentity() {
    try {
      if (UserStoreByName && typeof UserStoreByName.getCurrentUser === "function")
        patches.push(patcher.after("getCurrentUser", UserStoreByName, (args, ret) => {
          try {
            if (selfActive && selfId && ret) return spoofCurrentUser(ret, selfId);
          } catch {}
          return ret;
        }));
    } catch {}

    try {
      const IsCurrentUser = metro.findByProps("isCurrentUser");
      if (IsCurrentUser && typeof IsCurrentUser.isCurrentUser === "function")
        patches.push(patcher.after("isCurrentUser", IsCurrentUser, (args, ret) => {
          try {
            const profiles = plugin.storage.profiles;
            const id = extractId(args && args[0]) || (args && args[0]);
            if (profiles && id && profiles[id] && profiles[id].self) return true;
          } catch {}
          return ret;
        }));

      const IsMe = metro.findByProps("isMe");
      if (IsMe && typeof IsMe.isMe === "function")
        patches.push(patcher.after("isMe", IsMe, (args, ret) => {
          try {
            const profiles = plugin.storage.profiles;
            const id = extractId(args && args[0]) || (args && args[0]);
            if (profiles && id && profiles[id] && profiles[id].self) return true;
          } catch {}
          return ret;
        }));
    } catch {}
  }

  // ─── Patching: Message Actions & Context Menu ───────────────────────────────

  function patchMessageActions() {
    if (FluxDispatcher) {
      try {
        dispatchGuard = patcher.before("dispatch", FluxDispatcher, (args) => {
          const [event] = args;
          if (event.type === "MESSAGE_UPDATE" && event.message?.fake && !event.otherPluginBypass && !isLocalEditing)
            return [];
        });
      } catch (err) { warn("dispatchGuard patch failed", err); }
    }

    if (!MessageActions) {
      warn("MessageActions not found - edit patching skipped");
      return;
    }

    patches.push(patcher.before("editMessage", MessageActions, (args) => {
      const [channelId, messageId, payload] = args;
      if (isLocalEditing) {
        const original = originalMessages.get(messageId);
        if (!original) return;

        const saved = plugin.storage.savedMessages || [];
        const record = saved.find((m) => m.id === messageId);
        if (record) {
          record.content = payload.content;
          plugin.storage.savedMessages = saved;
          plugin.storage._lastUpdate = Date.now();
        }

        dispatchFlux({
          type: "MESSAGE_UPDATE",
          message: { ...original, content: payload.content, edited_timestamp: null },
          otherPluginBypass: true,
        });
        return [];
      }
    }));

    patches.push(patcher.after("endEditMessage", MessageActions, () => {
      if (isLocalEditing) isLocalEditing = false;
    }));
  }

  function patchActionSheet() {
    try {
      if (ActionSheetModule && typeof ActionSheetModule.hideActionSheet === "function")
        patches.push(patcher.after("hideActionSheet", ActionSheetModule, () => {
          try {
            if (selfActive && Date.now() - selfAt > 400) {
              selfActive = false;
              selfId = null;
            }
          } catch {}
        }));
    } catch {}

    patches.push(patcher.before("openLazy", ActionSheetModule, ([promise, name, opts]) => {
      try {
        const profiles = plugin.storage.profiles;
        if (profiles && opts) {
          let foundId = null;
          const candidates = [opts.userId, opts.user?.id, opts.user?.userId];
          for (const candidate of candidates) {
            if (candidate && profiles[candidate]?.self) { foundId = candidate; break; }
          }
          if (!foundId) {
            try {
              for (const key in opts) {
                const val = opts[key];
                if (typeof val === "string" && profiles[val]?.self) { foundId = val; break; }
                if (val && typeof val === "object") {
                  const sub = val.id || val.userId;
                  if (sub && profiles[sub]?.self) { foundId = sub; break; }
                }
              }
            } catch {}
          }
          if (foundId) {
            selfId = foundId;
            selfActive = true;
            selfAt = Date.now();
            setTimeout(() => { selfActive = false; selfId = null; }, 8000);
          }
        }
      } catch {}

      const message = opts?.message;
      if (name !== "MessageLongPressActionSheet" || !message) return;

      promise.then((module) => {
        const unpatch = patcher.after("default", module, (args, tree) => {
          setTimeout(unpatch, 0);
          const rows = utils.findInReactTree(tree, (node) => node?.[0]?.type?.name === "ActionSheetRow");
          if (!rows) return;

          const currentUser = UserStoreByName.getCurrentUser();
          const msg = MessageStore.getMessage(message.channel_id, message.id) ?? message;

          if (msg.author.id === currentUser.id) return;
          if (rows.some((row) => row?.props?.label === "Edit Locally")) return;

          const insertIdx = Math.max(
            rows.findIndex((row) => row.props.message === common.i18n.Messages.MARK_UNREAD),
            0,
          );

          const editLocally = () => {
            isLocalEditing = true;
            if (!originalMessages.has(msg.id))
              originalMessages.set(msg.id, JSON.parse(JSON.stringify(msg)));
            ActionSheetModule.hideActionSheet();
            MessageActions.startEditMessage(msg.channel_id, msg.id, msg.content);
          };

          rows.splice(insertIdx, 0,
            common.React.createElement(ActionSheetRow, {
              label: "Edit Locally",
              icon: common.React.createElement(ActionSheetRow.Icon, {
                source: assets.getAssetIDByName("ic_edit_24px"),
              }),
              onPress: editLocally,
            }),
          );

          rows.splice(insertIdx, 0,
            common.React.createElement(ActionSheetRow, {
              label: "Use as Fake User",
              icon: common.React.createElement(ActionSheetRow.Icon, {
                source: assets.getAssetIDByName("ic_members"),
              }),
              onPress: () => {
                try {
                  plugin.storage.userId = msg.author.id;
                  ActionSheetModule.hideActionSheet();
                  showToast("Fake user set: " + (msg.author.username || msg.author.id));
                } catch {}
              },
            }),
          );
        });
      });
    }));
  }

  // ─── Patch Diagnostics ──────────────────────────────────────────────────────

  function buildPatchInfo() {
    try {
      const hasModule = (fn) => {
        try { const o = metro.findByProps(fn); return !!(o && typeof o[fn] === "function"); } catch { return false; }
      };

      let protoHasAvatar = false;
      try {
        const cu = UserStoreByName?.getCurrentUser?.();
        protoHasAvatar = !!(cu?.constructor?.prototype?.getAvatarURL);
      } catch {}

      let gms = null;
      try { gms = metro.findByStoreName("GuildMemberStore"); } catch {}

      let hasUserProfile = false;
      try { const ups = metro.findByStoreName("UserProfileStore"); hasUserProfile = !!(ups?.getUserProfile); } catch {}

      let protoBanner = false, protoDeco = false;
      try {
        const cu = UserStoreByName?.getCurrentUser?.();
        const proto = cu?.constructor?.prototype;
        protoBanner = !!(proto?.getBannerURL);
        protoDeco = !!(proto?.getAvatarDecorationURL);
      } catch {}

      patchInfo = [
        "avURL:" + (hasModule("getUserAvatarURL") ? "Y" : "N"),
        "avSrc:" + (hasModule("getUserAvatarSource") ? "Y" : "N"),
        "guildAv:" + (hasModule("getGuildMemberAvatarURLSimple") ? "Y" : "N"),
        "recAv:" + (protoHasAvatar ? "Y" : "N"),
        "getName:" + (hasModule("getName") ? "Y" : "N"),
        "getNick:" + (gms && typeof gms.getNick === "function" ? "Y" : "N"),
        "getMember:" + (gms && typeof gms.getMember === "function" ? "Y" : "N"),
        "getMembers:" + (gms && typeof gms.getMembers === "function" ? "Y" : "N"),
        "getNickname:" + (hasModule("getNickname") ? "Y" : "N"),
        "banURL:" + (hasModule("getUserBannerURL") ? "Y" : "N"),
        "recBan:" + (protoBanner ? "Y" : "N"),
        "decURL:" + (hasModule("getAvatarDecorationURL") ? "Y" : "N"),
        "recDec:" + (protoDeco ? "Y" : "N"),
        "profile:" + (hasUserProfile ? "Y" : "N"),
        "fetchP:" + (hasModule("fetchProfile") ? "Y" : "N"),
        "isCurUser:" + (hasModule("isCurrentUser") ? "Y" : "N"),
        "isMe:" + (hasModule("isMe") ? "Y" : "N"),
      ].join(" ");
    } catch {
      patchInfo = "(diagnostic failed)";
    }
  }

  // ─── Settings UI Components ─────────────────────────────────────────────────

  function FakeMessageSection({ tick, setTick }) {
    const userId = plugin.storage.userId || "";
    const message = plugin.storage.message || "";
    const resolvedUser = userId ? UserStore.getUser(userId) : null;
    const savedCount = (plugin.storage.savedMessages || []).length;
    const now = nowDate();
    const year = plugin.storage.customYear || now.getFullYear();
    const month = plugin.storage.customMonth || now.getMonth() + 1;
    const day = plugin.storage.customDay || now.getDate();
    const hour = plugin.storage.customHour !== undefined ? plugin.storage.customHour : now.getHours();
    const minute = plugin.storage.customMinute !== undefined ? plugin.storage.customMinute : now.getMinutes();

    return common.React.createElement(FormSection, { title: "Fake Message" },
      common.React.createElement(FormInput, {
        key: "uid" + tick,
        title: "User ID (Optional)",
        placeholder: "Leave empty to use current user",
        value: userId,
        onChange: (v) => { plugin.storage.userId = v || ""; },
        helperText: resolvedUser
          ? `User: ${resolvedUser.username} - use "them" in the builder`
          : userId ? 'User not found (still usable as "them")' : "Will use your account",
      }),
      common.React.createElement(FormRow, {
        label: "Fill from current chat",
        subLabel: "Grab the other person in this DM (or the last sender in this channel).",
        leading: FormRow.Icon
          ? common.React.createElement(FormRow.Icon, { source: assets.getAssetIDByName("ic_members") })
          : undefined,
        onPress: () => {
          const id = fillFromChat();
          if (id) {
            plugin.storage.userId = id;
            setTick((k) => k + 1);
            showToast("Filled User ID: " + id);
          } else {
            showToast('Couldn\'t find a user here. Open a DM, or long-press a message and pick "Use as Fake User".');
          }
        },
      }),
      common.React.createElement(FormInput, {
        title: "Message",
        placeholder: "Enter message content",
        value: message,
        onChange: (v) => { plugin.storage.message = v || ""; },
        multiline: true,
      }),
      common.React.createElement(FormInput, {
        title: "Server ID for [server] tag (optional)",
        placeholder: "Paste a server ID; [server] becomes its name",
        value: plugin.storage.serverTagId || "",
        onChange: (v) => { plugin.storage.serverTagId = v || ""; setTick((k) => k + 1); },
      }),
      common.React.createElement(FormRow, {
        label: "[server] = " + (resolveServerName(null, getCurrentChannelId()) || "(no match - join that server or recheck the ID)"),
        subLabel: "Type [server] in your message and it's swapped for the name when sent. Use [server:123] to name a specific server inline.",
      }),
      common.React.createElement(FormRow, {
        label: "Use the server I'm in now",
        subLabel: "One tap - fills the box above with your current server.",
        onPress: () => {
          const ch = ChannelModule?.getChannel?.(getCurrentChannelId());
          const guildId = ch?.guild_id;
          if (!guildId) { showToast("You're not in a server right now - open a server channel first."); return; }
          plugin.storage.serverTagId = guildId;
          const guild = GuildStore?.getGuild?.(guildId);
          showToast('Set to "' + (guild?.name || guildId) + '".');
          setTick((k) => k + 1);
        },
      }),
      common.React.createElement(FormRow, {
        label: plugin.storage.serverPickerOpen ? "Hide server list" : "Pick from my servers",
        subLabel: "Choose a server by name - no ID needed.",
        onPress: () => { plugin.storage.serverPickerOpen = !plugin.storage.serverPickerOpen; setTick((k) => k + 1); },
      }),
      plugin.storage.serverPickerOpen ? renderServerPicker(setTick) : null,
      common.React.createElement(FormRow, {
        label: "Link Previews",
        subLabel: "Show embeds for links in fake messages (YouTube, websites, images).",
        trailing: common.React.createElement(FormSwitch, {
          value: plugin.storage.embedsEnabled !== false,
          onValueChange: (v) => { plugin.storage.embedsEnabled = v; },
        }),
      }),
    );
  }

  function renderServerPicker(setTick) {
    let guilds = [];
    try {
      const all = GuildStore?.getGuilds?.() || {};
      guilds = Object.values(all).filter((g) => g && g.name);
      guilds.sort((a, b) => ("" + a.name).localeCompare("" + b.name));
    } catch {}

    const query = ("" + (plugin.storage.serverSearch || "")).trim().toLowerCase();
    if (query) guilds = guilds.filter((g) => ("" + g.name).toLowerCase().includes(query));

    const total = guilds.length;
    const shown = guilds.slice(0, 30);
    const rows = [
      common.React.createElement(FormInput, {
        key: "ssearch",
        title: "Search servers",
        placeholder: "Type a server name",
        value: plugin.storage.serverSearch || "",
        onChange: (v) => { plugin.storage.serverSearch = v || ""; setTick((k) => k + 1); },
      }),
    ];

    if (!shown.length) {
      rows.push(common.React.createElement(FormRow, {
        key: "snone", label: query ? "(no servers match)" : "(no servers found)",
      }));
    }

    for (const guild of shown) {
      rows.push(common.React.createElement(FormRow, {
        key: "g" + guild.id,
        label: guild.name,
        onPress: () => {
          plugin.storage.serverTagId = guild.id;
          plugin.storage.serverPickerOpen = false;
          plugin.storage.serverSearch = "";
          showToast('Set to "' + guild.name + '".');
          setTick((k) => k + 1);
        },
      }));
    }

    if (total > shown.length) {
      rows.push(common.React.createElement(FormRow, {
        key: "smore",
        label: (total - shown.length) + " more - keep typing to narrow",
        subLabel: "Showing the first 30 matches.",
      }));
    }

    return rows;
  }

  function TimestampSection({ setTick }) {
    const now = nowDate();
    const year = plugin.storage.customYear || now.getFullYear();
    const month = plugin.storage.customMonth || now.getMonth() + 1;
    const day = plugin.storage.customDay || now.getDate();
    const hour = plugin.storage.customHour !== undefined ? plugin.storage.customHour : now.getHours();
    const minute = plugin.storage.customMinute !== undefined ? plugin.storage.customMinute : now.getMinutes();
    const savedCount = (plugin.storage.savedMessages || []).length;

    return common.React.createElement(FormSection, { title: "Custom Timestamp" },
      common.React.createElement(FormRow, {
        label: "UK time (GMT/BST)" + (isUkTimeEnabled() ? " - ON" : " - off"),
        subLabel: "Automatic timestamps use UK time, and times you enter are treated as UK. Handles BST/GMT automatically.",
        trailing: common.React.createElement(FormSwitch, {
          value: isUkTimeEnabled(),
          onValueChange: (v) => { plugin.storage.ukTime = v; setTick((k) => k + 1); },
        }),
      }),
      common.React.createElement(FormRow, {
        label: isUkTimeEnabled()
          ? "UTC mode (ignored while UK is on)"
          : plugin.storage.useUTC ? "Using UTC Time" : "Using Local Time",
        subLabel: isUkTimeEnabled()
          ? "Turn off UK time above to use this."
          : plugin.storage.useUTC ? "Time will be the same for everyone" : "Time will adjust to viewer's timezone",
        trailing: common.React.createElement(FormSwitch, {
          value: plugin.storage.useUTC || false,
          onValueChange: (v) => { plugin.storage.useUTC = v; setTick((k) => k + 1); },
        }),
      }),
      common.React.createElement(FormInput, {
        title: "Year", placeholder: "YYYY (e.g., 2024)", value: String(year),
        onChange: (v) => { const a = parseInt(v); plugin.storage.customYear = isNaN(a) ? now.getFullYear() : a; },
        keyboardType: "number-pad",
      }),
      common.React.createElement(FormInput, {
        title: "Month", placeholder: "1-12", value: String(month),
        onChange: (v) => { const a = parseInt(v); plugin.storage.customMonth = isNaN(a) ? now.getMonth() + 1 : Math.min(Math.max(a, 1), 12); },
        keyboardType: "number-pad",
      }),
      common.React.createElement(FormInput, {
        title: "Day", placeholder: "1-31", value: String(day),
        onChange: (v) => { const a = parseInt(v); plugin.storage.customDay = isNaN(a) ? now.getDate() : Math.min(Math.max(a, 1), 31); },
        keyboardType: "number-pad",
      }),
      common.React.createElement(FormInput, {
        title: "Hour", placeholder: "0-23", value: String(hour),
        onChange: (v) => { const a = parseInt(v); plugin.storage.customHour = isNaN(a) ? now.getHours() : Math.min(Math.max(a, 0), 23); },
        keyboardType: "number-pad",
      }),
      common.React.createElement(FormInput, {
        title: "Minute", placeholder: "0-59", value: String(minute),
        onChange: (v) => { const a = parseInt(v); plugin.storage.customMinute = isNaN(a) ? now.getMinutes() : Math.min(Math.max(a, 0), 59); },
        keyboardType: "number-pad",
      }),
      common.React.createElement(FormRow, {
        label: "Send Fake Message",
        subLabel: `${savedCount} messages saved | Timestamp: ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        onPress: async () => {
          const channelId = getCurrentChannelId();
          const content = (plugin.storage.message || "").trim();
          if (!content || !channelId) return;

          const uid = (plugin.storage.userId || "").trim() || UserStore.getCurrentUser()?.id;
          if (!uid) return;

          const useUTC = plugin.storage.useUTC && !isUkTimeEnabled();
          const timestamp = (useUTC
            ? new Date(Date.UTC(
                plugin.storage.customYear || now.getFullYear(),
                (plugin.storage.customMonth || now.getMonth() + 1) - 1,
                plugin.storage.customDay || now.getDate(),
                plugin.storage.customHour !== undefined ? plugin.storage.customHour : now.getHours(),
                plugin.storage.customMinute !== undefined ? plugin.storage.customMinute : now.getMinutes(), 0, 0))
            : new Date(
                plugin.storage.customYear || now.getFullYear(),
                (plugin.storage.customMonth || now.getMonth() + 1) - 1,
                plugin.storage.customDay || now.getDate(),
                plugin.storage.customHour !== undefined ? plugin.storage.customHour : now.getHours(),
                plugin.storage.customMinute !== undefined ? plugin.storage.customMinute : now.getMinutes(), 0, 0)
          ).toISOString();

          const id = genId(timestamp);
          await createFakeMessage(channelId, uid, content, timestamp, id);
          saveMessage(channelId, uid, content, id, timestamp);
          showToast("Fake message sent.");
        },
      }),
    );
  }

  function ConversationSection({ tick, setTick }) {
    return common.React.createElement(FormSection, { title: "Conversation Builder" },
      common.React.createElement(FormInput, {
        title: "Conversation",
        placeholder: "One line each:\nuserId [time] [^reply] - message\n\nme = you  |  them = the User ID above\n^N = reply to line N  |  ^ = reply to previous\n\nExample:\nme [9pm] - hey\nthem [9:01pm] ^1 - hi back\nme ^ - lol",
        value: plugin.storage.conversationText || "",
        onChange: (v) => { plugin.storage.conversationText = v || ""; },
        multiline: true,
      }),
      common.React.createElement(FormRow, {
        label: "Build Conversation",
        subLabel: "Format: userId [time] [^reply] - message. 'me' = you, 'them' = the User ID above. Reply with ^N (the Nth message) or ^ (previous message). Time optional (9pm, 21:00, 2024-12-25 14:30); untimed lines are spaced 1 min apart. Honors the UTC toggle.",
        onPress: async () => { await runConversation(); },
      }),
      common.React.createElement(FormInput, {
        title: "Save this conversation as (optional)",
        placeholder: "A name to find it later",
        value: plugin.storage.convoSaveName || "",
        onChange: (v) => { plugin.storage.convoSaveName = v || ""; },
      }),
      common.React.createElement(FormRow, {
        label: "Save conversation",
        subLabel: "Keeps the text above on this device so you can reload it later. Stays local - nothing leaves your device.",
        onPress: () => {
          const txt = plugin.storage.conversationText || "";
          if (!txt.trim()) { showToast("Nothing to save - the conversation box is empty."); return; }
          const arr = (plugin.storage.savedConvos || []).slice();
          const name = ("" + (plugin.storage.convoSaveName || "")).trim() || "Saved " + (arr.length + 1);
          arr.push({ name, text: txt });
          plugin.storage.savedConvos = arr;
          plugin.storage.convoSaveName = "";
          showToast('Saved "' + name + '".');
          setTick((k) => k + 1);
        },
      }),
      (plugin.storage.savedConvos || []).length
        ? common.React.createElement(FormRow, {
            label: "Clear saved conversations",
            subLabel: (plugin.storage.savedConvos || []).length + " saved. Removes them all.",
            onPress: () => { plugin.storage.savedConvos = []; showToast("Cleared saved conversations."); setTick((k) => k + 1); },
          })
        : null,
      ...(plugin.storage.savedConvos || []).map((sc, idx) =>
        common.React.createElement(FormRow, {
          key: "sc" + idx,
          label: sc.name,
          subLabel: "Tap to load this into the builder.",
          onPress: () => { plugin.storage.conversationText = sc.text || ""; showToast('Loaded "' + sc.name + '".'); setTick((k) => k + 1); },
        })
      ),
    );
  }

  function ProfileSection({ tick, setTick }) {
    const profileId = plugin.storage.profileId || "";
    const profiles = plugin.storage.profiles || {};
    const profileKeys = Object.keys(profiles);

    return common.React.createElement(FormSection, { title: "Fake Profiles" },
      common.React.createElement(FormRow, {
        label: "Override a user ID's display name and avatar across the app (chat, profiles, server member lists). Either set a name/avatar, or mirror another user's profile.",
      }),
      common.React.createElement(FormRow, {
        label: "Patch status (for debugging)",
        subLabel: patchInfo,
      }),
      common.React.createElement(FormInput, {
        title: "User ID", placeholder: "User ID to customize", value: profileId,
        onChange: (v) => { plugin.storage.profileId = (v || "").replace(/[^0-9]/g, ""); },
        keyboardType: "number-pad",
      }),
      common.React.createElement(FormInput, {
        title: "Display Name", placeholder: "Name to show (optional)", value: plugin.storage.profileName || "",
        onChange: (v) => { plugin.storage.profileName = v || ""; },
      }),
      common.React.createElement(FormInput, {
        title: "Avatar URL", placeholder: "https://... image link (optional)", value: plugin.storage.profileAvatar || "",
        onChange: (v) => { plugin.storage.profileAvatar = v || ""; },
      }),
      common.React.createElement(FormInput, {
        title: "Copy From User ID", placeholder: "Mirror this user's name + pfp (optional)", value: plugin.storage.profileSource || "",
        onChange: (v) => { plugin.storage.profileSource = (v || "").replace(/[^0-9]/g, ""); },
        keyboardType: "number-pad",
      }),
      common.React.createElement(FormInput, {
        title: "Server Member Since date (optional)", placeholder: "e.g. 4/3/26  (blank = your account date)", value: plugin.storage.profileJoined || "",
        onChange: (v) => { plugin.storage.profileJoined = v || ""; },
      }),
      common.React.createElement(FormInput, {
        title: "Discord account created date (optional)", placeholder: "e.g. 4/3/26  (blank = copies your account)", value: plugin.storage.profileAccount || "",
        onChange: (v) => { plugin.storage.profileAccount = v || ""; },
      }),
      common.React.createElement(FormRow, {
        label: "Render as my own profile (experimental)",
        subLabel: "Makes opening this user's profile show the self-profile layout (Edit Profile button). May break that profile screen; turn off if it crashes.",
        trailing: common.React.createElement(FormSwitch, {
          value: plugin.storage.profileSelf === true,
          onValueChange: (v) => { plugin.storage.profileSelf = v; },
        }),
      }),
      common.React.createElement(FormRow, {
        label: "Save Profile",
        onPress: () => { saveProfile(); setTick((k) => k + 1); },
      }),
      common.React.createElement(FormRow, {
        label: "Cache my profile now (for banner/bio)",
        subLabel: "Fetches every source profile so banner, bio, pronouns and accent are available to copy.",
        leading: FormRow.Icon ? common.React.createElement(FormRow.Icon, { source: assets.getAssetIDByName("ic_download_24px") }) : undefined,
        onPress: () => {
          try {
            const count = prefetchSources();
            showToast(count
              ? "Fetching " + count + " source profile(s). Reopen the target in a moment."
              : "No mirror sources set. Add a Copy From User ID first.");
          } catch { showToast("Couldn't trigger a profile fetch on this build."); }
        },
      }),
      common.React.createElement(FormRow, {
        label: "Remove This Profile",
        subLabel: "Deletes the profile for the User ID above.",
        leading: FormRow.Icon ? common.React.createElement(FormRow.Icon, { source: assets.getAssetIDByName("ic_trash_24px") }) : undefined,
        onPress: () => { removeProfile(); setTick((k) => k + 1); },
      }),
      profileKeys.length
        ? common.React.createElement(FormRow, { label: "Saved profiles (" + profileKeys.length + ") - tap to edit:" })
        : null,
      ...profileKeys.map((key) => {
        const prof = profiles[key] || {};
        return common.React.createElement(FormRow, {
          key,
          label: (prof.name || (prof.sourceId ? "(mirror)" : "(no name)")) + "  -  " + key,
          subLabel: prof.sourceId ? "Mirrors user " + prof.sourceId : prof.avatar ? "Custom avatar set" : "Name only",
          onPress: () => {
            plugin.storage.profileId = key;
            plugin.storage.profileName = prof.name || "";
            plugin.storage.profileAvatar = prof.avatar || "";
            plugin.storage.profileSource = prof.sourceId || "";
            plugin.storage.profileJoined = prof.joinedAt ? fmtSimple(prof.joinedAt) : "";
            plugin.storage.profileAccount = prof.accountDate ? fmtSimple(prof.accountDate) : "";
            plugin.storage.profileSelf = !!prof.self;
            setTick((k) => k + 1);
          },
        });
      }),
    );
  }

  function SavedMessagesSection({ setTick }) {
    const savedCount = (plugin.storage.savedMessages || []).length;

    return common.React.createElement(FormSection, { title: "Saved Messages" },
      common.React.createElement(FormRow, {
        label: "Clear Saved Messages",
        subLabel: savedCount + " saved. These replay each time you reopen a channel - clearing stops that.",
        leading: FormRow.Icon ? common.React.createElement(FormRow.Icon, { source: assets.getAssetIDByName("ic_trash_24px") }) : undefined,
        onPress: () => { clearSavedMessages(); setTick((k) => k + 1); },
      }),
      common.React.createElement(FormRow, {
        label: "Remove All Spoofed Messages",
        subLabel: "Deletes every spoofed message from view now and clears the saved list.",
        leading: FormRow.Icon ? common.React.createElement(FormRow.Icon, { source: assets.getAssetIDByName("ic_trash_24px") }) : undefined,
        onPress: () => { removeAllFakeMessages(); setTick((k) => k + 1); },
      }),
    );
  }

  // ─── Main Plugin Export ─────────────────────────────────────────────────────

  const PluginExport = {
    onLoad() {
      try { cleanupCallbacks.forEach((fn) => { try { fn(); } catch {} }); } catch {}
      cleanupCallbacks = [];

      // ── Load-time diagnostics: report any missing critical modules ──
      try {
        const missing = _loadErrors.slice();
        if (!UserStore) missing.push("UserStore");
        if (!ChannelModule) missing.push("ChannelModule");
        if (!ChannelSelection) missing.push("ChannelSelection");
        if (!UserStoreByName) missing.push("UserStoreByName");
        if (!FluxDispatcher) missing.push("FluxDispatcher");
        if (!MessageActions) missing.push("MessageActions");
        if (!FormRow) missing.push("FormRow");
        let cmdApi = null;
        try {
          if (typeof vendetta !== "undefined" && vendetta?.commands?.registerCommand) cmdApi = vendetta.commands;
          if (!cmdApi) cmdApi = metro.findByProps("registerCommand");
        } catch {}
        if (!cmdApi) missing.push("CommandAPI");

        if (missing.length) {
          showToast("[Spoofer] Missing: " + missing.join(", "));
          warn("Missing modules:", missing.join(", "));
        } else {
          showToast("[Spoofer] All modules OK");
        }
      } catch (err) { warn("diagnostics failed", err); }

      try { registerCommands(); } catch (err) { warn("registerCommands failed", err); showToast("[Spoofer] registerCommands threw: " + (err.message || "?")); }

      try { patchMessageActions(); } catch (err) { warn("patchMessageActions failed", err); }
      try { patchAvatars(); } catch (err) { warn("patchAvatars failed", err); }
      try { patchNames(); } catch (err) { warn("patchNames failed", err); }
      try { patchBannersAndDecorations(); } catch (err) { warn("patchBannersAndDecorations failed", err); }
      try { patchUserProfile(); } catch (err) { warn("patchUserProfile failed", err); }
      try { patchSelfIdentity(); } catch (err) { warn("patchSelfIdentity failed", err); }
      try { patchActionSheet(); } catch (err) { warn("patchActionSheet failed", err); }
      try { buildPatchInfo(); } catch (err) { warn("buildPatchInfo failed", err); }

      try {
        const contextModule = metro.findByProps("openUserContextMenu");
        if (contextModule?.openUserContextMenu) {
          contextMenuPatch = patcher.after("openUserContextMenu", contextModule, (args) => {
            const uid = args[0]?.userId || args[0]?.user?.id;
            if (uid) plugin.storage.userId = uid;
          });
        }
      } catch {}

      try {
        if (FluxDispatcher) {
          channelSelectSub = FluxDispatcher.subscribe("CHANNEL_SELECT", (event) => {
            const channelId = event?.channelId;
            if (channelId) setTimeout(() => replayChannel(channelId), 500);
          });
        }
      } catch {}

      const currentChannel = getCurrentChannelId();
      if (currentChannel) setTimeout(() => replayChannel(currentChannel), 1000);

      try { prefetchSources(); } catch {}

      log("Plugin loaded successfully");
    },

    onUnload() {
      try { cleanupCallbacks.forEach((fn) => { try { fn(); } catch {} }); } catch {}
      cleanupCallbacks = [];

      if (contextMenuPatch) { contextMenuPatch(); contextMenuPatch = null; }
      if (channelSelectSub) { try { FluxDispatcher?.unsubscribe("CHANNEL_SELECT", channelSelectSub); } catch {} channelSelectSub = null; }
      if (dispatchGuard) { dispatchGuard(); dispatchGuard = null; }

      patches.forEach((unpatch) => unpatch());
      patches = [];
      originalMessages.clear();
      avatarSourceCache.clear();

      log("Plugin unloaded");
    },

    settings(props) {
      const [tick, setTick] = common.React.useState(0);
      let nav = null;
      try { if (NavigationModule?.useNavigation) nav = NavigationModule.useNavigation(); } catch {}

      const Container = props?.inSheet ? common.React.Fragment : FormContainer;

      return common.React.createElement(Container, {},
        common.React.createElement(FormRow, {
          label: "Close Panel",
          leading: FormRow.Icon
            ? common.React.createElement(FormRow.Icon, { source: assets.getAssetIDByName("ic_close") })
            : undefined,
          onPress: () => {
            if (props?.inSheet) { try { ActionSheetModule.hideActionSheet(); } catch {} }
            else closePanel(nav);
          },
        }),
        common.React.createElement(FakeMessageSection, { tick, setTick }),
        common.React.createElement(TimestampSection, { setTick }),
        common.React.createElement(ConversationSection, { tick, setTick }),
        common.React.createElement(ProfileSection, { tick, setTick }),
        common.React.createElement(SavedMessagesSection, { setTick }),
      );
    },
  };

  return (
    (exports.default = PluginExport),
    Object.defineProperty(exports, "__esModule", { value: true }),
    exports
  );
})(
  {},
  (vendetta.metro && vendetta.metro.common) || {},
  vendetta.metro || {},
  (vendetta.ui && vendetta.ui.components) || {},
  vendetta.plugin || { storage: (function () {
    try {
      var S = vendetta.storage;
      if (S && typeof S.createStorage === "function" && typeof S.createMMKVBackend === "function") {
        var st = S.createStorage(S.createMMKVBackend("local-message-spoofer"));
        if (typeof S.awaitSyncWrapper === "function") { try { S.awaitSyncWrapper(st); } catch (e) {} }
        return st;
      }
    } catch (e) {}
    return {};
  })() },
  vendetta.patcher || {},
  (vendetta.ui && vendetta.ui.assets) || {},
  vendetta.utils || {},
);
