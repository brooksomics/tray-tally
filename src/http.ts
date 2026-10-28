const USER_AGENT = "school-meal-tracker"; // names the project; no personal email

/** JSON over HTTP with the project UA and a 30 s timeout; throws on HTTP errors. */
export async function requestJson(
  url: string,
  init: RequestInit,
  who: string,
): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok)
    throw new Error(`${who} ${res.status} from ${url.split("?")[0]}`);
  return res.json();
}
