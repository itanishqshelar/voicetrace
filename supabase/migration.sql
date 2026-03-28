-- VoiceTrace: Create sales table in Supabase
-- Run this SQL in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

CREATE TABLE IF NOT EXISTS sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster date-based queries
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at DESC);

-- Enable Row Level Security (RLS) - allow public access for demo
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for anonymous users (demo mode)
CREATE POLICY "Allow anonymous access" ON sales
  FOR ALL
  USING (true)
  WITH CHECK (true);
