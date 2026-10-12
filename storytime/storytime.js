/* Storytime Esclat Valls (12/10/2026). Each signup:
   1) is saved in the form bin (app → Màrqueting → Formularis), always;
   2) becomes a lead (source "storytime-esclat", status Nou) in the app's main bin,
      unless the phone already is a lead or belongs to a family/student. */
(function () {
  var KEY = "$2a$10$tqzg0T0TDmHw9SSAGUxkXOq1x6R4reaRSxliIe3P5oqExuHfbJSNG";
  var API = "https://api.jsonbin.io/v3/b/";
  var FORM_BIN = "6acc9623ffd5d1605363885e";
  var MAIN_BIN = "6a9f5571ac6210605ab18f96";
  var ACTION = "1791800000000-story";
  var EVENT = "Storytime Gina Ginger & Charlie Chives · Esclat Valls · 12/10/2026 17:00";
  var NON_LEAD_TPL = /festiu|avis|recordatori|rebut|pagament|classe|alumne|familia|família|horari|tancat|vacances/i;

  function digits(s) { return String(s == null ? "" : s).replace(/\D/g, ""); }
  function phoneKey(s) { var d = digits(s); return d.length >= 9 ? d.slice(-9) : ""; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function get(id) {
    var r = await fetch(API + id + "/latest", { headers: { "X-Master-Key": KEY }, cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return (await r.json()).record || {};
  }
  async function put(id, rec) {
    var r = await fetch(API + id, { method: "PUT", headers: { "Content-Type": "application/json", "X-Master-Key": KEY }, body: JSON.stringify(rec) });
    if (!r.ok) throw new Error("HTTP " + r.status);
  }
  function familyKeys(rec, extra) {
    var out = {};
    var re = /(?:\+?34[\s.-]?)?[6789](?:[\s.-]?\d){8}/g;
    function scan(v) { (JSON.stringify(v == null ? "" : v).match(re) || []).forEach(function (x) { var k = phoneKey(x); if (k) out[k] = 1; }); }
    ["groups", "externGroups", "authorizations", "justified", "waCrm"].forEach(function (k) { scan(rec[k]); });
    (Array.isArray(rec.whatsappLog) ? rec.whatsappLog : []).forEach(function (e) {
      if (e && e.dir !== "in" && e.to && NON_LEAD_TPL.test(String(e.template || ""))) { var k = phoneKey(e.to); if (k) out[k] = 1; }
    });
    (extra || []).forEach(scan);
    return out;
  }

  async function saveEntry(entry) {
    for (var i = 0; i < 5; i++) {
      try {
        var rec = await get(FORM_BIN);
        var list = Array.isArray(rec.entries) ? rec.entries : [];
        var dup = list.find(function (e) { return e.phone === entry.phone && String(e.child).toLowerCase() === entry.child.toLowerCase(); });
        if (dup) return dup;
        list.push(entry); rec.entries = list;
        await put(FORM_BIN, rec);
        var chk = await get(FORM_BIN);
        if ((chk.entries || []).some(function (e) { return e.id === entry.id; })) return entry;
      } catch (e) {}
      await sleep(400 + Math.random() * 900);
    }
    throw new Error("retry");
  }

  /* returns {status:"lead"|"existing"|"family"|"skip", leadId} */
  async function saveLead(entry) {
    for (var i = 0; i < 5; i++) {
      try {
        var rec = await get(MAIN_BIN);
        if (!Array.isArray(rec.leads)) return { status: "skip" };
        var key = phoneKey(entry.phone);
        var hit = rec.leads.find(function (l) { return l && phoneKey(l.phone) === key; });
        if (hit) return { status: "existing", leadId: hit.id };
        var extra = [];
        for (var k of ["classBins", "payBins"]) {
          var m = rec[k] && typeof rec[k] === "object" ? rec[k] : {};
          for (var id of Object.values(m)) { try { extra.push(await get(id)); } catch (e) {} }
        }
        if (familyKeys(rec, extra)[key]) return { status: "family" };
        var lead = {
          id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
          name: entry.parent, phone: entry.phone, email: entry.email,
          visitDate: "", visitTime: "", group: "",
          notes: "Inscrit a Storytime Gina Ginger & Charlie Chives (Esclat Valls, 12/10/2026 17:00) · Infant: " + entry.child + " · Edat: " + entry.age + " anys" + (entry.email ? " · Email: " + entry.email : ""),
          source: "storytime-esclat", status: "Nou", accio: ACTION, event: EVENT,
          childName: entry.child, childAge: entry.age + " anys",
          createdAt: new Date().toISOString(), formEntryId: entry.id
        };
        rec.leads.push(lead);
        await put(MAIN_BIN, rec);
        var chk = await get(MAIN_BIN);
        if ((chk.leads || []).some(function (l) { return l && l.id === lead.id; })) return { status: "lead", leadId: lead.id };
      } catch (e) {}
      await sleep(500 + Math.random() * 1000);
    }
    return { status: "skip" };
  }

  async function markEntry(entry, res) {
    try {
      var rec = await get(FORM_BIN);
      var x = (rec.entries || []).find(function (e) { return e.id === entry.id; });
      if (!x) return;
      x.leadStatus = res.status; if (res.leadId) x.leadId = res.leadId;
      if (res.status === "family") x.existing = "si";
      await put(FORM_BIN, rec);
    } catch (e) {}
  }

  var f = document.getElementById("f"), err = document.getElementById("err"), go = document.getElementById("go");
  var last = {};
  f.addEventListener("submit", async function (ev) {
    ev.preventDefault(); err.textContent = "";
    var d = new FormData(f);
    if (d.get("website")) return;
    var parent = String(d.get("parent") || "").trim(), child = String(d.get("child") || "").trim();
    var phone = digits(d.get("phone")); if (phone.length === 11 && phone.indexOf("34") === 0) phone = phone.slice(2);
    var email = String(d.get("email") || "").trim(), age = String(d.get("age") || "");
    if (!parent) return (err.textContent = "Escriu el nom de la mare, el pare o tutor/a.");
    if (!/^[6789]\d{8}$/.test(phone)) return (err.textContent = "Revisa el telèfon: han de ser 9 xifres.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return (err.textContent = "Revisa el correu electrònic.");
    if (!child) return (err.textContent = "Escriu el nom de l'infant.");
    if (!age) return (err.textContent = "Tria l'edat de l'infant.");
    if (!d.get("consent")) return (err.textContent = "Cal acceptar l'ús de les dades per poder-vos inscriure.");
    go.disabled = true; go.textContent = "Enviant…";
    var entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), at: new Date().toISOString(),
      child: child, age: age + " anys", parent: parent, phone: "34" + phone, email: email,
      existing: "", source: "QR Esclat", comments: "", consent: true };
    try {
      var saved = await saveEntry(entry);
      if (saved === entry) { var res = await saveLead({ parent: parent, phone: entry.phone, email: email, child: child, age: age, id: entry.id }); await markEntry(entry, res); }
      last = { parent: parent, phone: phone, email: email };
      f.style.display = "none"; document.getElementById("ok").style.display = "block";
      document.getElementById("okt").innerHTML = "Hem apuntat <strong>" + child.replace(/[<>&]/g, "") + "</strong>.<br>Us esperem avui a les 17:00 a Esclat Valls!";
      window.scrollTo(0, 0);
    } catch (e) {
      err.textContent = "No s'ha pogut enviar. Torneu-ho a provar o truqueu al 647 228 897.";
    }
    go.disabled = false; go.textContent = "Inscriure'm";
  });
  document.getElementById("again").addEventListener("click", function () {
    f.reset(); f.parent.value = last.parent || ""; f.phone.value = last.phone || ""; f.email.value = last.email || "";
    document.getElementById("ok").style.display = "none"; f.style.display = "block"; f.child.focus();
  });
})();
