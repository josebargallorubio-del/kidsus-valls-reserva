/* Kids&Us Valls — reserves de visita que entren pel bin públic.
   Carregar-lo al final de l'app, després de guarderies.js:
   <script src="visites.js"></script>
   Llegeix bookings del mateix inbox que /reunio-guarderia, casa el lead pel correu
   (si no n'hi ha, en crea un amb origen "web reserva"), posa visitDate/visitTime,
   marca novaVisita i desa amb el sync normal. El calendari ja mostra aquests leads. */
(function () {
  "use strict";
  var INBOX = "6acb2b8cffd5d1605360b347";
  var KEY = "$2a$10$tqzg0T0TDmHw9SSAGUxkXOq1x6R4reaRSxliIe3P5oqExuHfbJSNG";
  var API = "https://api.jsonbin.io/v3/b/";

  function normEmail(s) { return String(s || "").trim().toLowerCase(); }
  function notesOf(b) {
    var lines = ["Reserva web · " + (b.visita || ((b.visitDate || "") + " " + (b.visitTime || "")))];
    if (b.infant) lines.push("Infant: " + b.infant + (b.edat ? " · edat " + b.edat : ""));
    if (b.email) lines.push("Correu: " + b.email);
    if (b.telefon) lines.push("Telèfon: " + b.telefon);
    if (b.comentaris) lines.push(b.comentaris);
    lines.push("id:" + b.id);
    return lines.join("\n");
  }
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

  function binGet() {
    return fetch(API + INBOX + "/latest", { headers: { "X-Master-Key": KEY }, cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) { return j.record || {}; });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { applyBookings: applyBookings, normEmail: normEmail, notesOf: notesOf };
  }
  if (typeof document === "undefined" || !document.querySelector || !document.querySelector("nav.tabs")) return;

  function pull() {
    if (typeof LEADS === "undefined" || !Array.isArray(LEADS)) return Promise.resolve(false);
    return binGet().then(function (rec) {
      return applyBookings(LEADS, rec.bookings || []);
    });
  }

  function after() {
    return pull().then(function (changed) {
      if (changed && typeof HAS_REMOTE_BASELINE !== "undefined" && HAS_REMOTE_BASELINE && typeof syncToServer === "function") {
        return syncToServer();
      }
    }).catch(function () {});
  }

  if (typeof syncFromServer === "function") {
    var prev = syncFromServer;
    syncFromServer = async function () {
      var r = await prev.apply(this, arguments);
      try { await after(); } catch (e) {}
      return r;
    };
  }
  if (typeof leadSourceLabel === "function") {
    var prevLabel = leadSourceLabel;
    leadSourceLabel = function (src) {
      if (src === "web reserva") return "Reserva web";
      return prevLabel.apply(this, arguments);
    };
  }
  if (typeof populateLeadSourceSelect === "function") {
    var prevSel = populateLeadSourceSelect;
    populateLeadSourceSelect = function (cur) {
      prevSel.apply(this, arguments);
      var sel = document.getElementById("leadSource");
      if (!sel) return;
      var has = false;
      for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === "web reserva") has = true;
      if (!has) {
        var o = document.createElement("option");
        o.value = "web reserva";
        o.textContent = "Reserva web";
        sel.appendChild(o);
      }
      if (cur) sel.value = cur;
    };
  }
  setInterval(function () {
    try {
      if (document.hidden || (typeof SESSION !== "undefined" && !SESSION)) return;
      after();
    } catch (e) {}
  }, 45000);
  /* El primer sync de l'app pot haver corregut abans de carregar aquest fitxer. */
  setTimeout(function () { try { if (typeof syncFromServer === "function") syncFromServer(false); } catch (e) {} }, 50);
})();
