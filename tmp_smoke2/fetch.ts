export async function fetchData(url: string): Promise<string> {
  let attempt = 0;
while (attempt < 3) {
  const res = await fetch(url);
  if (res.ok) return res.text();
  attempt++;
  await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
}
throw new Error(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
