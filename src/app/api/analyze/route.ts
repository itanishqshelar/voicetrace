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

    const today = new Date().toISOString().split('T')[0];

    const prompt = `Convert the following voice input into structured JSON. Extract items, quantity, price per unit, and total. IMPORTANT: Classify each item as either a "sale" (money earned) or "expense" (money spent). The input may be in Hindi, English, or Hinglish.

Voice input: "${text}"

Output ONLY valid JSON in this EXACT format (no markdown, no code blocks, no explanation):
{
  "items": [
    { "name": "item name", "qty": number, "price": number, "total": number, "type": "sale", "category": "" },
    { "name": "item name", "qty": number, "price": number, "total": number, "type": "expense", "category": "transport" }
  ],
  "total_earnings": number,
  "total_expenses": number,
  "date": "${today}"
}

Rules:
- "total" for each item = qty * price
- "total_earnings" = sum of all SALE item totals (NOT expenses)
- "total_expenses" = sum of all EXPENSE item totals
- Item names should be capitalized (e.g., "Chai", "Samosa", "Petrol")
- "type" MUST be either "sale" or "expense"
- For "sale" items, "category" should be empty string ""
- For "expense" items, "category" must be one of: "transport", "raw_material", "rent", "utilities", "other"

EXPENSE DETECTION — classify as "expense" if the vendor SPENT money on:
- Petrol, diesel, gas, CNG, fuel → category: "transport"
- Auto, rickshaw, taxi fare, delivery charges → category: "transport"
- Raw materials, ingredients, oil, flour, vegetables, supplies → category: "raw_material"
- Rent, stall fee, space charge → category: "rent"
- Electricity, water bill, phone recharge → category: "utilities"
- Any other spending/purchase/cost → category: "other"

SALE DETECTION — classify as "sale" if the vendor EARNED money by selling:
- Food items (chai, samosa, vada pav, etc.)
- Any product or service sold to customers

Context clues for expenses:
- "petrol bhara", "petrol dala", "petrol liya" = bought petrol (expense)
- "kharcha", "khareed", "liya", "bhara", "diya" = spent money (expense)
- "becha", "bika", "bikha", "kamaya" = earned money (sale)
- If someone mentions buying/purchasing something for business use, it's an expense
- If quantity is not clear, assume 1
- If price is not clear, make a reasonable assumption`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_completion_tokens: 1024,
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
    if (!parsed.items || !Array.isArray(parsed.items)) {
      throw new Error('Invalid response structure: missing items array');
    }

    // Ensure all fields exist and calculate totals correctly
    let totalEarnings = 0;
    let totalExpenses = 0;
    parsed.items = parsed.items.map((item: { name?: string; qty?: number; price?: number; total?: number; type?: string; category?: string }) => {
      const qty = Number(item.qty) || 1;
      const price = Number(item.price) || 0;
      const total = qty * price;
      const type = item.type === 'expense' ? 'expense' : 'sale';
      const category = type === 'expense' ? (item.category || 'other') : '';

      if (type === 'sale') {
        totalEarnings += total;
      } else {
        totalExpenses += total;
      }

      return {
        name: item.name || 'Unknown Item',
        qty,
        price,
        total,
        type,
        category,
      };
    });
    parsed.total_earnings = totalEarnings;
    parsed.total_expenses = totalExpenses;
    parsed.date = parsed.date || today;

    return Response.json(parsed);
  } catch (error) {
    console.error('Analysis error:', error);

    if (error instanceof SyntaxError) {
      return Response.json(
        { error: 'Failed to parse AI response as JSON' },
        { status: 500 }
      );
    }

    return Response.json(
      { error: 'Internal server error during analysis' },
      { status: 500 }
    );
  }
}
