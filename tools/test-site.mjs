// Automatski testovi sajta (Playwright). Pokretanje:
//   python3 -m http.server 8765   (u root folderu sajta, u drugom terminalu)
//   node tools/test-site.mjs [http://127.0.0.1:8765/]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const results = [];
const problems = [];
const ok = (name, cond, info = "") => { results.push(`${cond ? "✔" : "✘"} ${name}${info ? " — " + info : ""}`); if (!cond) process.exitCode = 1; };

const browser = await chromium.launch();

async function newPage(opts = {}, time) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Belgrade", acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`[console ${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 400 && !/google\./.test(r.url())) problems.push(`[${r.status()}] ${r.url()}`); });
  await page.route(/google\.com/, (r) => r.abort());
  if (time) await page.clock.setFixedTime(new Date(time));
  // presretni window.open (WhatsApp) — beleži URL umesto otvaranja
  await page.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; }; });
  return { ctx, page };
}
const ready = (page) => page.waitForFunction(() => window.__vida?.ready, null, { timeout: 15000 });
const lastWa = async (page) => decodeURIComponent((await page.evaluate(() => window.__opened.at(-1) || "")).split("?text=")[1] || "");

// ------------------------------------------------------------------ 1. INTRO (video)
{
  const { ctx, page } = await newPage({}, "2026-10-31T10:00:00+01:00");
  await page.goto(BASE);
  ok("intro: overlay je prikazan pri prvoj poseti", await page.evaluate(() => document.documentElement.classList.contains("intro-pending")));
  await page.waitForSelector("#intro.is-playing", { timeout: 8000 });
  ok("intro (telefon): koristi vertikalni video", (await page.$eval(".intro__video", (v) => v.currentSrc)).includes("intro-mobile"));
  ok("intro: scroll je zaključan", await page.evaluate(() => getComputedStyle(document.body).overflow === "hidden"));
  await page.waitForTimeout(1200);
  ok("intro: video se reprodukuje", await page.$eval(".intro__video", (v) => v.currentTime > 0.5 && !v.paused));
  await page.click(".intro__skip");
  await page.waitForTimeout(500);
  ok("intro: 'Preskoči' uklanja intro", (await page.$("#intro")) === null && !(await page.evaluate(() => document.documentElement.classList.contains("intro-pending"))));
  await page.waitForTimeout(800);
  ok("hero: posle intro-a kreće video petlja", await page.$eval("[data-hero-main]", (v) => !!v.currentSrc && v.currentSrc.includes("hero-morning-main")));
  await page.reload();
  await ready(page);
  ok("intro: ne ponavlja se u istoj sesiji", (await page.$("#intro")) === null);
  await ctx.close();
}
{
  // ceo intro bez preskakanja + logo (računar)
  const { ctx, page } = await newPage({ viewport: { width: 1440, height: 900 } }, "2026-10-31T10:00:00+01:00");
  await page.goto(BASE);
  await page.waitForSelector("#intro.is-playing", { timeout: 8000 });
  ok("intro (računar): koristi triptih video", (await page.$eval(".intro__video", (v) => v.currentSrc)).includes("intro-desktop"));
  await page.waitForSelector("#intro.is-logo", { timeout: 9000 });
  ok("intro: logo se pojavljuje na kraju", true);
  await page.waitForTimeout(900);
  await page.screenshot({ path: "/tmp/pw/t-intro-logo.png" });
  await page.waitForSelector("#intro", { state: "detached", timeout: 8000 });
  ok("intro: završava se sam i otvara sajt", true);
  await ctx.close();
}
{
  const { ctx, page } = await newPage({ reducedMotion: "reduce" }, "2026-10-31T10:00:00+01:00");
  await page.goto(BASE);
  await page.waitForSelector("#intro.is-logo", { timeout: 6000 });
  ok("intro: reduced-motion → statičan kadar + logo", true);
  await page.waitForSelector("#intro", { state: "detached", timeout: 4000 });
  ok("intro: reduced-motion → posle ~1s sajt", true);
  ok("hero: reduced-motion → bez videa (samo poster)", await page.$eval("[data-hero-main]", (v) => !v.currentSrc));
  await ctx.close();
}

