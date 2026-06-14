const BDO_PRODUCT_IMAGES = {
  piece10g18k: "/tenants/bdo/official/products/piece-10g-18k-box.jpg",
  piece20g18k: "/tenants/bdo/official/products/piece-20g-18k-box.jpg",
  piece20g22k: "/tenants/bdo/official/products/piece-20g-22k-box.jpg",
  ingot50g22k: "/tenants/bdo/official/products/ingot-50g-22k-box.jpg",
  ingot100g: "/tenants/bdo/official/products/ingot-100g-box.jpg",
  pendant: "/tenants/bdo/official/products/piece-20g-22k-top.jpg",
  default: "/tenants/bdo/official/products/piece-20g-22k-box.jpg",
};

type BdoVisualInput = {
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  tags?: string[] | null;
};

function normalizedProductText(product: BdoVisualInput) {
  return [
    product.title,
    product.subtitle,
    product.description,
    ...(Array.isArray(product.tags) ? product.tags : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getBdoProductFallbackImage(product: BdoVisualInput) {
  const text = normalizedProductText(product);

  if (/100\s*g|100g/.test(text)) return BDO_PRODUCT_IMAGES.ingot100g;
  if (/50\s*g|50g/.test(text)) return BDO_PRODUCT_IMAGES.ingot50g22k;
  if (/10\s*g|10g/.test(text)) return BDO_PRODUCT_IMAGES.piece10g18k;
  if (/pendant|bijou|jewel|adinkra|symbol|medal|medaille|médaille/.test(text)) return BDO_PRODUCT_IMAGES.pendant;
  if (/22\s*k|22k|916/.test(text)) return BDO_PRODUCT_IMAGES.piece20g22k;
  if (/18\s*k|18k|750/.test(text)) return BDO_PRODUCT_IMAGES.piece20g18k;

  return BDO_PRODUCT_IMAGES.default;
}
