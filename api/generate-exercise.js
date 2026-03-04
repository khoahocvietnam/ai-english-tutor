export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { topic, grade, count = 10, difficulty = "Trung bình", message } = req.body;

    const API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;

    // =====================================================
    // 🔵 CHAT AI (NHANH + ỔN ĐỊNH)
    // =====================================================
    if (message && message.trim() !== "") {

      const response = await fetch(API_URL, {
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
            temperature: 0.6,
            maxOutputTokens: 400
          }
        })
      });

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
    // 🟣 TẠO BÀI TẬP CHUẨN JSON
    // =====================================================
    if (topic && grade) {

      const prompt = `
Bạn là hệ thống tạo đề thi chuyên nghiệp.

TẠO CHÍNH XÁC ${count} câu trắc nghiệm tiếng Anh.

Chủ đề: ${topic}
Trình độ: ${grade}
Độ khó: ${difficulty}

YÊU CẦU BẮT BUỘC:
- Mỗi câu có đúng 4 đáp án
- options PHẢI là mảng 4 phần tử
- correct CHỈ là A, B, C hoặc D (KHÔNG có dấu chấm)
- KHÔNG giải thích
- KHÔNG thêm chữ ngoài JSON
- CHỈ trả JSON thuần

FORMAT DUY NHẤT:

{
  "questions": [
    {
      "question": "Câu hỏi",
      "options": [
        "A. ...",
        "B. ...",
        "C. ...",
        "D. ..."
      ],
      "correct": "A"
    }
  ]
}
`;

      const response = await fetch(API_URL, {
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
            temperature: 0.4,
            maxOutputTokens: 1500,
            responseMimeType: "application/json"
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.error?.message || "Lỗi từ Gemini API"
        });
      }

      let text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return res.status(500).json({ error: "AI không trả dữ liệu" });
      }

      // 🔥 CLEAN JSON nếu AI lỡ bọc ```json
      text = text.trim()
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      try {
        const parsed = JSON.parse(text);

        // 🔥 VALIDATE LẠI CHO CHẮC
        if (!parsed.questions || !Array.isArray(parsed.questions)) {
          throw new Error("Sai cấu trúc questions");
        }

        parsed.questions.forEach(q => {
          if (!q.question) throw new Error("Thiếu question");
          if (!Array.isArray(q.options) || q.options.length !== 4)
            throw new Error("Options không đủ 4");
          if (!["A","B","C","D"].includes(q.correct))
            throw new Error("Correct sai format");
        });

        return res.status(200).json(parsed);

      } catch (err) {
        return res.status(500).json({
          error: "AI trả sai format JSON",
          raw: text
        });
      }
    }

    return res.status(400).json({
      error: "Thiếu dữ liệu"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
