import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';
import { getCatalogPromptBlock, findCatalogItem } from '@/lib/item-catalog';

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
    const catalogBlock = await getCatalogPromptBlock();

    const prompt = `Convert the following voice input into structured JSON. Extract items, quantity, price per unit, and total. IMPORTANT: Classify each item as either a "sale" (money earned) or "expense" (money spent). The input may be in Hindi, English, or Hinglish.

Voice input: "${text}"

${catalogBlock}

Output ONLY valid JSON in this EXACT format (no markdown, no code blocks, no explanation):
{
  "items": [
    { "name": "item name", "qty": number, "price": number, "total": number, "type": "sale", "category": "" },
    { "name": "item name", "qty": number, "price": number, "total": number, "type": "expense", "category": "transport" }
  ],
  "total_earnings": number,
  "total_expenses": number,
  "date": "${today}",
  "needs_clarification": false,
  "clarification_message": ""
}

CRITICAL RULES FOR QUANTITY CALCULATION:
1. ALWAYS look up the item in the ITEM PRICE CATALOG above to get its price_per_unit.
2. If the user mentions an AMOUNT/TOTAL but NOT the quantity (e.g., "samosa worth 100rs", "100 rupees ka samosa"):
   a. Look up price_per_unit from the catalog (Samosa = ₹25).
   b. Calculate qty = total_amount / price_per_unit (100 / 25 = 4).
   c. Use that qty and price in the output.
3. If the user mentions QUANTITY directly (e.g., "10 samosa becha"), use that qty and look up the price from catalog.
4. If the total_amount does NOT divide evenly by price_per_unit:
   a. Set "needs_clarification" to true.
   b. Set "clarification_message" to a helpful message in the SAME LANGUAGE as the user's input, e.g.:
      - English: "₹100 doesn't divide evenly by ₹30 (Jalebi). Did you mean ₹90 (3 plates) or ₹120 (4 plates)?"
      - Hindi: "₹100, ₹30 प्रति प्लेट (जलेबी) से बराबर नहीं बँटता। क्या आपका मतलब ₹90 (3 प्लेट) या ₹120 (4 प्लेट) था?"
   c. Still provide your BEST GUESS in the items array (round DOWN the qty).
5. If the item is NOT in the catalog, make a reasonable price assumption and set "needs_clarification" to true with message: "Item '[name]' is not in the catalog. Assumed price ₹X per unit. Please confirm."

General rules:
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
- "100 ka samosa becha" = sold samosa worth ₹100 (sale, use catalog price to get qty)
- "samosa worth 100" = sold samosa worth ₹100 (sale, use catalog price to get qty)
- If someone mentions buying/purchasing something for business use, it's an expense
- If quantity is not clear and total amount is not clear, assume qty = 1 and use catalog price`;

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

    // ── Server-side price validation ──
    // The AI sometimes silently rounds instead of flagging. We independently
    // verify each cataloged item's total against the catalog unit price.
    const flagMessages: string[] = [];

    for (const item of parsed.items) {
      const catalogEntry = await findCatalogItem(item.name);
      if (!catalogEntry) continue; // unknown items already handled by AI

      const unitPrice = catalogEntry.price_per_unit;
      const itemTotal = item.qty * item.price;

      // Check if total divides evenly by unit price
      if (itemTotal % unitPrice !== 0) {
        const qtyFloor = Math.floor(itemTotal / unitPrice);
        const qtyCeil = qtyFloor + 1;
        const lowerTotal = qtyFloor * unitPrice;
        const upperTotal = qtyCeil * unitPrice;

        flagMessages.push(
          `₹${itemTotal} doesn't divide evenly by ₹${unitPrice} (${catalogEntry.name}, ₹${unitPrice}/${catalogEntry.unit}). Did you mean ₹${lowerTotal} (${qtyFloor} ${catalogEntry.unit}${qtyFloor > 1 ? 's' : ''}) or ₹${upperTotal} (${qtyCeil} ${catalogEntry.unit}${qtyCeil > 1 ? 's' : ''})?`
        );

        // Fix the item to reflect the floored qty
        item.qty = qtyFloor || 1;
        item.total = item.qty * unitPrice;
        item.price = unitPrice;
      } else if (item.price !== unitPrice) {
        // Price doesn't match catalog but total happens to work — correct the price
        item.price = unitPrice;
        item.qty = itemTotal / unitPrice;
        item.total = itemTotal;
      }
    }

    // Recalculate totals after corrections
    if (flagMessages.length > 0) {
      let recalcEarnings = 0;
      let recalcExpenses = 0;
      for (const item of parsed.items) {
        if (item.type === 'sale') recalcEarnings += item.total;
        else recalcExpenses += item.total;
      }
      parsed.total_earnings = recalcEarnings;
      parsed.total_expenses = recalcExpenses;
    }

    // Merge AI flags with server-side flags
    const aiMessage = parsed.clarification_message || '';
    const allMessages = [aiMessage, ...flagMessages].filter(Boolean).join('\n');
    parsed.needs_clarification = parsed.needs_clarification || flagMessages.length > 0;
    parsed.clarification_message = allMessages;

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
