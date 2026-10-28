import type { Grades, Meal } from "../types.ts";

// Min-max kcal per meal, as a weekly average: 7 CFR 220.8 (breakfast) and
// 210.10 (lunch), Table 1 "Dietary Specifications", read 2026-10-08.
// Preschool menus (CACFP, 7 CFR 226.20: no calorie range) aren't tracked.
export const CALORIES: Record<
  Grades,
  Partial<Record<Meal, [number, number]>>
> = {
  "K-5": { breakfast: [350, 500], lunch: [550, 650] },
};

// A meal's weekly sodium limit through 2027-06-30, mg (sources: LUNCH_SODIUM,
// BREAKFAST_SODIUM below).
export const SODIUM_MG: Record<Grades, Partial<Record<Meal, number>>> = {
  "K-5": { breakfast: 540, lunch: 1110 },
};

// Sodium lines, mg per 1,000 kcal: a K-5 meal's weekly sodium limit over the
// fewest calories a K-5 meal may average. A menu denser than this puts a meal
// over the limit at every calorie level the rule allows.
const sodiumLine = (mg: number, meal: Meal) =>
  Math.round((mg * 1000) / CALORIES["K-5"][meal]![0]);
const ECFR = "eCFR up to date as of 2026-10-08, read 2026-10-11";
const LUNCH_SODIUM = `7 CFR 210.10(f)(4) Table 4, Grades K-5: '≤1,110' mg 'in place through June 30, 2027', '≤935' mg 'must be implemented by July 1, 2027'; 210.10(f)(1) Table 3: K-5 'Average Daily Minimum-Maximum Calories' 550-650. ${ECFR}`;
const BREAKFAST_SODIUM = `7 CFR 220.8(f)(4) Table 3, Grades K-5: '≤540' mg 'in place through June 30, 2027', '≤485' mg 'must be implemented by July 1, 2027'; 220.8(f)(1) Table 2: K-5 'Average Daily Minimum-Maximum Calories' 350-500. ${ECFR}`;
const fewest = (meal: Meal) =>
  `over the fewest calories a K-5 ${meal} may average (${CALORIES["K-5"][meal]![0]}), per 1,000 kcal. A menu denser than this puts a ${meal} over the limit at any calorie level the rule allows`;

// A day's need for the top chart: `value` for ages 4-8, ages9to13.
const DRI =
  "National Academies Food and Nutrition Board, DRI summary tables in Dietary Reference Intakes for Sodium and Potassium (2019), read in a course copy (eclass.hmu.gr, 'DRIs_2019') 2026-10-23";
const MACROS = `${DRI}: 'Recommended Dietary Allowances and Adequate Intakes, Total Water and Macronutrients'`;
const ELEMENTS = `${DRI}: 'Recommended Dietary Allowances and Adequate Intakes, Elements'`;
const fewestKcal = (meal: Meal, cite: string) => ({
  value: CALORIES["K-5"][meal]![0],
  note: `The fewest calories a K-5 ${meal} may average over the week`,
  source: `${cite}. ${ECFR}`,
});

