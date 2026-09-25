/** Photos whose background was removed have "-cutout" in their file name. */
export function isCutout(url: string): boolean {
  return /-cutout\.(png|webp)(\?|;|$)/.test(url);
}
