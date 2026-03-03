export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { 
        headers: corsHeaders,
        status: 204 
      });
    }

    const url = new URL(request.url);

    try {
      // ================= HEALTH CHECK =================
      if (url.pathname === "/api/health") {
        return new Response(
          JSON.stringify({ 
            status: "healthy", 
            time: Date.now(),
            message: "Worker is running"
          }),
          { 
            headers: { 
              "Content-Type": "application/json",
              ...corsHeaders 
            } 
          }
        );
      }

      // Kiểm tra API key cho các endpoint cần Gemini
      const checkApiKey = () => {
        if (!env.GEMINI_API_KEY) {
          throw new Error("GEMINI_API_KEY is missing");
        }
      };

      // ================= CHAT ENDPOINT =================
      if (url.pathname === "/api/chat") {
        if (request.method !== "POST") {
          return new Response(
            JSON.stringify({ error: "Method not allowed. Use POST" }),
            { 
              status: 405, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders,
                "Allow": "POST"
              } 
            }
          );
        }

        checkApiKey();

        let body;
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { 
              status: 400, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );
        }

        const { message, history = [] } = body;

        if (!message || typeof message !== 'string') {
          return new Response(
            JSON.stringify({ error: "Missing or invalid message field" }),
            { 
              status: 400, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );
        }

        try {
          // Xây dựng prompt với context
          const contents = [
            {
              role: "user",
              parts: [{ 
                text: `Bạn là gia sư tiếng Anh cấp 3 thân thiện, nhiệt tình. 
                Hãy trả lời bằng tiếng Việt, giải thích dễ hiểu, có ví dụ cụ thể.
                
                Câu hỏi: ${message}` 
              }]
            }
          ];

          // Thêm history nếu có
          if (history && history.length > 0) {
            const historyContents = history.map(msg => ({
              role: msg.role === 'user' ? 'user' : 'model',
              parts: [{ text: msg.content }]
            }));
            contents.unshift(...historyContents);
          }

          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents,
                generationConfig: {
                  temperature: 0.8,
                  maxOutputTokens: 1024,
                }
              })
            }
          );

          const geminiData = await geminiResponse.json();

          if (!geminiResponse.ok) {
            return new Response(
              JSON.stringify({ 
                error: "Gemini API error",
                details: geminiData.error?.message || "Unknown error"
              }),
              { 
                status: 500, 
                headers: { 
                  "Content-Type": "application/json",
                  ...corsHeaders 
                } 
              }
            );
          }

          const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Xin lỗi, không nhận được phản hồi từ AI.";

          return new Response(
            JSON.stringify({ 
              response: reply,
              timestamp: Date.now()
            }),
            { 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );

        } catch (error) {
          return new Response(
            JSON.stringify({ 
              error: "Failed to get AI response",
              details: error.message
            }),
            { 
              status: 500, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );
        }
      }

      // ================= GENERATE EXERCISE ENDPOINT =================
      if (url.pathname === "/api/generate-exercise") {
        if (request.method !== "POST") {
          return new Response(
            JSON.stringify({ error: "Method not allowed. Use POST" }),
            { 
              status: 405, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );
        }

        checkApiKey();

        let body;
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { 
              status: 400, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );
        }

        const { topic, count = 5, difficulty = 'medium' } = body;

        if (!topic || typeof topic !== 'string') {
          return new Response(
            JSON.stringify({ error: "Missing or invalid topic field" }),
            { 
              status: 400, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );
        }

        // Validate count
        const questionCount = Math.min(Math.max(parseInt(count) || 5, 1), 20);

        try {
          const prompt = `Tạo ${questionCount} câu hỏi trắc nghiệm tiếng Anh trình độ ${difficulty} về chủ đề "${topic}".

Yêu cầu:
- Mỗi câu có 4 đáp án A, B, C, D
- Đánh dấu đáp án đúng (A, B, C, hoặc D)
- Có giải thích ngắn gọn bằng tiếng Việt
- Trả về JSON array hợp lệ, KHÔNG thêm text nào khác

Format mẫu:
[
  {
    "question": "Nội dung câu hỏi?",
    "options": ["A. Đáp án A", "B. Đáp án B", "C. Đáp án C", "D. Đáp án D"],
    "correct": "A",
    "explanation": "Giải thích tại sao đáp án A đúng"
  }
]`;

          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  role: "user",
                  parts: [{ text: prompt }]
                }],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 2048,
                }
              })
            }
          );

          const geminiData = await geminiResponse.json();

          if (!geminiResponse.ok) {
            return new Response(
              JSON.stringify({ 
                error: "Gemini API error",
                details: geminiData.error?.message || "Unknown error"
              }),
              { 
                status: 500, 
                headers: { 
                  "Content-Type": "application/json",
                  ...corsHeaders 
                } 
              }
            );
          }

          let exercises = [];
          const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
          
          // Clean và parse JSON
          try {
            // Xóa markdown code blocks nếu có
            const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
            exercises = JSON.parse(cleanedText);
            
            // Validate structure
            if (!Array.isArray(exercises)) {
              exercises = [];
            } else {
              // Đảm bảo mỗi câu hỏi có đúng format
              exercises = exercises.map((q, index) => ({
                question: q.question || `Câu hỏi ${index + 1}`,
                options: Array.isArray(q.options) ? q.options : [
                  "A. Option A",
                  "B. Option B", 
                  "C. Option C",
                  "D. Option D"
                ],
                correct: q.correct || "A",
                explanation: q.explanation || "Không có giải thích"
              }));
            }
          } catch (e) {
            console.error('Failed to parse exercises JSON:', e);
            exercises = [];
          }

          return new Response(
            JSON.stringify({ 
              exercises,
              count: exercises.length,
              topic,
              difficulty
            }),
            { 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );

        } catch (error) {
          return new Response(
            JSON.stringify({ 
              error: "Failed to generate exercises",
              details: error.message
            }),
            { 
              status: 500, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );
        }
      }

      // ================= GENERATE EXAM ENDPOINT =================
      if (url.pathname === "/api/generate-exam") {
        if (request.method !== "POST") {
          return new Response(
            JSON.stringify({ error: "Method not allowed. Use POST" }),
            { 
              status: 405, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );
        }

        checkApiKey();

        let body;
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { 
              status: 400, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );
        }

        const { type, grade } = body;

        if (!type || !grade) {
          return new Response(
            JSON.stringify({ error: "Missing type or grade field" }),
            { 
              status: 400, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );
        }

        // Định nghĩa các loại đề thi
        const examConfig = {
          '15min': { name: 'Kiểm tra 15 phút', questions: 10, time: 15 },
          'midterm': { name: 'Giữa kỳ', questions: 30, time: 45 },
          'final': { name: 'Cuối kỳ', questions: 40, time: 60 },
          'gifted': { name: 'Học sinh giỏi', questions: 50, time: 90 },
          'graduation': { name: 'Tốt nghiệp', questions: 60, time: 120 }
        };

        const config = examConfig[type] || examConfig['15min'];

        try {
          const prompt = `Tạo đề thi ${config.name} môn Tiếng Anh cho học sinh ${grade}.

Yêu cầu:
- ${config.questions} câu hỏi trắc nghiệm
- Bao gồm các chủ đề: ngữ pháp, từ vựng, đọc hiểu
- Mỗi câu có 4 đáp án A, B, C, D
- Đánh dấu đáp án đúng
- Có giải thích ngắn gọn bằng tiếng Việt
- Trả về JSON array hợp lệ

Format mẫu:
[
  {
    "question": "Nội dung câu hỏi?",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "correct": "A",
    "explanation": "Giải thích..."
  }
]`;

          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  role: "user",
                  parts: [{ text: prompt }]
                }],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 4096,
                }
              })
            }
          );

          const geminiData = await geminiResponse.json();

          if (!geminiResponse.ok) {
            return new Response(
              JSON.stringify({ 
                error: "Gemini API error",
                details: geminiData.error?.message || "Unknown error"
              }),
              { 
                status: 500, 
                headers: { 
                  "Content-Type": "application/json",
                  ...corsHeaders 
                } 
              }
            );
          }

          let questions = [];
          const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
          
          try {
            const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
            questions = JSON.parse(cleanedText);
            
            if (!Array.isArray(questions)) {
              questions = [];
            }
          } catch (e) {
            console.error('Failed to parse exam JSON:', e);
            questions = [];
          }

          return new Response(
            JSON.stringify({ 
              exam: {
                type: config.name,
                grade,
                time: config.time,
                totalQuestions: config.questions,
                questions: questions.slice(0, config.questions)
              }
            }),
            { 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );

        } catch (error) {
          return new Response(
            JSON.stringify({ 
              error: "Failed to generate exam",
              details: error.message
            }),
            { 
              status: 500, 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders 
              } 
            }
          );
        }
      }

      // ================= 404 NOT FOUND =================
      return new Response(
        JSON.stringify({ 
          error: "Endpoint not found",
          path: url.pathname,
          available: ["/api/health", "/api/chat", "/api/generate-exercise", "/api/generate-exam"]
        }),
        { 
          status: 404, 
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders 
          } 
        }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: "Internal server error",
          details: error.message
        }),
        { 
          status: 500, 
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders 
          } 
        }
      );
    }
  },
};
