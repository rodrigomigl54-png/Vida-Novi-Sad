// Zajednička logika za forme koje šalju WhatsApp poruku (rezervacija, proslave)
import { $, zonedNow, hm, fmtHM, addDays, validPhone, escapeHtml } from "./util.js";
import { t } from "./i18n.js";

/** Popunjava <select> vremena: radno vreme, korak u minutima, za danas samo buduća vremena */
export function fillTimeSelect(select, dateStr, site, step = 30) {
  const tz = site.hours.timezone;
  const now = zonedNow(tz);
  const open = hm(site.hours.open);
  const last = hm(site.reservation?.lastSlot || "22:30");
  const prev = select.value;
  let from = open;
  if (dateStr === now.date) from = Math.max(open, Math.ceil((now.minutes + 1) / step) * step);
  const opts = [];
  for (let m = from; m <= last; m += step) opts.push(fmtHM(m));
  select.innerHTML = opts.length
    ? `<option value="">${escapeHtml(t("form.pickTime"))}</option>` + opts.map((v) => `<option value="${v}">${v}</option>`).join("")
    : `<option value="">${escapeHtml(t("form.noTimes"))}</option>`;
  if (opts.includes(prev)) select.value = prev;
  return opts.length;
}

/** Datum: najranije danas (Europe/Belgrade); ako danas više nema termina — sutra */
export function setupDate(input, site, onChange) {
  const now = zonedNow(site.hours.timezone);
  input.min = now.date;
  input.max = addDays(now.date, 365);
  if (!input.value) {
    const lastToday = hm(site.reservation?.lastSlot || "22:30");
    input.value = now.minutes >= lastToday ? addDays(now.date, 1) : now.date;
  }
  input.addEventListener("change", onChange);
  input.addEventListener("input", onChange);
}

export function showError(form, prefix, name, msg) {
  const input = form.querySelector(`[name="${name}"]`);
  const err = $(`#${prefix}-${name}-err`);
  if (err) err.textContent = msg || "";
  if (input) {
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (err) input.setAttribute("aria-describedby", err.id);
  }
  return !msg;
}

/** rules: [{ name, test(d) → bool, key }] */
export function validateForm(form, prefix, rules) {
  const d = Object.fromEntries(new FormData(form));
  form.querySelectorAll("input[type=checkbox]").forEach((c) => { d[c.name] = c.checked; });
  let first = null;
  rules.forEach((r) => {
    const ok = r.test(d);
    showError(form, prefix, r.name, ok ? "" : t(r.key));
    if (!ok && !first) first = form.querySelector(`[name="${r.name}"]`);
  });
  if (first) { first.focus(); return null; }
  return d;
}

export const rules = {
  name: { name: "name", test: (d) => (d.name || "").trim().length >= 2, key: "form.errName" },
  phone: { name: "phone", test: (d) => validPhone(d.phone), key: "form.errPhone" },
  date: (site) => ({ name: "date", key: "form.errDate", test: (d) => !!d.date && d.date >= zonedNow(site.hours.timezone).date }),
  time: { name: "time", test: (d) => !!d.time, key: "form.errTime" },
};