// ------------------------------------------------------------------ POZIV
{
  const { ctx, page } = await newPage({}, "2026-10-31T12:00:00+01:00");
  await page.goto(BASE + "?nointro");
  await ready(page);
  const tels = await page.$$eval('a[href="tel:+381695332067"]', (as) => as.length);
  ok("poziv: tel: link u headeru, heroju, FAB-u, rezervaciji, proslavama, kontaktu", tels >= 7, String(tels));
  await page.evaluate(() => scrollTo(0, document.querySelector("#meni").offsetTop));
  await page.waitForTimeout(500);
  ok("poziv: dugme 'Pozovi' u donjoj traci na telefonu", await page.isVisible(".fab__btn--call") && (await page.textContent(".fab__btn--call")).includes("Pozovi"));
  await ctx.close();
}
{
  const { ctx, page } = await newPage({}, "2026-10-31T23:30:00+01:00");
  await page.goto(BASE + "?nointro");
  await ready(page);
  ok("poziv: van radnog vremena 'Zovi od 07:00'", (await page.textContent(".fab__btn--call")).includes("Zovi od 07:00"));
  await ctx.close();
}

// ------------------------------------------------------------------ 2/3. STATUS + DOBA DANA
const times = [["06:59", false, "closed"], ["07:00", true, "morning"], ["10:59", true, "morning"], ["11:00", true, "lunch"],
  ["16:59", true, "lunch"], ["17:00", true, "evening"], ["22:59", true, "evening"], ["23:00", false, "closed"]];
for (const [hhmm, open, tod] of times) {
  const { ctx, page } = await newPage({}, `2026-10-31T${hhmm}:00+01:00`);
  await page.goto(BASE + "?nointro");
  await ready(page);
  const s = await page.evaluate(() => ({ text: document.querySelector("[data-status-text]").textContent, closed: document.querySelector("[data-status]").classList.contains("is-closed"), tod: document.body.dataset.tod, lead: document.querySelector("[data-hero-lead]").textContent }));
  ok(`vreme ${hhmm}: ${open ? "otvoreno" : "zatvoreno"} + hero "${tod}"`, s.closed === !open && s.tod === tod, `${s.text} | ${s.lead}`);
  await ctx.close();
}
// leto (UTC+2) — provera vremenske zone
{
  const { ctx, page } = await newPage({ timezoneId: "America/New_York" }, "2026-07-15T06:30:00+02:00");
  await page.goto(BASE + "?nointro");
  await ready(page);
  ok("vremenska zona: Europe/Belgrade bez obzira na zonu uređaja (06:30 leto)", await page.evaluate(() => document.querySelector("[data-status]").classList.contains("is-closed")));
  await ctx.close();
}

