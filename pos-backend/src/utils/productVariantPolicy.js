const VARIANT_CATEGORY_KEYWORD = 'minuman';

const normalizeCategoryName = (value) => {
  if (typeof value === 'string') return value.trim().toLowerCase();
  return String(value?.name || '').trim().toLowerCase();
};

const supportsProductVariants = (productOrCategory) => {
  const category = productOrCategory?.category ? productOrCategory.category : productOrCategory;
  return normalizeCategoryName(category).includes(VARIANT_CATEGORY_KEYWORD);
};

const variantSupportErrorMessage = (product) => {
  const label = product?.name ? `Menu "${product.name}"` : 'Menu ini';
  return `${label} bukan kategori minuman sehingga tidak memakai varian`;
};

module.exports = {
  VARIANT_CATEGORY_KEYWORD,
  supportsProductVariants,
  variantSupportErrorMessage,
};
