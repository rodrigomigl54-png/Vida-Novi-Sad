# Vida Novi Sad — sajt „The Feel Good Place“

Statičan sajt (HTML + CSS + JavaScript), **bez baze podataka i bez build koraka**.

**Faza 1 (sada): pregled na GitHub Pages**
→ **https://rodrigomigl54-png.github.io/Vida-Novi-Sad/**
Sajt se objavljuje sa grane **`gh-pages`**. Svaka izmena koja se pushuje na tu granu je na linku posle ~1 minuta.

**Faza 2 (kad vlasnik odobri):** ceo folder se prebaci na Hostinger u `public_html` (odeljak 1).

Pre objave pročitaj **`REVIEW.md`**: tamo je spisak svega što treba potvrditi sa vlasnikom (cene, oznake, domen…).

---

## 0. GitHub Pages (pregled za vlasnika)

Jednokratno podešavanje (ako link još ne radi):
1. Na GitHub-u otvori repozitorijum → **Settings → Pages**.
2. *Build and deployment → Source:* **Deploy from a branch**.
3. *Branch:* **`gh-pages`**, folder **`/ (root)`** → **Save**.
4. Posle 1–2 minuta sajt je na `https://rodrigomigl54-png.github.io/Vida-Novi-Sad/`.

Na GitHub Pages fotografije jela se pronalaze preko GitHub API-ja (dovoljno je ubaciti fajl u `assets/dishes/` na grani `gh-pages`). Fajl `.htaccess` GitHub ignoriše; on je za Hostinger.

## 1. Postavljanje na Hostinger (kasnije)

1. Uloguj se u **hPanel → Websites → Manage → File Manager** (ili koristi FTP, npr. FileZilla).
2. Otvori folder **`public_html`** (obriši podrazumevani `default.php` ako postoji).
3. Prebaci **sve** iz ovog foldera u `public_html`, *osim* sledećeg (nije potrebno na serveru, ali ne smeta):
   - `assets/source/` (originalne fotografije; `.htaccess` ionako blokira pristup)
   - `tools/`
   - `.git/`, `REVIEW.md`, `README.md`
4. Proveri da su prebačeni i **skriveni fajlovi** `.htaccess` (u root-u i u `assets/dishes/`). U File Manager-u: *Settings → Show hidden files*.
5. U hPanel-u uključi **SSL** (besplatan). `.htaccess` automatski prebacuje posetioce na `https://`.
6. **Zameni domen**: u fajlovima `index.html`, `sitemap.xml`, `robots.txt` i `data/site.json` zameni `https://www.DOMEN.rs/` pravim domenom (npr. *Find & Replace* u editoru).
7. Otvori sajt i proveri: intro, meni, korpu (pošalji probnu porudžbinu sebi), rezervaciju.

> Sajt mora da radi preko servera (`https://…`). Ako se `index.html` otvori duplim klikom sa računara (`file://…`), podaci se neće učitati. Za lokalni pregled: u ovom folderu pokreni `python3 -m http.server 8000` i otvori `http://localhost:8000`.

---

## 2. Šta se gde menja (bez diranja koda)

| Šta | Fajl |
|---|---|
| Meni: jela, cene, opisi, kategorije | `data/menu.json` |
| Kontakt, radno vreme, linkovi, uključivanje/isključivanje delova sajta | `data/site.json` |
| Svi tekstovi na sajtu (srpski / engleski) | `data/i18n/sr.json`, `data/i18n/en.json` |
| Sastojci za „Napravi svoj bowl“ | `data/bowl.json` |
| Montaža intro-a i videa na početnoj | `tools/video-edit.json` (+ `data/intro.json`) |
| Fotografije galerije (opisi) | `tools/prepare-assets.py` → `GALLERY_META` |

JSON fajlove menjaj u običnom editoru (npr. VS Code ili File Manager → Edit). Pazi na **zareze i navodnike**. Ako sajt posle izmene ne radi, proveri fajl na <https://jsonlint.com>.

### Meni — `data/menu.json`

Svaka stavka izgleda ovako:

```json
{
  "id": "acai-bowl",
  "name": "Acai Bowl",
  "description": { "sr": "acai berry, banana, …", "en": "acai berry, banana, …" },
  "price": 890,
  "variants": [],
  "size": null,
  "diet": [],
  "mood": ["energy", "sweet"],
  "image": null
}
```

