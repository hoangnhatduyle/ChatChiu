// The user's own icon (never a drawn replacement). 96 px is the source for UI up to 48 px; 192 px above.
// The 1254 px original (public/chac-chiu-icon.png) is 1.5 MB and is never used in the UI.
export const BRAND_ICON_SMALL = '/icons/icon-96x96.png'
export const BRAND_ICON_LARGE = '/icons/icon-192x192.png'
export const BRAND_NAME = 'Chắt Chiu'
const SMALL_MAX_PX = 48

export const brandIconFor = (size: number): string =>
  size <= SMALL_MAX_PX ? BRAND_ICON_SMALL : BRAND_ICON_LARGE
