export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { topic, grade, count = 10, difficulty = "Trung bình", message } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY chưa được cấu hình"
      });
    }

    // =====================================================
    // 🔵 CHAT AI
    // =====================================================
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
          error: data.error?.message || "Lỗi từ Gemini API"
        });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      return res.status(200).json({
        response: text || "Không có phản hồi"
      });
    }

    // =====================================================
    // 🟣 TẠO BÀI TẬP / ĐỀ THI
    // =====================================================
    if (topic && grade) {

      const prompt = `
Tạo ${count} câu trắc nghiệm tiếng Anh.

Chủ đề: ${topic}
Trình độ: ${grade}
Độ khó: ${difficulty}

QUY TẮC BẮT BUỘC:
- Mỗi câu có đúng 4 đáp án
- Định dạng đáp án phải là: "A. ...", "B. ...", "C. ...", "D. ..."
- Chỉ có 1 đáp án đúng
- KHÔNG thêm bất kỳ văn bản nào ngoài JSON
- KHÔNG markdown
- KHÔNG giải thích

Chỉ trả về JSON như sau:

{
  "questions": [
    {
      "question": "Câu hỏi ở đây",
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
              maxOutputTokens: 2000,
              response_mime_type: "application/json"
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error?.message || "Lỗi từ Gemini API"
        });
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return res.status(500).json({
          error: "AI không trả dữ liệu"
        });
      }

      try {
        const parsed = JSON.parse(text);

        // kiểm tra an toàn
        if (!parsed.questions || !Array.isArray(parsed.questions)) {
          throw new Error("Sai cấu trúc JSON");
        }

        return res.status(200).json(parsed);

      } catch (err) {
        return res.status(500).json({
          error: "AI trả sai format JSON",
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