- **Promena cene:** izmeni broj u `"price"` (bez „din“, bez tačke: `1330`).
- **Cena na upit:** `"price": null`. Dugme „+“ se tada ne prikazuje.
- **Više cena (npr. čaša/flaša):** popuni `"variants"`:
  `[{ "id": "casa", "name": { "sr": "Čaša", "en": "Glass" }, "price": 590 }, …]`
- **Nova stavka:** kopiraj postojeću, promeni `id` (mala slova, crtice, bez razmaka i bez č/ć/š/ž/đ), naziv, opis i cenu.
- **Oznake ishrane** (`"diet"`): `"vegan"`, `"gluten-free"`, `"sugar-free"`, `"raw"`. Filter se na sajtu pojavljuje tek kad bar jedno jelo ima tu oznaku. Dodaj oznaku samo ako je vlasnik potvrdi.
- **Raspoloženja** (`"mood"`): `"energy"`, `"light"`, `"sweet"`, `"post-workout"`, `"kids"`, `"coffee-relax"`.
- Polja `needsReview`, `reviewNote`, `altPrices`, `source` služe samo za proveru. Sajt ih ne prikazuje i mogu da se obrišu kad je stavka potvrđena.

### Radno vreme, kontakt — `data/site.json`

- `hours.open` / `hours.close`: npr. `"07:00"` / `"23:00"`. Status „Otvoreno sada / Zatvoreno“ i hero se računaju po ovom vremenu (zona `Europe/Belgrade`).
- `hours.days`: dani kada radi (`"mon"` … `"sun"`).
- `contact`: telefon, WhatsApp broj (format `381…` bez `+` i bez razmaka), adresa.
- `ordering.deliveryMinOrder`: npr. `1000` → prikazuje se „Minimalna porudžbina za dostavu: 1.000 RSD“. `null` = ništa.
- `ordering.deliveryNote`: npr. `{ "sr": "Dostava na Novom naselju i Detelinari.", "en": "…" }`.
- `reviews`: stvarni citati recenzija (prazno = sekcija citata je sakrivena):
  `[{ "text": { "sr": "…", "en": "…" }, "author": "Ime" }]`
- `credit`: potpis u futeru, npr. `{ "name": "Studio X", "url": "https://…" }`.
- `timeOfDay`: koje kategorije i koja fotografija se ističu ujutru / za ručak / uveče / kad je zatvoreno. Ako menjaš fotografiju, promeni je i u `index.html` (atribut `data-tod-images`).

### Tekstovi — `data/i18n/sr.json` i `en.json`

Oba fajla imaju **iste ključeve**. Kad menjaš tekst na srpskom, promeni i engleski. Delovi u vitičastim zagradama (`{time}`, `{n}`, `{name}`) se popunjavaju automatski i moraju da ostanu.

---

## 3. Fotografije jela (kasnije, posle ugovora)

1. Pripremi fotografiju (preporuka: **WebP**, 1200×900 px, do ~150 KB; može i `.jpg` / `.png`).
2. Nazovi je **tačno po `id` jela** iz `menu.json`, npr. `acai-bowl.webp`, `classic-burger.webp`, `red-pearl.webp`.
3. Ubaci je u folder **`assets/dishes/`**. To je sve, sajt je sam pronalazi.

Spisak svih očekivanih naziva fajlova je u `REVIEW.md` (odeljak 8).

> Na Hostingeru sajt pronalazi fotografije preko listinga foldera (fajl `assets/dishes/.htaccess`), a na GitHub Pages preko GitHub API-ja. Ako to negde ne radi, upiši putanju ručno u `menu.json`: `"image": "assets/dishes/acai-bowl.webp"`.

---

## 4. Uključivanje / isključivanje delova sajta

U `data/site.json` → `"features"`:

```json
"features": {
  "intro": true,          // intro „ulazak u Vidu“
  "bowlBuilder": false,   // „Napravi svoj bowl“ (uključiti tek kad vlasnik potvrdi sastojke i cene)
  "celebrations": true,   // sekcija Proslave & rođendani + link u meniju
  "moodFilter": true,     // „Kako se osećaš?“
  "timeOfDayHero": true,  // hero se menja po dobu dana
  "delivery": true,       // opcija Dostava u korpi
  "pickup": true          // opcija Preuzimanje u lokalu
}
```

