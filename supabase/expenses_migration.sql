-- VoiceTrace: Create expenses table in Supabase
-- Run this SQL in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN ('raw_material', 'transport', 'rent', 'other')),
  description TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- Enable RLS — allow public access for demo
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous access" ON expenses
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed some demo expense data
INSERT INTO expenses (date, category, description, amount) VALUES
  (CURRENT_DATE, 'raw_material', 'Vegetables and supplies', 180),
  (CURRENT_DATE, 'transport', 'Auto rickshaw delivery', 60),
  (CURRENT_DATE, 'rent', 'Daily stall rent', 100),
  (CURRENT_DATE - INTERVAL '1 day', 'raw_material', 'Tea leaves and milk', 150),
  (CURRENT_DATE - INTERVAL '1 day', 'transport', 'Delivery run', 50),
  (CURRENT_DATE - INTERVAL '1 day', 'rent', 'Daily stall rent', 100),
  (CURRENT_DATE - INTERVAL '2 days', 'raw_material', 'Oil and flour', 200),
  (CURRENT_DATE - INTERVAL '2 days', 'transport', 'Cart fuel', 40),
  (CURRENT_DATE - INTERVAL '2 days', 'rent', 'Daily stall rent', 100);
