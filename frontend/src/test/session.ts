export function sessionToken(role: string): string {
  const payload = btoa(JSON.stringify({ role }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  return `eyJhbGciOiJub25lIn0.${payload}.sig`;
}