// ------------------------------------------------------------------ 4. KORPA + WHATSAPP
{
  const { ctx, page } = await newPage({}, "2026-10-31T12:15:00+01:00");
  await page.goto(BASE + "?nointro");
  await ready(page);
  await page.click('.dish[data-id="classic-burger"] [data-add]');
  await page.click('.dish[data-id="classic-burger"] [data-add]');
  await page.selectOption('.dish[data-id="benedict"] [data-variant]', "batat");
  await page.click('.dish[data-id="benedict"] [data-add]');
  await page.click('.dish[data-id="homemade-caj-djumbir"] [data-add]');
  let count = await page.textContent(".cart-btn__count");
  ok("korpa: dodavanje (4 kom.)", count === "4", count);
  await page.reload(); await ready(page);
  count = await page.textContent(".cart-btn__count");
  ok("korpa: čuva se posle osvežavanja (localStorage)", count === "4");
  await page.click(".header-tools [data-open-cart]");
  await page.click('.cart-item:has-text("Homemade Čaj Đumbir") [data-qty="1"]');
  await page.click('.cart-item:has-text("Classic") [data-qty="-1"]');
  ok("korpa: +/− količina", (await page.textContent(".cart-btn__count")) === "4" && (await page.textContent('.cart-item:has-text("Classic") output')) === "1");
  await page.click('.cart-item:has-text("Homemade Čaj Đumbir") [data-remove]');
  ok("korpa: uklanjanje", (await page.textContent(".cart-btn__count")) === "2");
  const total = await page.textContent("[data-cart-total]");
  ok("korpa: ukupno (1330 + 890 = 2.220 RSD)", /2\.220 RSD/.test(total), total);
  await page.fill('.cart-item:has-text("Classic") [data-note]', "bez luka, molim");
  // validacija
  await page.click("[data-cart-send]");
  ok("korpa: validacija (prazno ime/telefon)", (await page.textContent("#o-name-err")).length > 0 && (await page.textContent("#o-phone-err")).length > 0);
  await page.fill("#o-name", "Đorđe Čavić Šćepanović Žižić");
  await page.fill("#o-phone", "069 533 2067");
  await page.check('input[name="type"][value="delivery"]');
  await page.click("[data-cart-send]");
  ok("korpa: validacija adrese za dostavu", (await page.textContent("#o-address-err")).length > 0);
  await page.fill("#o-address", "Bulevar oslobođenja 12, stan 4");
  await page.check('input[name="payment"][value="card"]');
  await page.fill("#o-note", "Zvono ne radi — pozovite. Hvala!");
  await page.click("[data-cart-send]");
  const url = await page.evaluate(() => window.__opened.at(-1));
  const text = await lastWa(page);
  ok("WhatsApp porudžbina: ispravan broj", url.startsWith("https://wa.me/381695332067?text="));
  ok("WhatsApp porudžbina: kodiranje (bez razmaka/novih redova u URL-u)", !/[\s\n]/.test(url) && url.includes("%0A"));
  for (const must of ["Đorđe Čavić Šćepanović Žižić", "069 533 2067", "1 × Classic", "1.330 RSD", "Benedict", "batat", "bez luka, molim", "2.220 RSD", "Dostava", "Bulevar oslobođenja 12, stan 4", "Kartica", "Zvono ne radi — pozovite. Hvala!", "Vreme"])
    ok(`WhatsApp porudžbina sadrži "${must}"`, text.includes(must));
  ok("korpa: ekran potvrde", await page.isVisible('[data-cart-view="done"]'));
  results.push("    poruka:\n" + text.split("\n").map((l) => "      " + l).join("\n"));
  await page.click("[data-cart-clear]");
  ok("korpa: pražnjenje posle slanja", (await page.textContent(".cart-btn__count")) === "0");
  await ctx.close();
}
// van radnog vremena
{
  const { ctx, page } = await newPage({}, "2026-10-31T23:30:00+01:00");
  await page.goto(BASE + "?nointro");
  await ready(page);
  await page.click('.dish[data-id="espresso"] [data-add]');
  await page.click(".header-tools [data-open-cart]");
  ok("zatvoreno: upozorenje u korpi", await page.isVisible("[data-cart-drawer] [data-closed-notice]"));
  const firstTime = await page.$eval("#o-time option", (o) => o.textContent);
  ok("zatvoreno: vremena počinju sutra od 07:30", /Sutra .* 07:30/.test(firstTime), firstTime);
  await page.fill("#o-name", "Ana"); await page.fill("#o-phone", "+381 64 123 4567"); await page.check('input[value="pickup"]');
  await page.click("[data-cart-send]");
  ok("zatvoreno: porudžbina se ipak može pripremiti (sa napomenom)", (await lastWa(page)).includes("07:00"));
  await ctx.close();
}

