import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return Response.json(
        { error: 'No text provided' },
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

    const groq = new Groq({ apiKey: groqApiKey });

    const prompt = `Convert the following voice input about adding a new catalog/inventory item into structured JSON. Extract the item name, price per unit, the unit type, category (either 'sale' or 'expense'), and any aliases/other names. The input may be in Hindi, English, or Hinglish.

Voice input: "${text}"

Output ONLY valid JSON in this EXACT format (no markdown, no code blocks, no explanation):
{
  "name": "formatted item name",
  "price_per_unit": number,
  "unit": "one of: piece, plate, glass, cup, kg, litre, pack",
  "category": "either 'sale' or 'expense'",
  "aliases": ["alias1", "alias2"]
}

RULES:
1. "name" should be Title Cased (e.g. "Chai", "Vada Pav", "Petrol").
2. "price_per_unit" MUST be a number. If not spoken, try to guess a reasonable price in INR, or default to 0.
3. "unit" MUST strictly be one of the listed options. Default to "piece" if unclear. "plate" works for food portions. "glass" for drinks.
4. "category": use "sale" if it's something they sell to earn money. use "expense" if it's raw material, fuel, rent, or supplies they buy.
5. "aliases": any other words spoken that mean the same thing (e.g. if they say "Chai ya chaha", name='Chai', aliases=['chaha']).
`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_completion_tokens: 512,
    });

    const responseText = chatCompletion.choices[0]?.message?.content?.trim() || '';

    // Clean up potential markdown code block wrapping
    let cleanJson = responseText;
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.slice(7);
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.slice(3);
    }
    if (cleanJson.endsWith('```')) {
      cleanJson = cleanJson.slice(0, -3);
    }
    cleanJson = cleanJson.trim();

    // Validate JSON
    const parsed = JSON.parse(cleanJson);

    // Validate structure
    if (!parsed.name || parsed.price_per_unit === undefined) {
      throw new Error('Invalid response structure: missing name or price');
    }

    return Response.json(parsed);
  } catch (error) {
    console.error('Catalog extraction error:', error);
    return Response.json(
      { error: 'Internal server error during extraction' },
      { status: 500 }
    );
  }
}
