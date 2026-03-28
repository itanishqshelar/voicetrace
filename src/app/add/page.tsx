"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { SaleItem, SaleEntry } from "@/lib/supabase";
import { findCatalogItemSync } from "@/lib/item-catalog";
import { useEffect } from "react";

function AddEntryForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType =
    (searchParams.get("type") as "sale" | "expense") || "sale";

  const [type, setType] = useState<"sale" | "expense">(initialType);
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("other");
  const [isSaving, setIsSaving] = useState(false);
  const [knownPrices, setKnownPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    // Try to load entries to build a price map (recent prices first)
    const buildPriceMap = (entries: SaleEntry[]) => {
      const pMap: Record<string, number> = {};
      // Iterate entries. Assuming they are sorted newest first.
      entries.forEach((e) => {
        (e.items || []).forEach((item) => {
          if (!item.name) return;
          const lowerName = item.name.toLowerCase().trim();
          if (pMap[lowerName] === undefined) {
            pMap[lowerName] = item.price;
          }
        });
      });
      setKnownPrices(pMap);
    };

    try {
      const raw = sessionStorage.getItem("voicetrace_dashboard");
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.entries) {
          buildPriceMap(cached.entries);
          return;
        }
      }
    } catch {}

    // Fallback if not in cache
    fetch("/api/sales")
      .then((res) => res.json())
      .then((data) => {
        if (data.entries) buildPriceMap(data.entries);
      })
      .catch((err) => console.error("Error fetching prices map:", err));
  }, []);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);

    // 1. Try catalog first (hardcoded source of truth)
    const catalogMatch = findCatalogItemSync(newName);
    if (catalogMatch) {
      setPrice(catalogMatch.price_per_unit.toString());
      return;
    }

    // 2. Fallback to recent sales history
    const lowerName = newName.toLowerCase().trim();
    if (knownPrices[lowerName] !== undefined) {
      setPrice(knownPrices[lowerName].toString());
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !price) return;
    setIsSaving(true);

    const numericPrice = parseFloat(price);
    const itemTotal = qty * numericPrice;

    const item: SaleItem = {
      name,
      qty,
      price: numericPrice,
      total: itemTotal,
      type,
      category: type === "expense" ? category : undefined,
    };

    try {
      // Clear dashboard caches
      sessionStorage.removeItem("voicetrace_dashboard");
      localStorage.removeItem("voicetrace_insights");

      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date().toISOString().split("T")[0],
          items: [item],
          total: type === "sale" ? itemTotal : 0, // total represents earnings in our DB schema currently
        }),
      });

      if (!response.ok) {
        throw new Error("Save failed");
      }

      router.push("/dashboard");
      router.refresh(); // Ensure dashboard is updated
    } catch (error) {
      console.error("Save error:", error);
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-background">
      <main className="flex-1 px-4 sm:px-8 py-6">
        <div className="max-w-xl mx-auto space-y-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Dashboard</span>
          </Link>

          <div className="card p-6">
            <h2 className="text-2xl font-bold text-text-primary mb-6">
              {type === "sale" ? "Add Sale" : "Add Expense"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type Toggle */}
              <div className="flex rounded-lg p-1 bg-surface-light mb-6">
                <button
                  type="button"
                  onClick={() => setType("sale")}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                    type === "sale"
                      ? "bg-white text-emerald-600 shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  Sale (Income)
                </button>
                <button
                  type="button"
                  onClick={() => setType("expense")}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                    type === "expense"
                      ? "bg-white text-red-600 shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  Expense
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={handleNameChange}
                  className="w-full px-4 py-2 rounded-xl border border-border bg-white focus:outline-none focus:ring-2 disabled:opacity-50 focus:ring-primary/20 focus:border-primary transition-all text-text-primary placeholder:text-text-muted/50"
                  placeholder={
                    type === "sale" ? "e.g. 2kg Apples" : "e.g. Transport"
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={qty}
                    onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2 rounded-xl border border-border bg-white focus:outline-none focus:ring-2 disabled:opacity-50 focus:ring-primary/20 focus:border-primary transition-all text-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-border bg-white focus:outline-none focus:ring-2 disabled:opacity-50 focus:ring-primary/20 focus:border-primary transition-all text-text-primary"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {type === "expense" && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-border bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-text-primary"
                  >
                    <option value="raw_material">Raw Material</option>
                    <option value="transport">Transport</option>
                    <option value="rent">Rent</option>
                    <option value="utilities">Utilities</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}

              <div className="pt-4 mt-6 border-t border-border flex justify-between items-center">
                <span className="text-text-secondary">Total:</span>
                <span
                  className={`text-2xl font-bold ${type === "sale" ? "text-emerald-600" : "text-red-600"}`}
                >
                  ₹{((parseFloat(price) || 0) * qty).toFixed(2)}
                </span>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3 px-6 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save {type === "sale" ? "Sale" : "Expense"}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AddPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-text-muted">Loading...</div>
      }
    >
      <AddEntryForm />
    </Suspense>
  );
}