// ------------------------------------------------------------------ REZERVACIJA + PROSLAVA
{
  const { ctx, page } = await newPage({}, "2026-10-31T15:10:00+01:00");
  await page.goto(BASE + "?nointro");
  await ready(page);
  ok("rezervacija: datum ne može u prošlost (min = danas)", (await page.getAttribute("#r-date", "min")) === "2026-10-31");
  const opts = await page.$$eval("#r-time option", (os) => os.map((o) => o.value).filter(Boolean));
  ok("rezervacija: danas samo buduća vremena, korak 30 min, do 22:30", opts[0] === "15:30" && opts.at(-1) === "22:30" && opts.length === 15, `${opts[0]}…${opts.at(-1)} (${opts.length})`);
  await page.fill("#r-date", "2026-11-01");
  const opts2 = await page.$$eval("#r-time option", (os) => os.map((o) => o.value).filter(Boolean));
  ok("rezervacija: drugi dan od 07:00", opts2[0] === "07:00");
  await page.click("[data-reserve-form] [type=submit]");
  ok("rezervacija: validacija", (await page.textContent("#r-name-err")).length > 0);
  await page.fill("#r-name", "Željko Šarić");
  await page.fill("#r-phone", "064 111 2233");
  await page.selectOption("#r-time", "19:30");
  await page.selectOption("#r-guests", "20+");
  await page.check('[data-reserve-form] input[value="terrace"]');
  await page.check('[data-reserve-form] input[name="kids"]');
  await page.check('[data-reserve-form] input[name="pet"]');
  await page.fill("#r-note", "Rođendan — sto pored biljaka");
  await page.click("[data-reserve-form] [type=submit]");
  const text = await lastWa(page);
  for (const must of ["Željko Šarić", "064 111 2233", "1. 11. 2026.", "19:30", "20+", "Terasa", "Kids Corner", "Ljubimac", "Rođendan — sto pored biljaka"]) ok(`WhatsApp rezervacija sadrži "${must}"`, text.includes(must));
  results.push("    poruka:\n" + text.split("\n").map((l) => "      " + l).join("\n"));

  await page.selectOption("#c-type", "kids");
  await page.fill("#c-date", "2026-11-14");
  await page.selectOption("#c-time", "12:00");
  await page.fill("#c-adults", "6"); await page.fill("#c-kids", "12");
  await page.check('[data-cel-form] input[name="kidsCorner"]');
  await page.check('[data-cel-form] input[name="cake"]');
  await page.fill("#c-cake", "Čokoladna raw torta, natpis „Srećan rođendan, Đurđa“");
  await page.fill("#c-budget", "1500");
  await page.fill("#c-name", "Mirjana Đukić"); await page.fill("#c-phone", "063 555 777");
  await page.click("[data-cel-form] [type=submit]");
  const t2 = await lastWa(page);
  for (const must of ["Dečiji rođendan", "14. 11. 2026.", "12:00", "6", "12", "Kids Corner:* da", "Cela torta:* da", "Srećan rođendan, Đurđa", "1500 RSD", "Mirjana Đukić", "063 555 777"]) ok(`WhatsApp proslava sadrži "${must}"`, t2.includes(must));
  results.push("    poruka:\n" + t2.split("\n").map((l) => "      " + l).join("\n"));
  await ctx.close();
}

