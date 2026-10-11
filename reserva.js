/* Reserva de visites — Kids&Us Valls.
   Tot el que es pot canviar (dies, hores, festius, finestra) és a CFG.
   Les reserves s'afegeixen al mateix bin d'entrada que /reunio-guarderia
   (clau "bookings"; "requests" de les guarderies no es toca). */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Reserva = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var CFG = {
    tz: "Europe/Madrid",
    horizonDays: 21,
    minLeadHours: 3,
    /* 0 diumenge … 2 dimarts … 5 divendres */
    weekdays: [2, 3, 4, 5],
    slots: [
      { time: "11:00", group: "Matí" },
      { time: "17:00", group: "Tarda" },
      { time: "18:00", group: "Tarda" }
    ],
    /* Dates tancades (YYYY-MM-DD) o intervals "YYYY-MM-DD..YYYY-MM-DD".
       El calendari lectiu del centre: 12/10, 8/12, Nadal, febrer i Setmana Santa. */
    closedDates: [
      "2026-10-12",
      "2026-12-08",
      "2026-12-22..2027-01-07",
      "2027-02-02",
      "2027-03-22..2027-03-30",
      "2027-06-22..2027-09-07"
    ],
    inbox: "6acb2b8cffd5d1605360b347",
    key: "$2a$10$tqzg0T0TDmHw9SSAGUxkXOq1x6R4reaRSxliIe3P5oqExuHfbJSNG",
    api: "https://api.jsonbin.io/v3/b/",
    mail: "https://formsubmit.co/ajax/josebargallorubio@gmail.com"
  };

  var WD = ["diumenge", "dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte"];
  var MO = ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"];

  function pad(n) { return String(n).padStart(2, "0"); }

  function madridParts(date) {
    var fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: CFG.tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    var o = {};
    fmt.formatToParts(date).forEach(function (p) { if (p.type !== "literal") o[p.type] = p.value; });
    return { y: o.year, m: o.month, d: o.day, hh: o.hour, mm: o.minute, ss: o.second, ymd: o.year + "-" + o.month + "-" + o.day };
  }

  function weekdayOfYmd(ymd) {
    var p = ymd.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  }

  function addDays(ymd, n) {
    var p = ymd.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function expandClosed(list) {
    var set = {};
    (list || []).forEach(function (item) {
      var s = String(item || "").trim();
      if (!s) return;
      var bits = s.split("..");
      if (bits.length === 1) { set[bits[0]] = 1; return; }
      var a = bits[0], b = bits[1];
      if (a > b) { var t = a; a = b; b = t; }
      for (var i = 0; i < 400 && a <= b; i++) { set[a] = 1; a = addDays(a, 1); }
    });
    return set;
  }

  /* Wall-clock a Europe/Madrid → instant (ms). */
  function zonedToMs(ymd, hm) {
    var p = ymd.split("-").map(Number);
    var t = hm.split(":").map(Number);
    var want = Date.UTC(p[0], p[1] - 1, p[2], t[0], t[1] || 0, 0);
    var ms = want;
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: CFG.tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    for (var i = 0; i < 4; i++) {
      var o = {};
      fmt.formatToParts(new Date(ms)).forEach(function (x) { if (x.type !== "literal") o[x.type] = x.value; });
      var got = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
      if (got === want) return ms;
      ms += want - got;
    }
    return ms;
  }

  function deMonth(name) {
    return /^[aeiouàèéíòóúü]/i.test(name) ? "d'" + name : "de " + name;
  }

  function normalizeSlot(raw) {
    var m = String(raw || "").trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})-(\d{1,2})(?::(\d{2}))?$/);
    if (!m) return "";
    return m[1] + "-" + pad(m[2]) + "-" + pad(m[3]) + "-" + pad(m[4]);
  }

  function slotTime(id) {
    var hour = id.slice(-2);
    var hit = CFG.slots.find(function (s) { return s.time.slice(0, 2) === hour; });
    return hit ? hit.time : hour + ":00";
  }

  function labelOf(id) {
    var ymd = id.slice(0, 10);
    var p = ymd.split("-").map(Number);
    var wd = WD[weekdayOfYmd(ymd)];
    var month = MO[p[1] - 1];
    return wd + " " + p[2] + " " + deMonth(month) + " de " + p[0] + " a les " + slotTime(id) + " h";
  }

  function buildDays(now, booked) {
    now = now || new Date();
    booked = booked || {};
    var today = madridParts(now).ymd;
    var end = addDays(today, CFG.horizonDays);
    var closed = expandClosed(CFG.closedDates);
    var minMs = CFG.minLeadHours * 3600000;
    var days = [];
    for (var ymd = today; ymd <= end; ymd = addDays(ymd, 1)) {
      var wd = weekdayOfYmd(ymd);
      if (CFG.weekdays.indexOf(wd) < 0) continue;
      if (closed[ymd]) continue;
      var slots = [];
      CFG.slots.forEach(function (s) {
        var id = ymd + "-" + s.time.slice(0, 2);
        var ms = zonedToMs(ymd, s.time);
        if (ms < now.getTime() + minMs) return;
        slots.push({ id: id, time: s.time, group: s.group, taken: !!booked[id] });
      });
      if (!slots.length) continue;
      var pp = ymd.split("-").map(Number);
      days.push({ ymd: ymd, wd: wd, weekday: WD[wd], day: pp[2], month: MO[pp[1] - 1], slots: slots });
    }
    return days;
  }

  function normEmail(s) { return String(s || "").trim().toLowerCase(); }

  function normPhone(s) {
    var d = String(s || "").replace(/\D/g, "");
    if (d.indexOf("0034") === 0) d = d.slice(4);
    if (d.length === 11 && d.indexOf("34") === 0) return d;
    if (d.length === 9) return "34" + d;
    return d;
  }

  function takenMap(rec) {
    var map = {};
    var list = rec && Array.isArray(rec.bookings) ? rec.bookings : [];
    list.forEach(function (b) {
      if (b && b.status === "booked" && b.slot) map[normalizeSlot(b.slot) || b.slot] = 1;
    });
    return map;
  }

  function validate(v) {
    if (String(v.company || "").trim()) return "bot";
    if (!String(v.nom || "").trim()) return "Si us plau, ompliu tots els camps obligatoris amb dades vàlides.";
    var email = String(v.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Revisa el correu electrònic.";
    var phone = String(v.telefon || "").replace(/\D/g, "");
    if (phone.indexOf("0034") === 0) phone = phone.slice(4);
    if (phone.length === 11 && phone.indexOf("34") === 0) phone = phone.slice(2);
    if (phone.length < 9) return "Revisa el telèfon: ha de tenir almenys 9 xifres.";
    if (!String(v.infant || "").trim()) return "Si us plau, ompliu tots els camps obligatoris amb dades vàlides.";
    if (!String(v.edat || "").trim()) return "Si us plau, ompliu tots els camps obligatoris amb dades vàlides.";
    return "";
  }

  function buildBooking(v, slotId) {
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      at: new Date().toISOString(),
      kind: "visita",
      status: "booked",
      nom: String(v.nom || "").trim(),
      email: normEmail(v.email),
      telefon: normPhone(v.telefon),
      infant: String(v.infant || "").trim(),
      edat: String(v.edat || "").trim(),
      comentaris: String(v.comentaris || "").trim(),
      slot: slotId,
      visitDate: slotId.slice(0, 10),
      visitTime: slotTime(slotId),
      visita: labelOf(slotId)
    };
  }

  function notesOf(b) {
    var lines = ["Reserva web · " + (b.visita || (b.visitDate + " " + b.visitTime))];
    if (b.infant) lines.push("Infant: " + b.infant + (b.edat ? " · edat " + b.edat : ""));
    if (b.email) lines.push("Correu: " + b.email);
    if (b.telefon) lines.push("Telèfon: " + b.telefon);
    if (b.comentaris) lines.push(b.comentaris);
    lines.push("id:" + b.id);
    return lines.join("\n");
  }

  /* Incorpora les reserves al llistat de leads de l'app (el mateix array que ja es desa).
     No torna a marcar novaVisita si aquella reserva ja s'havia aplicat. */
  function applyBookings(leads, bookings) {
    var changed = false;
    (bookings || []).forEach(function (b) {
      if (!b || b.status !== "booked" || !b.visitDate || !b.visitTime || !b.id) return;
      var email = normEmail(b.email);
      var lead = null;
      if (email) {
        for (var i = 0; i < leads.length; i++) {
          if (normEmail(leads[i] && leads[i].email) === email) { lead = leads[i]; break; }
        }
      }
      if (lead && Array.isArray(lead.bookingIds) && lead.bookingIds.indexOf(b.id) >= 0) return;
      if (!lead) {
        leads.push({
          id: "web-" + b.id,
          name: b.nom || "Reserva web",
          phone: b.telefon || "",
          email: email,
          visitDate: b.visitDate,
          visitTime: b.visitTime,
          group: "",
          notes: notesOf(b),
          source: "web reserva",
          status: "Nou",
          createdAt: b.at || new Date().toISOString(),
          novaVisita: true,
          bookingId: b.id,
          bookingIds: [b.id],
          childName: b.infant || "",
          childAge: b.edat || ""
        });
        changed = true;
        return;
      }
      lead.visitDate = b.visitDate;
      lead.visitTime = b.visitTime;
      if (!lead.email) lead.email = email;
      if (!lead.phone && b.telefon) lead.phone = b.telefon;
      lead.novaVisita = true;
      lead.bookingId = b.id;
      lead.bookingIds = (lead.bookingIds || []).concat([b.id]);
      if (!lead.childName && b.infant) lead.childName = b.infant;
      if (!lead.childAge && b.edat) lead.childAge = b.edat;
      var note = notesOf(b);
      if (note && String(lead.notes || "").indexOf("id:" + b.id) < 0) lead.notes = (lead.notes ? lead.notes + "\n" : "") + note;
      changed = true;
    });
    return changed;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function binGet(id) {
    var r = await fetch(CFG.api + (id || CFG.inbox) + "/latest", {
      headers: { "X-Master-Key": CFG.key },
      cache: "no-store"
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    var j = await r.json();
    return j.record || {};
  }

  async function binPut(rec, id) {
    var r = await fetch(CFG.api + (id || CFG.inbox), {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Master-Key": CFG.key },
      body: JSON.stringify(rec)
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
  }

  function futureCount(list, email, today) {
    return list.filter(function (b) {
      return b && b.status === "booked" && normEmail(b.email) === email && String(b.visitDate || "") >= today;
    }).length;
  }

  /* Llegeix, afegeix i comprova. Si dues famílies envien alhora, es reintenta. */
  async function saveBooking(entry) {
    var tries = 0;
    var last = null;
    while (tries < 5) {
      tries++;
      try {
        var rec = await binGet();
        if (!rec || typeof rec !== "object" || Array.isArray(rec)) rec = {};
        if (!Array.isArray(rec.requests)) rec.requests = [];
        var list = Array.isArray(rec.bookings) ? rec.bookings.slice() : [];
        var dup = list.find(function (b) {
          return b && b.status === "booked" && normEmail(b.email) === entry.email && (normalizeSlot(b.slot) || b.slot) === entry.slot;
        });
        if (dup) return dup;
        var taken = list.some(function (b) {
          return b && b.status === "booked" && (normalizeSlot(b.slot) || b.slot) === entry.slot;
        });
        if (taken) { var e = new Error("taken"); e.code = "taken"; throw e; }
        var today = madridParts(new Date()).ymd;
        if (futureCount(list, entry.email, today) >= 2) { var e2 = new Error("limit"); e2.code = "limit"; throw e2; }
        list.push(entry);
        rec.bookings = list;
        await binPut(rec);
        var check = await binGet();
        if ((check.bookings || []).some(function (b) { return b && b.id === entry.id; })) return entry;
      } catch (err) {
        if (err && (err.code === "taken" || err.code === "limit")) throw err;
        last = err;
      }
      await sleep(400 + Math.random() * 800);
    }
    var fail = new Error("retry");
    fail.cause = last;
    throw fail;
  }

  function mailPayload(entry) {
    return {
      nom: entry.nom,
      email: entry.email,
      telefon: entry.telefon,
      infant: entry.infant,
      edat: entry.edat,
      comentaris: entry.comentaris,
      visita: entry.visita,
      slot: entry.slot,
      _subject: "Nova reserva de visita: " + entry.nom + " (" + entry.visita + ")",
      _template: "table",
      _captcha: "false",
      _replyto: entry.email
    };
  }

  function icsFor(entry) {
    var p = entry.slot.split("-");
    var y = p[0], m = p[1], d = p[2], h = p[3];
    var st = y + m + d + "T" + h + "0000";
    var en = y + m + d + "T" + pad(Number(h) + 1) + "0000";
    var now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Kids&Us Valls//Visita//CA",
      "BEGIN:VEVENT",
      "UID:" + entry.slot + "-" + entry.id + "@kidsandusvalls",
      "DTSTAMP:" + now,
      "DTSTART;TZID=Europe/Madrid:" + st,
      "DTEND;TZID=Europe/Madrid:" + en,
      "SUMMARY:Visita a Kids&Us Valls",
      "LOCATION:Carrer Prat de la Riba\\, 12\\, 43800 Valls",
      "DESCRIPTION:Visita al centre Kids&Us Valls. Telèfon: 647 228 897",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
  }

  return {
    CFG: CFG, WD: WD, MO: MO,
    madridParts: madridParts, weekdayOfYmd: weekdayOfYmd, addDays: addDays,
    expandClosed: expandClosed, zonedToMs: zonedToMs, normalizeSlot: normalizeSlot,
    slotTime: slotTime, labelOf: labelOf, buildDays: buildDays,
    normEmail: normEmail, normPhone: normPhone, takenMap: takenMap,
    validate: validate, buildBooking: buildBooking, notesOf: notesOf, applyBookings: applyBookings,
    binGet: binGet, binPut: binPut, saveBooking: saveBooking, mailPayload: mailPayload, icsFor: icsFor
  };
});
