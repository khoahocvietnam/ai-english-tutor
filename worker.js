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

    try {
      // =========================
      // HEALTH CHECK
      // =========================
      if (url.pathname === "/api/health") {
        return new Response(
          JSON.stringify({
            status: "healthy",
            time: Date.now(),
            message: "Worker is running",
          }),
          { headers: { "Content-Type": "application/json", ...headers } }
        );
      }

      // =========================
      // CHAT API
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

        if (!env.GEMINI_API_KEY) {
          return new Response(
            JSON.stringify({ error: "GEMINI_API_KEY is missing" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

        let body;
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

        if (!body.message) {
          return new Response(
            JSON.stringify({ error: "Missing message field" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Bạn là gia sư tiếng Anh cấp 3. Hãy trả lời câu hỏi sau bằng tiếng Việt, giải thích dễ hiểu: ${body.message}`,
                    },
                  ],
                },
              ],
            }),
          }
        );

        const geminiData = await geminiResponse.json();

        if (!geminiResponse.ok) {
          return new Response(
            JSON.stringify({
              error: "Gemini API error",
              details: geminiData,
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

        const reply =
          geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "Xin lỗi, không nhận được phản hồi từ AI.";

        return new Response(
          JSON.stringify({ response: reply }),
          { headers: { "Content-Type": "application/json", ...headers } }
        );
      }

      // =========================
      // GENERATE EXERCISE
      // =========================
      if (url.pathname === "/api/generate-exercise") {
        if (!env.GEMINI_API_KEY) {
          return new Response(
            JSON.stringify({ error: "GEMINI_API_KEY is missing" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

        let body;
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

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

        const prompt = `Tạo ${count} câu hỏi trắc nghiệm tiếng Anh về chủ đề "${topic}".
Mỗi câu có 4 đáp án A, B, C, D.
Trả về JSON array.`;

        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
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

        const geminiData = await geminiResponse.json();

        if (!geminiResponse.ok) {
          return new Response(
            JSON.stringify({
              error: "Gemini API error",
              details: geminiData,
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...headers },
            }
          );
        }

        const reply =
          geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "[]";

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
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...headers },
        }
      );
    }
  },
};
