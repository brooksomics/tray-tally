// DOM helpers. Text from the API goes in as textContent, never as HTML.

export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function setAll(form, name, on) {
  for (const box of form.querySelectorAll(`[name="${name}"]`)) box.checked = on;
  form.dispatchEvent(new Event("change"));
}

// "Select all" and "Clear" for one checkbox group; they fire the form's change.
const toggle = (name, text, on) =>
  el("button", {
    type: "button",
    textContent: text,
    onclick: (e) => setAll(e.target.form, name, on),
  });

function group(name, options, toggles = false) {
  const boxes = options.map(([value, text]) => {
    const box = el("input", { type: "checkbox", name, value, checked: true });
    return el("label", {}, box, ` ${text}`);
  });
  const extra = toggles
    ? [toggle(name, "Select all", true), toggle(name, "Clear", false)]
    : [];
  const legend = el("legend", { textContent: name }, ...extra);
  return el("fieldset", {}, legend, ...boxes);
}

/** "All 7 districts · breakfast, lunch · 2026-08-10 to 2026-10-23" */
export function filterSummary(f, total) {
  const n = f.districts.size;
  const who = n === total ? `All ${n} districts` : `${n} of ${total} districts`;
  const meals = ["breakfast", "lunch"].filter((m) => f.meals.has(m));
  const what = meals.length ? meals.join(", ") : "no meals";
  return `${who} · ${what} · ${f.from} to ${f.to}`;
}

const dateInput = (name, value) =>
  el(
    "label",
    { textContent: `${name} ` },
    el("input", { type: "date", name, value }),
  );

/** Filters: districts (labelled), meals, date range. */
export function buildForm(form, districts, dates) {
  form.append(
    group("district", districts, true),
    group("meal", [
      ["breakfast", "Breakfast"],
      ["lunch", "Lunch"],
    ]),
    dateInput("from", dates[0]),
    dateInput("to", dates.at(-1)),
  );
}

export function readFilter(form) {
  const data = new FormData(form);
  const set = (name) => new Set(data.getAll(name).map(String));
  const one = (name) => String(data.get(name) ?? "");
  const [districts, meals] = ["district", "meal"].map(set);
  return { districts, meals, from: one("from"), to: one("to") };
}

export function table(head, rows) {
  const tr = (cells, tag) =>
    el("tr", {}, ...cells.map((c) => el(tag, { textContent: c ?? "–" })));
  return el("table", {}, tr(head, "th"), ...rows.map((r) => tr(r, "td")));
}

/** "Escondido Union (CA): 72.6% eligible for free/reduced-price meals, $88k median household income" */
export function label(d) {
  const [w, name] = [d.wealth, `${d.name} (${d.state})`];
  if (!w) return name;
  const inc = w.medianHouseholdIncome?.value;
  const income = inc
    ? `, $${Math.round(inc / 1000)}k median household income`
    : "";
  return `${name}: ${w.frpmPercent.value}% eligible for free/reduced-price meals${income}`;
}

// Sources differ only by district id; name each once.
const general = (source) =>
  source
    .replace(/ACSDashboard\/\d{7}/, "ACSDashboard/<NCES id>")
    .replace(/; 250,001.*?\)$/, ")");

/** Footer: wealth sources, then the caveats no section already shows. */
export function footerText(summary, shown) {
  const rest = summary.caveats.filter((c) => !shown.includes(c));
  return [wealthSources(summary.districts), ...rest].filter(Boolean).join(" ");
}

/** One line naming each wealth figure's source and year. */
export function wealthSources(districts) {
  const seen = new Set();
  for (const d of districts) {
    for (const w of Object.values(d.wealth ?? {}))
      seen.add(`${general(w.source)} (${w.year})`);
  }
  return seen.size ? `District context: ${[...seen].join("; ")}.` : "";
}
