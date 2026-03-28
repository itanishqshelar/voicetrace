/**
 * Item price catalog — the "source of truth" for per-unit prices.
 * The AI prompt is fed this catalog so it can intelligently calculate qty
 * when the user only mentions a total amount.
 *
 * Example: "samosa worth 100rs" → price_per_unit = 25, qty = 100/25 = 4
 */

import { createClient } from "@supabase/supabase-js";

export interface CatalogItem {
  id?: string;
  name: string;
  price_per_unit: number;
  unit: string; // piece, plate, glass, kg, litre, etc.
  category: "sale" | "expense";
  aliases: string[]; // alternate names / Hindi variants
}

export const itemCatalog: CatalogItem[] = [
  // ── Hot Beverages ──
  {
    name: "Chai",
    price_per_unit: 10,
    unit: "glass",
    category: "sale",
    aliases: ["tea", "चाय", "chai patti"],
  },
  {
    name: "Coffee",
    price_per_unit: 15,
    unit: "cup",
    category: "sale",
    aliases: ["कॉफ़ी", "kaafi"],
  },

  // ── Snacks ──
  {
    name: "Samosa",
    price_per_unit: 25,
    unit: "piece",
    category: "sale",
    aliases: ["समोसा", "samose"],
  },
  {
    name: "Vada Pav",
    price_per_unit: 20,
    unit: "piece",
    category: "sale",
    aliases: ["वडा पाव", "vada paav", "vadapav"],
  },
  {
    name: "Pakoda",
    price_per_unit: 20,
    unit: "plate",
    category: "sale",
    aliases: ["पकोड़ा", "pakode", "bhajiya"],
  },
  {
    name: "Kachori",
    price_per_unit: 15,
    unit: "piece",
    category: "sale",
    aliases: ["कचोरी", "kachodi"],
  },
  {
    name: "Pav Bhaji",
    price_per_unit: 50,
    unit: "plate",
    category: "sale",
    aliases: ["पाव भाजी"],
  },
  {
    name: "Bread Omelette",
    price_per_unit: 30,
    unit: "plate",
    category: "sale",
    aliases: ["ब्रेड आमलेट", "omelette"],
  },
  {
    name: "Poha",
    price_per_unit: 20,
    unit: "plate",
    category: "sale",
    aliases: ["पोहा"],
  },
  {
    name: "Upma",
    price_per_unit: 20,
    unit: "plate",
    category: "sale",
    aliases: ["उपमा"],
  },

  // ── Drinks ──
  {
    name: "Lassi",
    price_per_unit: 25,
    unit: "glass",
    category: "sale",
    aliases: ["लस्सी"],
  },
  {
    name: "Nimbu Pani",
    price_per_unit: 10,
    unit: "glass",
    category: "sale",
    aliases: ["नींबू पानी", "lemonade", "shikanji"],
  },
  {
    name: "Buttermilk",
    price_per_unit: 10,
    unit: "glass",
    category: "sale",
    aliases: ["छाछ", "chaas", "mattha"],
  },
  {
    name: "Juice",
    price_per_unit: 30,
    unit: "glass",
    category: "sale",
    aliases: ["जूस"],
  },

  // ── Meals ──
  {
    name: "Thali",
    price_per_unit: 80,
    unit: "plate",
    category: "sale",
    aliases: ["थाली"],
  },
  {
    name: "Biryani",
    price_per_unit: 60,
    unit: "plate",
    category: "sale",
    aliases: ["बिरयानी"],
  },
  {
    name: "Dal Rice",
    price_per_unit: 40,
    unit: "plate",
    category: "sale",
    aliases: ["दाल चावल", "dal chawal"],
  },

  // ── Sweets / Extras ──
  {
    name: "Jalebi",
    price_per_unit: 30,
    unit: "plate",
    category: "sale",
    aliases: ["जलेबी"],
  },
  {
    name: "Kulfi",
    price_per_unit: 20,
    unit: "piece",
    category: "sale",
    aliases: ["कुल्फी"],
  },
  {
    name: "Paan",
    price_per_unit: 15,
    unit: "piece",
    category: "sale",
    aliases: ["पान"],
  },
];

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function getLiveCatalog(): Promise<CatalogItem[]> {
  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from("item_catalog").select("*");
      if (!error && data && data.length > 0) {
        return data as CatalogItem[];
      }
    }
  } catch (err) {
    console.error("Failed to fetch live catalog:", err);
  }
  return itemCatalog;
}

export async function getCatalogPromptBlock(): Promise<string> {
  const liveCatalog = await getLiveCatalog();
  const saleItems = liveCatalog.filter((c) => c.category === "sale");

  let block =
    "ITEM PRICE CATALOG (use these prices to calculate qty when user only gives a total amount):\n";
  block += "\n--- Sale Items ---\n";
  saleItems.forEach((c) => {
    block += `• ${c.name}: ₹${c.price_per_unit} per ${c.unit} (aliases: ${(c.aliases || []).join(", ")})\n`;
  });

  return block;
}

/**
 * Synchronous catalog lookup — uses only the static itemCatalog array.
 * Useful in event handlers where async is not possible (e.g. onChange).
 */
export function findCatalogItemSync(name: string): CatalogItem | undefined {
  const lower = name.toLowerCase().trim();
  return itemCatalog.find(
    (c) =>
      c.name.toLowerCase() === lower ||
      (c.aliases || []).some((a) => a.toLowerCase() === lower),
  );
}

export async function findCatalogItem(
  name: string,
): Promise<CatalogItem | undefined> {
  const liveCatalog = await getLiveCatalog();
  const lower = name.toLowerCase().trim();
  return liveCatalog.find(
    (c) =>
      c.name.toLowerCase() === lower ||
      (c.aliases || []).some((a) => a.toLowerCase() === lower),
  );
}
