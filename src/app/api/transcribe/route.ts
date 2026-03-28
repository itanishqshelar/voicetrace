import { NextRequest } from "next/server";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return Response.json(
        { error: "No audio file provided" },
        { status: 400 },
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return Response.json(
        { error: "Groq API key not configured" },
        { status: 500 },
      );
    }

    // Use Groq Whisper API with verbose_json to get word-level timestamps.
    // These timestamps are stored in the voice log and used to render
    // coloured waveform regions in the Logs page.
    const whisperFormData = new FormData();
    whisperFormData.append("file", audioFile, "audio.webm");
    whisperFormData.append("model", "whisper-large-v3");
    whisperFormData.append("language", "hi"); // Hindi + English (Hinglish)
    whisperFormData.append("response_format", "verbose_json");
    // Request word-level granularity so each word carries a start/end timestamp
    whisperFormData.append("timestamp_granularities[]", "word");

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: whisperFormData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Whisper API error:", errorText);
      return Response.json(
        { error: "Transcription failed", details: errorText },
        { status: response.status },
      );
    }

    const result = await response.json();

    // verbose_json returns { text, words?, segments?, duration?, language? }
    // words: Array<{ word: string; start: number; end: number }>
    // Fall back to empty array if the model didn't return word timestamps
    // (e.g. very short audio, silence, or API change).
    return Response.json({
      text: result.text ?? "",
      words: result.words ?? [],
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return Response.json(
      { error: "Internal server error during transcription" },
      { status: 500 },
    );
  }
}
