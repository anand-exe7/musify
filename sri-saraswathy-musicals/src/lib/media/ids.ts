export function genMediaId(): string {
  return `MED-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}
