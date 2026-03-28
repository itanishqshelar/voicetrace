"use client";

import { useState, useRef, useCallback } from "react";

interface VoiceRecorderProps {
  onTranscriptionComplete: (
    text: string,
    audioBlob?: Blob,
    words?: Array<{ word: string; start: number; end: number }>,
  ) => void;
  isProcessing: boolean;
}

export default function VoiceRecorder({
  onTranscriptionComplete,
  isProcessing,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await sendForTranscription(audioBlob);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone. Please allow mic permissions.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const sendForTranscription = async (audioBlob: Blob) => {
    // Keep a reference so we can pass it to the parent after transcription
    const originalBlob = audioBlob;
    setIsTranscribing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Transcription failed");
      }

      const data = await response.json();
      onTranscriptionComplete(data.text, originalBlob, data.words ?? []);
    } catch (err) {
      console.error("Transcription error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to transcribe audio",
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const isDisabled = isProcessing || isTranscribing;

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Mic Button */}
      <div className="relative">
        {/* Pulse rings when recording */}
        {isRecording && (
          <>
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse-ring" />
            <div
              className="absolute inset-0 rounded-full bg-primary/15 animate-pulse-ring"
              style={{ animationDelay: "0.5s" }}
            />
            <div
              className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-ring"
              style={{ animationDelay: "1s" }}
            />
          </>
        )}

        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isDisabled}
          className={`relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
            isRecording
              ? "bg-danger shadow-[0_0_40px_rgba(239,68,68,0.3)] scale-110"
              : isDisabled
                ? "bg-surface-lighter opacity-50 cursor-not-allowed"
                : "bg-primary shadow-[0_0_30px_rgba(79,70,229,0.25)] hover:shadow-[0_0_50px_rgba(79,70,229,0.35)] hover:scale-105"
          }`}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? (
            /* Stop icon */
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="white"
              className="w-10 h-10 sm:w-12 sm:h-12"
            >
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : isTranscribing ? (
            /* Loading spinner */
            <svg
              className="w-10 h-10 sm:w-12 sm:h-12 animate-spin text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          ) : (
            /* Mic icon */
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="white"
              className="w-10 h-10 sm:w-12 sm:h-12"
            >
              <path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 004 7.47V22h2v-2.06A8.96 8.96 0 0012 21a8.96 8.96 0 003-.06V22h2v-2.53A9 9 0 0021 12v-2h-2z" />
            </svg>
          )}
        </button>
      </div>

      {/* Waveform visualization when recording */}
      {isRecording && (
        <div className="flex items-center gap-1 h-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="w-1 bg-primary rounded-full waveform-bar"
              style={{
                animationDelay: `${i * 0.1}s`,
                height: "8px",
              }}
            />
          ))}
        </div>
      )}

      {/* Status text */}
      <div className="text-center">
        {isRecording ? (
          <p className="text-danger font-medium animate-pulse text-lg">
            Recording... Tap to stop
          </p>
        ) : isTranscribing ? (
          <p className="text-primary font-medium text-lg">
            Transcribing your voice...
          </p>
        ) : isProcessing ? (
          <p className="text-accent font-medium text-lg">
            Analyzing your sales...
          </p>
        ) : (
          <p className="text-text-secondary text-lg">Tap to speak your sales</p>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="card px-4 py-3 border-red-200 text-red-600 text-sm max-w-sm text-center animate-fade-in-up">
          {error}
        </div>
      )}
    </div>
  );
}
