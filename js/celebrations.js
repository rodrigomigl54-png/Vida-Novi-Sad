// Proslave i rođendani — upit preko WhatsApp-a (features.celebrations)
import { $, waUrl, openWa, fmtDate } from "./util.js";
import { t, getLang, onLangChange } from "./i18n.js";
import { fillTimeSelect, setupDate, validateForm, rules } from "./forms.js";

let site;

export function buildCelebrationMessage(d, lang = getLang()) {
  const typeKey = { kids: "cel.typeKids", birthday: "cel.typeBirthday", party: "cel.typeParty", business: "cel.typeBusiness", other: "cel.typeOther" }[d.type];
  const lines = [
    `🎉 *${t("wa.celTitle")}*`, "",
    `*${t("cel.type")}:* ${t(typeKey)}`,
    `*${t("form.date")}:* ${fmtDate(d.date, lang)}`,
    `*${t("form.time")}:* ${d.time}`,
    `*${t("cel.adults")}:* ${d.adults || 0}`,
    `*${t("cel.kids")}:* ${d.kids || 0}`,
    `*Kids Corner:* ${t(d.kidsCorner ? "wa.yes" : "wa.no")}`,
    `*${t("wa.cake")}:* ${t(d.cake ? "wa.yes" : "wa.no")}`,
  ];
  if (d.cake && (d.cakeWishes || "").trim()) lines.push(`*${t("cel.cakeWishes")}:* ${d.cakeWishes.trim()}`);
  if ((d.budget || "").trim()) lines.push(`*${t("wa.budget")}:* ${d.budget.trim()} RSD`);
  lines.push(`*${t("form.name")}:* ${d.name.trim()}`, `*${t("form.phone")}:* ${d.phone.trim()}`);
  if ((d.note || "").trim()) lines.push(`*${t("wa.note")}:* ${d.note.trim()}`);
  return lines.join("\n");
}

export function initCelebrations(siteData) {
  site = siteData;
  if (!site.features.celebrations) return;
  const form = $("[data-cel-form]");
  const date = $("#c-date"), time = $("#c-time");
  const refresh = () => fillTimeSelect(time, date.value, site, 30);
  setupDate(date, site, refresh);
  refresh();
  onLangChange(refresh);
  const cake = form.querySelector("[data-cake-toggle]");
  cake.addEventListener("change", () => { form.querySelector("[data-cake-wishes]").hidden = !cake.checked; });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    form.querySelector("[data-form-done]").hidden = true;
    const d = validateForm(form, "c", [
      rules.date(site), rules.time,
      { name: "adults", key: "cel.errGuests", test: (x) => Number(x.adults || 0) + Number(x.kids || 0) > 0 },
      rules.name, rules.phone,
    ]);
    if (!d) return;
    const url = waUrl(site.contact.whatsapp, buildCelebrationMessage(d));
    window.__lastWaUrl = url;
    openWa(url);
    const done = form.querySelector("[data-form-done]");
    done.hidden = false; done.focus();
  });
}