`true` = uključeno, `false` = isključeno (sekcija i link nestaju bez praznog prostora).
U `site.json` ne pišu se komentari (`//`). Gore su samo radi objašnjenja.

**Pregled bez menjanja fajla:** dodaj na kraj adrese
- `?preview=bowlBuilder` → prikazuje bowl builder samo tebi;
- `?features=intro:0,celebrations:0` → privremeno isključuje delove;
- `?nointro` → preskače intro.

---

## 5. Intro i video na početnoj strani

Intro i hero („početna“) su **montirani video snimci** napravljeni od Vida reels snimaka.

- **Telefon:** vertikalni intro 1080×1920 (`assets/video/intro-mobile.*`), AI-uveličan sa 720p.
- **Računar:** „triptih“ — tri vertikalna panela, 1920×1080 (`assets/video/intro-desktop.*`).
- **Početna:** video petlja po dobu dana (jutro / podne / veče / zatvoreno), `assets/video/hero-<doba>-main|side.*`.

**Montaža** (koji snimak, od koje do koje sekunde, redosled, prelazi) je u **`tools/video-edit.json`**.
Posle izmene:

```bash
# izvorni snimci idu u assets/source/video/ (01-matilda-torta.mp4, 02-disneyland-spritz.mp4, …)
pip install torch opencv-python-headless numpy pillow
# AI model (Real-ESRGAN, ~5 MB) u tools/models/:
curl -L -o tools/models/realesr-general-x4v3.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth
python3 tools/build-video.py hero      # petlje za početnu
python3 tools/build-video.py desktop   # intro za računar
python3 tools/build-video.py mobile    # intro za telefon (AI, ~20–60 min)
```

U `data/intro.json`:
- `logoAt`: sekunda videa kada se pojavljuje logo (telefon / računar posebno)
- `playMode`: `"session"` (jednom po poseti) ili `"visitor"` (samo prvi put)
- `skipIfLoadingLongerThanMs`: ako se video ne učita za 3 s (spora mreža), intro se preskače
- `enabled`: `false` isključuje intro

Na sporoj mreži, sa „Save-Data“ ili kad posetilac u telefonu isključi animacije, početna prikazuje fotografiju (poster) umesto videa.

**Galerija i logo:** fotografije za galeriju stavi u `assets/source/gallery/`, logo u `assets/source/logo/`, pa pokreni `python3 tools/prepare-assets.py` (pravi galeriju, favicon i OG sliku za deljenje na mrežama).

## 6. Porudžbine, rezervacije i proslave

Nema servera ni baze. Sve forme prave uredno složenu **WhatsApp poruku** ka broju `+381 69 533 2067`. Gost je samo pošalje, a osoblje potvrđuje u WhatsApp-u.
- Porudžbina sadrži stavke, količine, cene, napomene, ukupno, način (dostava/preuzimanje), adresu, vreme, plaćanje, ime i telefon.
- Van radnog vremena porudžbina može da se pripremi, uz napomenu da će biti viđena od 07:00.
- Poruka je na jeziku koji je gost izabrao na sajtu (SR ili EN).
- „Poruči preko Wolt-a“ je uvek ponuđeno kao druga opcija.

---

## 7. Struktura

```
index.html            stranica (sve sekcije)
css/                  tokens.css (boje, fontovi), base.css, components.css, sections.css
js/                   main.js + po jedan modul za svaki deo (intro, meni, korpa, bowl…)
data/                 site.json, menu.json, bowl.json, intro.json, gallery.json, i18n/
assets/fonts/         Fraunces + Manrope (self-hosted, latin-ext, OFL licenca)
assets/img/           obrađene fotografije (intro, galerija, logo, favicon, og-image)
assets/dishes/        fotografije jela (prazno dok ne stignu)
assets/source/        originali (ne menjaju se)
tools/                build-video.py (+ video-edit.json), prepare-assets.py, contrast-check.py, test-site.mjs
.htaccess             HTTPS, kompresija, keš
```

## 8. Testovi (za programera)

```bash
python3 -m http.server 8765 &
node tools/test-site.mjs http://127.0.0.1:8765/
```
Potreban je Node.js i Playwright (`npm i -g playwright && npx playwright install chromium`). Testovi proveravaju intro, radno vreme, hero po dobu dana, korpu, WhatsApp poruke, bowl builder, SR/EN, galeriju, feature flagove i greške u konzoli.