// ------------------------------------------------------------------ 5. BOWL BUILDER
{
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, "2026-10-31T10:00:00+01:00");
  await page.goto(BASE + "?nointro");
  await ready(page);
  ok("bowl: podrazumevano isključen (features.bowlBuilder=false)", !(await page.isVisible("#bowl")));
  await page.goto(BASE + "?nointro&preview=bowlBuilder");
  await ready(page);
  ok("bowl: ?preview=bowlBuilder ga prikazuje", await page.isVisible("#bowl"));
  await page.click('[data-ing="acai"]');
  await page.click("[data-bowl-next]");
  for (const id of ["banana", "jagoda", "kivi"]) { await page.click(`[data-ing="${id}"]`); await page.waitForTimeout(700); }
  await page.click('[data-ing="mango"]');
  ok("bowl: maksimum po koraku poštovan", (await page.evaluate(() => window.__bowl.sel.fruit.length)) === 3);
  await page.click('[data-ing="jagoda"]'); await page.waitForTimeout(500);
  ok("bowl: uklanjanje sastojka", JSON.stringify(await page.evaluate(() => window.__bowl.sel.fruit)) === '["banana","kivi"]');
  await page.click("[data-bowl-next]");
  await page.click('[data-ing="granola"]'); await page.waitForTimeout(700);
  await page.click('[data-ing="kokos"]'); await page.waitForTimeout(700);
  await page.click("[data-bowl-next]");
  await page.click('[data-ing="med"]'); await page.waitForTimeout(1000);
  const bands = await page.$$eval("[data-layer-bands] > g", (gs) => gs.filter((g) => !g.dataset.removing).map((g) => g.dataset.id));
  ok("bowl: sastojci u bowl-u (trake)", JSON.stringify(bands) === '["banana","kivi","granola","kokos"]', bands.join(","));
  ok("bowl: cena na upit (nema potvrđenih cena)", (await page.textContent("[data-bowl-total]")) === "Cena na upit");
  await page.screenshot({ path: "/tmp/pw/t-bowl.png", clip: await (await page.$("#bowl .bowl__grid")).boundingBox() });
  await page.click("[data-bowl-next]");
  await page.waitForSelector("[data-bowl-summary]:not([hidden])");
  await page.waitForTimeout(400);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-bowl-download]")]);
  const path = await dl.path();
  const fs = await import("node:fs");
  const buf = fs.readFileSync(path);
  ok("bowl: PNG izvoz", dl.suggestedFilename() === "moj-vida-bowl.png" && buf.slice(1, 4).toString() === "PNG" && buf.length > 20000, `${buf.length} B`);
  fs.copyFileSync(path, "/tmp/pw/t-bowl-card.png");
  await page.click("[data-bowl-add]");
  await page.click(".header-tools [data-open-cart]");
  const ings = await page.textContent(".cart-item__ings");
  ok("bowl: u korpi sa svim sastojcima", ["Acai", "Banana", "Kivi", "granola", "Kokos", "Med"].every((x) => ings.includes(x)), ings);
  await ctx.close();
}
{
  // proračun cene kad vlasnik upiše cene (simulirano)
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, "2026-10-31T10:00:00+01:00");
  await page.route(/data\/bowl\.json/, async (route) => {
    const res = await route.fetch(); const j = await res.json();
    j.basePrice = 700; j.ingredients.forEach((i, k) => { i.price = i.step === "base" ? 0 : 50 + (k % 3) * 10; });
    route.fulfill({ json: j });
  });
  await page.goto(BASE + "?nointro&preview=bowlBuilder");
  await ready(page);
  await page.click('[data-ing="acai"]'); await page.click("[data-bowl-next]");
  await page.click('[data-ing="banana"]'); await page.waitForTimeout(800);
  const expect = await page.evaluate(() => window.__bowl.priceInfo().total);
  await page.waitForTimeout(700);
  const shown = await page.textContent("[data-bowl-total]");
  ok("bowl: cena = osnova + dodaci (sa test cenama)", shown === `${expect.toLocaleString("sr-Latn-RS")} RSD` || shown.replace(/\D/g, "") === String(expect), `${shown} / ${expect}`);
  await ctx.close();
}

// ------------------------------------------------------------------ 6. I18N
{
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, "2026-10-31T10:00:00+01:00");
  await page.goto(BASE + "?nointro&preview=bowlBuilder");
  await ready(page);
  await page.click('.lang__btn[data-lang="en"]');
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const skip = (el) => el.closest(".dish__name, .contact__list, .site-footer, .menu-cat__title, .chip, .cart-item, [data-mood-chips], .hero__cats, [data-menu-cats], .lang, .brand, script, style, svg, noscript, [hidden], .ing, .bowl__summary-list");
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode, el = n.parentElement;
      if (!n.textContent.trim() || skip(el) || !el.offsetParent) continue;
      if (/[čćšžđČĆŠŽĐ]/.test(n.textContent)) out.push(n.textContent.trim().slice(0, 60));
    }
    return { lang: document.documentElement.lang, missing: [...window.__vida.missing], serbian: out, title: document.title };
  });
  ok("i18n: EN — nema nedostajućih ključeva", info.missing.length === 0, info.missing.join(", "));
  ok("i18n: EN — nema srpskog teksta van naziva jela/adresa", info.serbian.length === 0, info.serbian.slice(0, 8).join(" | "));
  ok("i18n: lang atribut i naslov", info.lang === "en" && /healthy food/.test(info.title));
  await page.reload(); await ready(page);
  ok("i18n: izbor jezika se pamti", (await page.evaluate(() => document.documentElement.lang)) === "en");
  await page.click('.lang__btn[data-lang="sr"]');
  ok("i18n: povratak na SR", (await page.evaluate(() => document.documentElement.lang)) === "sr-Latn");
  await ctx.close();
}

