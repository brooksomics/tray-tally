// Japan's school-lunch salt limit as sodium per 1,000 kcal, at the energy its
// standard sets for that age. Read on the notice's page image:
// pdftotext garbles its vertical tables.
const MEXT =
  "MEXT 告示第10号 (2021-02-12, in force 2021-04-01), 学校給食実施基準 別表 '児童又は生徒一人一回当たりの学校給食摂取基準' (per child per lunch), mext.go.jp/content/20210212-mxt_kenshoku-100003357_2.pdf p.2";
const SALT_TO_SODIUM =
  "日本食品標準成分表2020年版（八訂）第1章 (8), p.26: '食塩相当量は、ナトリウム量に2.54を乗じて算出した値を示した'";
function japanLunch(ages: string, kcal: number, saltG: number) {
  const sodiumMg = (saltG * 1000) / 2.54;
  return {
    value: Math.round((sodiumMg * 1000) / kcal),
    note: `Japan's school lunch for ages ${ages}: under ${saltG} g of salt equivalent (${Math.round(sodiumMg)} mg sodium) in a ${kcal} kcal lunch`,
    source: `${MEXT}: ages ${ages}, エネルギー ${kcal} kcal, ナトリウム（食塩相当量）'${saltG}未満' g. ${SALT_TO_SODIUM}. Read 2026-10-11`,
  };
}

// Peer-nation lines shown next to the US ones, read in the
// documents themselves on 2026-10-09. Many readers weigh these as much as US
// federal advice.
export const INTERNATIONAL_REFERENCES = {
  whoFiberPer1000KcalG: {
    value: 12.5,
    note: "WHO's fibre density: 25 g on an average 2,000 kcal a day, which WHO scales to its children's targets (ages 6-9: at least 21 g a day)",
    source:
      "WHO, Carbohydrate intake for adults and children: WHO guideline (2023), hdl 10665/370420, Annex 8: '25 g of dietary fibre ... yields 0.0125 g of fibre ... per 1 kcal'. Read 2026-10-09",
  },
  freeSugarsFivePercentShare: {
    value: 0.05,
    note: "Free sugars below 5% of energy: WHO's conditional recommendation, and the UK's for ages 2 and up. Free sugars also count sugars in juice; we only see added sugar, so this comparison is lenient",
    source:
      "WHO, Guideline: sugars intake for adults and children (2015), p.4: 'WHO suggests a further reduction of the intake of free sugars to below 5% of total energy intake (conditional recommendation)'; SACN, Carbohydrates and Health (2015), S.18: 'should not exceed 5% of total dietary energy for age groups from 2 years upwards'. Read 2026-10-09",
  },
  japanLunchSodium6to7Per1000KcalMg: japanLunch("6-7", 530, 1.5),
  japanLunchSodium8to9Per1000KcalMg: japanLunch("8-9", 650, 2),
  japanLunchSodium10to11Per1000KcalMg: japanLunch("10-11", 780, 2),
  japanLunchProteinRangeShare: {
    value: 0.13,
    max: 0.2,
    note: "Japan's school lunch for ages 6-14: protein at 13-20% of the lunch's energy",
    source: `${MEXT}: たんぱく質 (%) '学校給食による摂取エネルギー全体の13～20%', one value across every age column (6-7, 8-9, 10-11, 12-14). Read on the page image 2026-10-22`,
  },
} as const;
