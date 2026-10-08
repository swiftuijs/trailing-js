export const extensions = ['.twill', '.twillx'] as const;
export function isTwillFile(id: string): boolean {
  return extensions.some((extension) => id.split(/[?#]/, 1)[0]!.endsWith(extension));
}
