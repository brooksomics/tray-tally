// SchoolCafé names many items "Fruit of the Day" (Del Mar: 17 MenuItemIds);
// only the ingredients say which fruit. A name shared by more
// than one item in a district gets that item's ingredients appended, taken
// from any day that has them: older day files were stored without, and one
// item must not show under two names.

/**
 * @param {{ series: { days: { items: { item: string, sourceId: string, ingredients?: string | null }[] }[] }[] }} district
 */
export function labeler(district) {
  const all = district.series.flatMap((s) => s.days.flatMap((d) => d.items));
  const known = new Map(
    all.filter((i) => i.ingredients).map((i) => [i.sourceId, i.ingredients]),
  );
  const ids = Map.groupBy(all, (i) => i.item);
  const shared = (name) =>
    new Set(ids.get(name)?.map((i) => i.sourceId)).size > 1;
  return (i) =>
    known.has(i.sourceId) && shared(i.item)
      ? `${i.item} (${known.get(i.sourceId)})`
      : i.item;
}
