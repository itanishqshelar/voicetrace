import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return Response.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return Response.json(
        { error: 'Groq API key not configured' },
        { status: 500 }
      );
    }

    // Use Groq Whisper API
    const whisperFormData = new FormData();
    whisperFormData.append('file', audioFile, 'audio.webm');
    whisperFormData.append('model', 'whisper-large-v3');
    whisperFormData.append('language', 'hi'); // Hindi + English (Hinglish)
    whisperFormData.append('response_format', 'json');

    const response = await fetch(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: whisperFormData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Whisper API error:', errorText);
      return Response.json(
        { error: 'Transcription failed', details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();

    return Response.json({ text: result.text });
  } catch (error) {
    console.error('Transcription error:', error);
    return Response.json(
      { error: 'Internal server error during transcription' },
      { status: 500 }
    );
  }
}
