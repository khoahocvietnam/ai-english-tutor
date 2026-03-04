export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { topic, grade, count = 10, difficulty = "Trung bình", message } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY chưa cấu hình"
      });
    }

    // ==========================================
    // 🔵 CHAT AI
    // ==========================================
    if (message && message.trim() !== "") {

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: message.trim() }]
              }
            ],
            generationConfig: {
              temperature: 0.5,
              maxOutputTokens: 400
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error?.message || "Lỗi từ Gemini"
        });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      return res.status(200).json({
        response: text || "Không có phản hồi"
      });
    }

    // ==========================================
    // 🟣 TẠO BÀI TẬP
    // ==========================================
    if (topic && grade) {

      const prompt = `
Tạo ${count} câu trắc nghiệm tiếng Anh.

Chủ đề: ${topic}
Trình độ: ${grade}
Độ khó: ${difficulty}

BẮT BUỘC:
- Chỉ trả về JSON
- Không markdown
- Không giải thích
- Không thêm text ngoài JSON

Format duy nhất:

{
  "questions": [
    {
      "question": "Câu hỏi",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct": "A"
    }
  ]
}
`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 2000
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error?.message || "Lỗi từ Gemini"
        });
      }

      let text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return res.status(500).json({
          error: "AI không trả dữ liệu"
        });
      }

      // ===============================
      // 🔥 AUTO EXTRACT JSON
      // ===============================

      text = text.trim();

      // nếu AI lỡ thêm ```json
      text = text.replace(/```json/g, "").replace(/```/g, "");

      // tìm JSON block đầu tiên
      const match = text.match(/\{[\s\S]*\}/);

      if (!match) {
        return res.status(500).json({
          error: "Không tìm thấy JSON hợp lệ",
          raw: text
        });
      }

      try {
        const parsed = JSON.parse(match[0]);

        if (!parsed.questions || !Array.isArray(parsed.questions)) {
          throw new Error("Sai cấu trúc JSON");
        }

        return res.status(200).json(parsed);

      } catch (err) {
        return res.status(500).json({
          error: "AI trả sai JSON",
          raw: text
        });
      }
    }

    return res.status(400).json({
      error: "Thiếu message hoặc topic + grade"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
