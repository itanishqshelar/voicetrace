'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { BarChart3, Mic, AlertTriangle, RotateCcw } from 'lucide-react';
import VoiceRecorder from '@/components/VoiceRecorder';
import TranscriptionResult from '@/components/TranscriptionResult';
import { SaleItem } from '@/lib/supabase';

interface AnalyzedData {
  items: SaleItem[];
  total_earnings: number;
  total_expenses?: number;
  date: string;
}

export default function HomePage() {
  const [transcription, setTranscription] = useState<string | null>(null);
  const [analyzedData, setAnalyzedData] = useState<AnalyzedData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const handleTranscription = useCallback(async (text: string) => {
    setTranscription(text);
    setAnalyzedData(null);
    setSaved(false);
    setAnalysisError(null);
    setIsAnalyzing(true);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Analysis failed');
      }

      if (!data.items || !Array.isArray(data.items)) {
        throw new Error('Invalid response format from AI');
      }

      setAnalyzedData(data);
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysisError(
        error instanceof Error ? error.message : 'Failed to analyze sales data. Please try again.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!analyzedData) return;
    setIsSaving(true);

    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: analyzedData.date,
          items: analyzedData.items,
          total: analyzedData.total_earnings,
        }),
      });

      if (!response.ok) {
        throw new Error('Save failed');
      }

      setSaved(true);
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  }, [analyzedData]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="w-full px-4 sm:px-8 py-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-4.5 h-4.5">
              <path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 004 7.47V22h2v-2.06A8.96 8.96 0 0012 21a8.96 8.96 0 003-.06V22h2v-2.53A9 9 0 0021 12v-2h-2z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-text-primary">VoiceTrace</h1>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary bg-surface-light hover:bg-surface-lighter transition-all duration-200 border border-border hover:border-border-hover"
        >
          <BarChart3 className="w-4 h-4" />
          Dashboard
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pb-12">
        <div className="w-full max-w-2xl mx-auto text-center space-y-8">
          {/* Hero */}
          <div className="space-y-4 animate-fade-in-up">
            <h2 className="text-4xl sm:text-5xl font-extrabold text-text-primary leading-tight">
              VoiceTrace
            </h2>
            <p className="text-text-secondary text-lg sm:text-xl max-w-md mx-auto leading-relaxed">
              Speak your sales in{' '}
              <span className="text-indigo-600 font-medium">Hindi</span>,{' '}
              <span className="text-sky-600 font-medium">English</span>, or{' '}
              <span className="text-amber-600 font-medium">Hinglish</span>
            </p>
            <p className="text-text-muted text-sm">
              Voice → Text → Structured Data → Insights
            </p>
          </div>

          {/* Voice Recorder */}
          <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <VoiceRecorder
              onTranscriptionComplete={handleTranscription}
              isProcessing={isAnalyzing}
            />
          </div>

          {/* Results */}
          <TranscriptionResult
            transcription={transcription}
            analyzedData={analyzedData}
            isAnalyzing={isAnalyzing}
            isSaving={isSaving}
            onSave={handleSave}
            saved={saved}
          />

          {/* Analysis Error */}
          {analysisError && (
            <div className="w-full max-w-2xl mx-auto card p-4 border-red-200 animate-fade-in-up">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-600 font-medium text-sm">Analysis Failed</p>
                  <p className="text-text-muted text-sm mt-1">{analysisError}</p>
                  <button
                    onClick={() => transcription && handleTranscription(transcription)}
                    className="flex items-center gap-1.5 mt-3 px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full px-4 py-4 text-center border-t border-border">
        <p className="text-text-muted text-xs">
          Built for street vendors · Powered by AI
        </p>
      </footer>
    </div>
  );
}
