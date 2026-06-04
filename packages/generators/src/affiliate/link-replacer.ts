import { searchAmazonProducts } from "./amazon.js";

export async function replaceAffiliateLinks(
  content: string,
  niche: string,
  program: string,
): Promise<string> {
  const placeholderRegex = /\[AFFILIATE_LINK: (.+?)\]/g;
  const matches = [...content.matchAll(placeholderRegex)];

  let updated = content;
  for (const match of matches) {
    const productKeyword = match[1];
    if (program === "amazon" || program.includes("amazon")) {
      const products = await searchAmazonProducts(productKeyword, niche);
      if (products.length > 0) {
        const product = products[0];
        const linkHtml = `<a href="${product.affiliateUrl}" target="_blank" rel="noopener sponsored">${productKeyword}</a>`;
        updated = updated.replace(match[0], linkHtml);
      }
    }
  }

  updated = updated.replace(/\[BUY_LINK\]/g, "#buy-now");
  updated = updated.replace(/\[INTERNAL_LINK: (.+?)\]/g, (_, topic: string) => {
    const slug = topic.toLowerCase().replace(/\s+/g, "-");
    return `<a href="/${slug}">${topic}</a>`;
  });

  return updated;
}
