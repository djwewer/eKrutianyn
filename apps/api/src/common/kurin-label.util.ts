export function kurinLabel(kurin: { name: string; kurinNumber: string | null }): string {
  return kurin.kurinNumber ? `№${kurin.kurinNumber} ${kurin.name}` : kurin.name;
}
