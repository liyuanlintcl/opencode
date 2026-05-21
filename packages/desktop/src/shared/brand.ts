const raw =
  typeof process !== "undefined" && process.env.BRAND_NAME
    ? process.env.BRAND_NAME
    : "omni"

export const BRAND = raw.toLowerCase()
export const BRAND_CAPITALIZED = BRAND.charAt(0).toUpperCase() + BRAND.slice(1)
