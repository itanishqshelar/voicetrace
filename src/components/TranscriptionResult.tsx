'use client';

import { SaleItem } from '@/lib/supabase';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

interface TranscriptionResultProps {
  transcription: string | null;
  analyzedData: {
    items: SaleItem[];
    total_earnings: number;
    total_expenses?: number;
    date: string;
  } | null;
  isAnalyzing: boolean;
  isSaving: boolean;
  onSave: () => void;
  saved: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  transport: 'Transport',
  raw_material: 'Raw Material',
  rent: 'Rent',
  utilities: 'Utilities',
  other: 'Other',
};

export default function TranscriptionResult({
  transcription,
  analyzedData,
  isAnalyzing,
  isSaving,
  onSave,
  saved,
}: TranscriptionResultProps) {
  if (!transcription && !analyzedData) return null;

  const saleItems = analyzedData?.items.filter((i) => i.type !== 'expense') ?? [];
  const expenseItems = analyzedData?.items.filter((i) => i.type === 'expense') ?? [];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-fade-in-up">
      {/* Transcription */}
      {transcription && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
            Transcription
          </h3>
          <p className="text-text-primary text-lg leading-relaxed">
            &ldquo;{transcription}&rdquo;
          </p>
        </div>
      )}

      {/* Loading state */}
      {isAnalyzing && (
        <div className="card p-6 animate-shimmer">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-primary">
              AI is structuring your data...
            </span>
          </div>
        </div>
      )}

      {/* Analyzed Data */}
      {analyzedData && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">
              Structured Data
            </h3>
            <span className="text-xs text-text-muted bg-surface-light px-3 py-1 rounded-full">
              {analyzedData.date}
            </span>
          </div>

          {/* Sale Items */}
          {saleItems.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowUpCircle className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                  Sales (Income)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-3 pr-4 text-xs font-semibold text-text-muted uppercase tracking-wider">
                        Item
                      </th>
                      <th className="pb-3 pr-4 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">
                        Qty
                      </th>
                      <th className="pb-3 pr-4 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">
                        Price
                      </th>
                      <th className="pb-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleItems.map((item, index) => (
                      <tr
                        key={index}
                        className="border-b border-border/50 animate-fade-in-up"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        <td className="py-3 pr-4">
                          <span className="font-medium text-text-primary">
                            {item.name}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right text-text-secondary">
                          {item.qty}
                        </td>
                        <td className="py-3 pr-4 text-right text-text-secondary">
                          ₹{item.price}
                        </td>
                        <td className="py-3 text-right font-semibold text-emerald-600">
                          +₹{item.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Expense Items */}
          {expenseItems.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowDownCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">
                  Expenses (Spent)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-red-100">
                      <th className="pb-3 pr-4 text-xs font-semibold text-text-muted uppercase tracking-wider">
                        Item
                      </th>
                      <th className="pb-3 pr-4 text-xs font-semibold text-text-muted uppercase tracking-wider">
                        Category
                      </th>
                      <th className="pb-3 pr-4 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">
                        Qty
                      </th>
                      <th className="pb-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseItems.map((item, index) => (
                      <tr
                        key={index}
                        className="border-b border-red-50 animate-fade-in-up bg-red-50/30"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        <td className="py-3 pr-4">
                          <span className="font-medium text-text-primary">
                            {item.name}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100">
                            {CATEGORY_LABELS[item.category || 'other'] || item.category}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right text-text-secondary">
                          {item.qty}
                        </td>
                        <td className="py-3 text-right font-semibold text-red-600">
                          -₹{item.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="space-y-2 pt-2 border-t border-border">
            {saleItems.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">
                  Total Earnings
                </span>
                <span className="text-lg font-bold text-emerald-600">
                  +₹{analyzedData.total_earnings}
                </span>
              </div>
            )}
            {expenseItems.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">
                  Total Expenses
                </span>
                <span className="text-lg font-bold text-red-600">
                  -₹{analyzedData.total_expenses || 0}
                </span>
              </div>
            )}
            {saleItems.length > 0 && expenseItems.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-lg font-semibold text-text-primary">
                  Net
                </span>
                <span className={`text-2xl font-bold ${analyzedData.total_earnings - (analyzedData.total_expenses || 0) >= 0 ? 'text-primary' : 'text-red-600'}`}>
                  ₹{analyzedData.total_earnings - (analyzedData.total_expenses || 0)}
                </span>
              </div>
            )}
            {saleItems.length > 0 && expenseItems.length === 0 && (
              <div className="flex items-center justify-between pt-0">
                <span className="text-lg font-semibold text-text-primary">
                  Total Earnings
                </span>
                <span className="text-2xl font-bold text-primary">
                  ₹{analyzedData.total_earnings}
                </span>
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="mt-6">
            {saved ? (
              <div className="flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-success/10 text-success font-medium">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Saved to Dashboard
              </div>
            ) : (
              <button
                onClick={onSave}
                disabled={isSaving}
                className="w-full py-3 px-6 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold 
                  transition-all duration-200 hover:shadow-lg 
                  disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Saving...
                  </span>
                ) : (
                  'Save to Dashboard'
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
