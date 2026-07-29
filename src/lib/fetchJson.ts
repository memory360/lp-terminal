export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let detail = body
    try {
      detail = (JSON.parse(body) as { error?: string }).error ?? body
    } catch {
      /* non-JSON upstream response */
    }
    throw new Error(`API request failed: ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ''}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error(`API returned ${contentType || 'non-JSON'}; configure the server /api proxy`)
  }
  return res.json() as Promise<T>
}
