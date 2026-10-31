// "● Otvoreno sada · zatvara se u 23:00" / "Zatvoreno · otvara se u 07:00"
import { $$, hm, zonedNow } from "./util.js";
import { t, onLangChange } from "./i18n.js";

let site;
const subs = new Set();

/** { open, opensAt, closesAt, now } prema radnom vremenu iz site.json */
export function getStatus() {
  const h = site.hours;
  const now = zonedNow(h.timezone);
  const o = hm(h.open), c = hm(h.close);
  const openDay = h.days.includes(now.weekday);
  const open = openDay && now.minutes >= o && now.minutes < c;
  return { open, opensAt: h.open, closesAt: h.close, now };
}

function render() {
  const s = getStatus();
  $$("[data-status]").forEach((el) => {
    el.classList.toggle("is-closed", !s.open);
    el.querySelector("[data-status-text]").textContent = s.open
      ? t("status.open", { time: s.closesAt })
      : t("status.closed", { time: s.opensAt });
  });
  $$("[data-closed-notice]").forEach((el) => { el.hidden = s.open; });
  subs.forEach((fn) => fn(s));
}

export const onStatus = (fn) => { subs.add(fn); fn(getStatus()); };

export function initOpenStatus(siteData) {
  site = siteData;
  render();
  onLangChange(render);
  // osvežavanje na početku svakog minuta
  const tick = () => { render(); setTimeout(tick, 60000 - (Date.now() % 60000) + 50); };
  setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
}
