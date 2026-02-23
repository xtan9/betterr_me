export const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      `Failed to fetch ${url}: ${res.status} ${body?.error || res.statusText}`,
    );
  }
  return res.json();
};
