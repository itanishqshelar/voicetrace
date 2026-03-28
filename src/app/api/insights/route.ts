import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entries } = body;

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return Response.json(
        { error: 'No sales entries provided' },
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

    const salesSummary = entries.map((entry: { date: string; total: number; items: { name: string; qty: number; price: number; total: number; type?: string; category?: string }[] }) => ({
      date: entry.date,
      total: entry.total,
      items: entry.items.map((item) => {
        const label = `${item.name} (${item.qty})`;
        return item.type === 'expense' ? `[EXPENSE: ${item.category || 'other'}] ${label}` : label;
      }).join(', '),
    }));

    const prompt = `You are a business advisor for Indian street food vendors. Analyze the following sales and expense data and provide insights.

Sales & Expense Data:
${JSON.stringify(salesSummary, null, 2)}

Note: Items marked with [EXPENSE: category] are money the vendor SPENT (e.g., petrol, raw materials, rent). Other items are SALES (money earned).

Provide your response as ONLY valid JSON (no markdown, no code blocks) in this EXACT format:
{
  "insights": [
    "insight 1",
    "insight 2", 
    "insight 3"
  ],
  "suggestion": "one actionable suggestion for tomorrow",
  "top_item": "name of the best selling item"
}

Rules:
- Provide exactly 2-3 simple, actionable insights
- Focus on practical advice for a street vendor
- If there are expenses, comment on spending patterns (e.g., transport costs)
- Keep language simple and encouraging
- The suggestion should be specific and actionable
- Identify the top-selling item by quantity or revenue (NOT expenses)`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5,
      max_completion_tokens: 512,
    });

    const responseText = chatCompletion.choices[0]?.message?.content?.trim() || '';

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

    const parsed = JSON.parse(cleanJson);

    return Response.json(parsed);
  } catch (error) {
    console.error('Insights error:', error);
    
    // Return fallback insights
    return Response.json({
      insights: [
        'Keep tracking your daily sales consistently',
        'Focus on items with the highest profit margins',
        'Consider offering combo deals to increase sales',
      ],
      suggestion: 'Try preparing extra stock of your best-selling items tomorrow',
      top_item: 'Unable to determine',
    });
  }
}
