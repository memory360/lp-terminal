export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`API request failed: ${res.status}`)
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error(`API returned ${contentType || 'non-JSON'}; configure the server /api proxy`)
  }
  return res.json() as Promise<T>
}
