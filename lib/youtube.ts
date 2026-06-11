export function extractYouTubeId(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}