// ------------------------------------------------------------------ 7. GALERIJA
{
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, "2026-10-31T10:00:00+01:00");
  await page.goto(BASE + "?nointro");
  await ready(page);
  const track = await page.$("[data-gal-track]");
  await track.scrollIntoViewIfNeeded();
  const sl = () => page.$eval("[data-gal-track]", (t) => t.scrollLeft);
  await page.click("[data-gal-next]"); await page.waitForTimeout(700);
  const a = await sl();
  ok("galerija: strelica napred", a > 50, String(a));
  await page.click("[data-gal-prev]"); await page.waitForTimeout(700);
  ok("galerija: strelica nazad", (await sl()) < a);
  // sačekaj da se scroll potpuno smiri pre prevlačenja
  for (let prev = -1, i = 0; i < 30; i++) { const cur = await sl(); if (cur === prev) break; prev = cur; await page.waitForTimeout(150); }
  await page.$eval("[data-gal-track]", (t) => t.scrollIntoView({ behavior: "instant", block: "center" }));
  await page.waitForTimeout(300);
  const box = await track.boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  ok("galerija: drag mišem", (await sl()) > 100, String(await sl()));
  const before = await sl();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(600, 0); await page.waitForTimeout(900);
  ok("galerija: trackpad / horizontalni točkić", (await sl()) > before, `${before} → ${await sl()}`);
  await ctx.close();
}
{
  const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, "2026-10-31T10:00:00+01:00");
  await page.goto(BASE + "?nointro");
  await ready(page);
  await page.$eval("[data-gal-track]", (t) => t.scrollIntoView({ behavior: "instant", block: "center" }));
  await page.waitForTimeout(200);
  const box = await (await page.$("[data-gal-track]")).boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const y = Math.round(box.y + box.height / 2);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 330, y }] });
  for (let i = 1; i <= 12; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 330 - i * 25, y }] }); await page.waitForTimeout(16); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(800);
  const left = await page.$eval("[data-gal-track]", (t) => t.scrollLeft);
  ok("galerija: swipe prstom", left > 50, String(left));
  ok("galerija: strelice skrivene na dodiru", !(await page.isVisible("[data-gal-next]")));
  await ctx.close();
}

// ------------------------------------------------------------------ 8. FEATURE FLAGOVI
{
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, "2026-10-31T10:00:00+01:00");
  await page.goto(BASE + "?nointro&features=celebrations:0,moodFilter:0,bowlBuilder:0,delivery:0,timeOfDayHero:0");
  await ready(page);
  ok("flag celebrations=0: sekcija i link sakriveni", !(await page.isVisible("#proslave")) && !(await page.isVisible('.nav a[href="#proslave"]')));
  ok("flag moodFilter=0: sekcija sakrivena", !(await page.isVisible("#raspolozenje")));
  ok("flag bowlBuilder=0: sekcija sakrivena", !(await page.isVisible("#bowl")));
  await page.click('.dish[data-id="espresso"] [data-add]');
  await page.click(".header-tools [data-open-cart]");
  ok("flag delivery=0: samo preuzimanje", !(await page.isVisible('input[value="delivery"] + span')) && (await page.isChecked('input[value="pickup"]')));
  ok("flag timeOfDayHero=0: uvek jutarnji hero", (await page.evaluate(() => document.body.dataset.tod)) === "morning");
  const gap = await page.evaluate(() => { const a = document.querySelector("#poruci").getBoundingClientRect(), m = document.querySelector("#meni").getBoundingClientRect(); return a.top - m.bottom; });
  ok("flagovi: bez praznog prostora između sekcija", gap >= -1 && gap < 2, String(gap));
  await ctx.close();
}
{
  const { ctx, page } = await newPage({}, "2026-10-31T10:00:00+01:00");
  await page.goto(BASE + "?features=intro:0");
  await ready(page);
  ok("flag intro=0: bez intro-a", (await page.$("#intro")) === null && !(await page.evaluate(() => document.documentElement.classList.contains("intro-pending"))));
  await ctx.close();
}

// ------------------------------------------------------------------ 9. KONZOLA / 404
ok("nema grešaka u konzoli i 404 odgovora", problems.length === 0, problems.slice(0, 10).join("\n   "));

await browser.close();
console.log(results.join("\n"));