// Reference lines, each with its source (shown on the page next to the number).
export const REFERENCES = {
  usdaWeeklyAddedSugarShare: {
    value: 0.1,
    note: "School breakfast and lunch must average <10% of calories from added sugars, weekly, from 2027-07-01",
    source: "7 CFR 220.8 and 210.10 (read 2026-10-01)",
  },
  dgaMealAddedSugarG: {
    value: 10,
    note: "One meal should contain no more than 10 g of added sugars (guidance, not a school-meal rule)",
    source: "Dietary Guidelines for Americans 2025-2030",
  },
  ahaDailyAddedSugarG: {
    value: 25,
    note: "Children 2-18: 25 g or less of added sugars per day (guidance). Exact wording unverified: the paper is paywalled; news coverage agrees on 25 g for ages 2-18",
    source: "Vos et al., Circulation 2016, doi:10.1161/CIR.0000000000000439",
  },
  fiberPer1000KcalG: {
    value: 14,
    note: "Grams of fiber per 1,000 calories: the Adequate Intake behind FDA's fiber Daily Value for everyone 4 and up (28 g on the label's 2,000-calorie basis). A food at or above it carries its share of a day's fiber, whatever the meal's size",
    source:
      "FDA, 81 FR 33742 (2016 Nutrition Facts final rule): 'The DV of 28 grams for dietary fiber is based on the AI set by the IOM for total fiber', 'an AI of 14 grams/1,000 calories', Daily Values 'based on a 2,000 calorie diet'; 21 CFR 101.9(c)(9) (28 g, adults and children 4+). Read 2026-10-09",
  },
  proteinRangeShare: {
    value: 0.1,
    max: 0.3,
    note: "Protein between 10% and 30% of calories: the National Academies' acceptable range for children 4-18, over a whole day's eating, not a per-meal rule. For comparison, the RDA is 19 g of protein a day at ages 4-8 and 34 g at 9-13",
    source:
      "National Academies Food and Nutrition Board, DRI summary tables (2019 prepublication copy), nationalacademies.org/cdn/materials/9fb9fae6-337c-4b7c-9821-2c81d1f65ad0: 'Dietary Reference Intakes (DRIs): Acceptable Macronutrient Distribution Ranges', 'Range (percent of energy)', Protein, 'Children, 4–18 y': '10–30'; RDA table, Protein (g/d): Children 4–8 y '19', Males and Females 9–13 y '34'. Both from Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids (2002/2005). Read 2026-10-22",
  },
  usdaLunchSodiumPer1000KcalMg: {
    value: sodiumLine(SODIUM_MG["K-5"].lunch!, "lunch"),
    note: `K-5 lunches may average at most 1,110 mg of sodium over the week through 2027-06-30: that limit ${fewest("lunch")}`,
    source: LUNCH_SODIUM,
  },
  usdaLunch2027SodiumPer1000KcalMg: {
    value: sodiumLine(935, "lunch"),
    note: `From 2027-07-01, K-5 lunches may average at most 935 mg of sodium over the week: that limit ${fewest("lunch")}`,
    source: LUNCH_SODIUM,
  },
  usdaBreakfastSodiumPer1000KcalMg: {
    value: sodiumLine(SODIUM_MG["K-5"].breakfast!, "breakfast"),
    note: `K-5 breakfasts may average at most 540 mg of sodium over the week through 2027-06-30: that limit ${fewest("breakfast")}`,
    source: BREAKFAST_SODIUM,
  },
  usdaBreakfast2027SodiumPer1000KcalMg: {
    value: sodiumLine(485, "breakfast"),
    note: `From 2027-07-01, K-5 breakfasts may average at most 485 mg of sodium over the week: that limit ${fewest("breakfast")}`,
    source: BREAKFAST_SODIUM,
  },
  fiberDailyNeedG: {
    value: 25,
    ages9to13: 31,
    note: "Fiber a day: the Adequate Intake, 25 g at ages 4-8 and 31 g for boys 9-13 (girls 9-13: 26 g; the chart uses the higher)",
    source: `${MACROS}, Total Fiber (g/d): Children 4–8 y '25*', Males 9–13 y '31*', Females 9–13 y '26*' (* = Adequate Intake)`,
  },
  proteinDailyNeedG: {
    value: 19,
    ages9to13: 34,
    note: "Protein a day: the RDA, 19 g at ages 4-8 and 34 g at 9-13",
    source: `${MACROS}, Protein (g/d): Children 4–8 y '19', Males and Females 9–13 y '34'`,
  },
  calciumDailyNeedMg: {
    value: 1000,
    ages9to13: 1300,
    note: "Calcium a day: the RDA, 1,000 mg at ages 4-8 and 1,300 mg at 9-13",
    source: `${ELEMENTS}, Calcium (mg/d): Children 4–8 y '1,000', Males and Females 9–13 y '1,300' (RDAs)`,
  },
  ironDailyNeedMg: {
    value: 10,
    ages9to13: 8,
    note: "Iron a day: the RDA, 10 mg at ages 4-8 and 8 mg at 9-13",
    source: `${ELEMENTS}, Iron (mg/d): Children 4–8 y '10', Males and Females 9–13 y '8' (RDAs)`,
  },
  usdaK5BreakfastMinKcal: fewestKcal(
    "breakfast",
    "7 CFR 220.8(f)(1) Table 2: K-5 'Average Daily Minimum-Maximum Calories' 350-500",
  ),
  usdaK5LunchMinKcal: fewestKcal(
    "lunch",
    "7 CFR 210.10(f)(1) Table 3: K-5 'Average Daily Minimum-Maximum Calories' 550-650",
  ),
} as const;
