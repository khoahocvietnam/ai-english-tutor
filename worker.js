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
            message: "Worker is running",
            apiKey: env.GEMINI_API_KEY ? "configured" : "missing"
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
      if (!env.GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({ 
            error: "GEMINI_API_KEY is missing",
            details: "Please set GEMINI_API_KEY in environment variables"
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

      // ======== Gemini Call với retry ========
      const callGemini = async (payload, retries = 3) => {
        // Sử dụng model gemini-1.5-flash (ổn định nhất)
        // Nếu muốn dùng experimental: gemini-2.0-flash-exp
        const model = "gemini-1.5-flash";
        
        for (let i = 0; i <= retries; i++) {
          try {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
              {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  ...payload,
                  generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2048,
                    topP: 0.95,
                    topK: 40,
                    ...payload.generationConfig
                  }
                }),
              }
            );

            const data = await response.json();

            if (response.ok) {
              return data;
            }

            // Retry cho lỗi 503 (quá tải) hoặc 429 (rate limit)
            if ((response.status === 503 || response.status === 429) && i < retries) {
              const delay = 1000 * Math.pow(2, i); // Exponential backoff: 1s, 2s, 4s
              console.log(`Retry ${i + 1}/${retries} after ${delay}ms`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }

            // Lỗi khác
            const errorMessage = data.error?.message || JSON.stringify(data);
            throw new Error(`Gemini API error (${response.status}): ${errorMessage}`);

          } catch (error) {
            if (i === retries) throw error;
            
            // Retry cho lỗi mạng
            if (error.message.includes('fetch failed') && i < retries) {
              const delay = 1000 * Math.pow(2, i);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            
            throw error;
          }
        }
      };

      // ================= CHAT API =================
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
          // Xây dựng conversation history
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

          const geminiData = await callGemini({ 
            contents,
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 1024,
            }
          });

          let reply = "Xin lỗi, tôi không thể xử lý yêu cầu này ngay bây giờ.";
          
          if (geminiData?.candidates?.[0]?.content?.parts?.[0]?.text) {
            reply = geminiData.candidates[0].content.parts[0].text;
          } else if (geminiData?.candidates?.[0]?.finishReason) {
            reply = `Không thể tạo phản hồi. Lý do: ${geminiData.candidates[0].finishReason}`;
          }

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
          console.error('Chat endpoint error:', error);
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

      // ================= GENERATE EXERCISE =================
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

          const geminiData = await callGemini({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            }
          });

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
          console.error('Generate exercise error:', error);
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

      // ================= GENERATE EXAM =================
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

          const geminiData = await callGemini({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4096,
            }
          });

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
          console.error('Generate exam error:', error);
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
      console.error('Worker error:', error);
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
