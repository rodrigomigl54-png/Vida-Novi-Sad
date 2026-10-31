// Rezervacija stola → WhatsApp
import { $, waUrl, openWa, fmtDate } from "./util.js";
import { t, getLang, onLangChange } from "./i18n.js";
import { fillTimeSelect, setupDate, validateForm, rules } from "./forms.js";

let site;

export function buildReservationMessage(d, lang = getLang()) {
  const seat = { any: "reserve.seatAny", terrace: "reserve.seatTerrace", inside: "reserve.seatInside" }[d.seating] || "reserve.seatAny";
  const lines = [
    `🌿 *${t("wa.reserveTitle")}*`, "",
    `*${t("form.name")}:* ${d.name.trim()}`,
    `*${t("form.phone")}:* ${d.phone.trim()}`,
    `*${t("form.date")}:* ${fmtDate(d.date, lang)}`,
    `*${t("form.time")}:* ${d.time}`,
    `*${t("form.guests")}:* ${d.guests}`,
    `*${t("wa.seating")}:* ${t(seat)}`,
  ];
  if (d.kids) lines.push(`*Kids Corner:* ${t("wa.yes")}`);
  if (d.pet) lines.push(`*${t("wa.pet")}:* ${t("wa.yes")}`);
  if ((d.note || "").trim()) lines.push(`*${t("wa.note")}:* ${d.note.trim()}`);
  lines.push("", t("wa.reserveFoot"));
  return lines.join("\n");
}

function fillGuests() {
  const sel = $("#r-guests");
  const prev = sel.value || "2";
  const max = site.reservation?.maxGuests || 20;
  let html = "";
  for (let i = 1; i < max; i++) html += `<option value="${i}">${i}</option>`;
  html += `<option value="${max}+">${max}+</option>`;
  sel.innerHTML = html;
  sel.value = prev;
}

export function initReservation(siteData) {
  site = siteData;
  const form = $("[data-reserve-form]");
  const date = $("#r-date"), time = $("#r-time");
  const refresh = () => fillTimeSelect(time, date.value, site, site.reservation?.stepMinutes || 30);
  setupDate(date, site, refresh);
  refresh();
  fillGuests();
  onLangChange(refresh);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    form.querySelector("[data-form-done]").hidden = true;
    const d = validateForm(form, "r", [rules.name, rules.phone, rules.date(site), rules.time]);
    if (!d) return;
    const url = waUrl(site.contact.whatsapp, buildReservationMessage(d));
    window.__lastWaUrl = url;
    openWa(url);
    const done = form.querySelector("[data-form-done]");
    done.hidden = false; done.focus();
  });
}
