export default {
  async fetch(request, env) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);

    // =========================
    // HELPER: Call Gemini
    // =========================
    async function callGemini(prompt) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(JSON.stringify(data));
      }

      let text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // 🔥 XỬ LÝ JSON BỊ BỌC ```json
      text = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      return text;
    }

    try {
      // =========================
      // HEALTH
      // =========================
      if (url.pathname === "/api/health") {
        return new Response(
          JSON.stringify({
            status: "healthy",
            model: "gemini-2.5-flash-lite",
            time: Date.now(),
          }),
          { headers: { "Content-Type": "application/json", ...headers } }
        );
      }

      if (!env.GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({ error: "GEMINI_API_KEY is missing" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...headers },
          }
        );
      }

      // =========================
      // CHAT
      // =========================
      if (url.pathname === "/api/chat") {
        if (request.method !== "POST") {
          return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            {
              status: 405,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

        const body = await request.json();

        if (!body.message) {
          return new Response(
            JSON.stringify({ error: "Missing message field" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

        const prompt = `
Bạn là gia sư tiếng Anh cấp 3.
Giải thích bằng tiếng Việt dễ hiểu.
Trả lời rõ ràng, có ví dụ nếu cần.

Câu hỏi:
${body.message}
`;

        const reply = await callGemini(prompt);

        return new Response(
          JSON.stringify({ response: reply }),
          { headers: { "Content-Type": "application/json", ...headers } }
        );
      }

      // =========================
      // GENERATE EXERCISE
      // =========================
      if (url.pathname === "/api/generate-exercise") {
        const body = await request.json();
        const { topic, count = 5 } = body;

        if (!topic) {
          return new Response(
            JSON.stringify({ error: "Missing topic" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

        const prompt = `
Tạo ${count} câu hỏi trắc nghiệm tiếng Anh về "${topic}".

Yêu cầu:
- Mỗi câu gồm:
{
  "question": "...",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correct": "A",
  "explanation": "..."
}

Trả về đúng JSON array.
Không thêm markdown.
Không thêm giải thích ngoài JSON.
`;

        const reply = await callGemini(prompt);

        return new Response(reply, {
          headers: { "Content-Type": "application/json", ...headers },
        });
      }

      // =========================
      // GENERATE EXAM (THÊM MỚI - FIX LỖI 404)
      // =========================
      if (url.pathname === "/api/generate-exam") {
        const body = await request.json();
        const { type, grade } = body;

        const prompt = `
Tạo đề thi tiếng Anh cho ${grade}.
Loại đề: ${type}.

Trả về JSON array câu hỏi giống format:

{
  "question": "...",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correct": "A",
  "explanation": "..."
}

Không thêm markdown.
Không thêm chữ ngoài JSON.
`;

        const reply = await callGemini(prompt);

        return new Response(reply, {
          headers: { "Content-Type": "application/json", ...headers },
        });
      }

      return new Response(
        JSON.stringify({ error: "Endpoint not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Server error",
          details: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );
    }
  },
};
