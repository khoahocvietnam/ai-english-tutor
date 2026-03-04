export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { topic, grade, count = 10, difficulty = "Trung bình", message } = req.body;

    // ==============================
    // 🔵 CHAT AI (TỐI ƯU TỐC ĐỘ)
    // ==============================
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
              temperature: 0.6,
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

    // ==============================
    // 🟣 TẠO BÀI TẬP PRO
    // ==============================
    if (topic && grade) {

      const prompt = `
Tạo ${count} câu trắc nghiệm tiếng Anh.
Chủ đề: ${topic}
Trình độ: ${grade}
Độ khó: ${difficulty}

YÊU CẦU:
- Mỗi câu có 4 đáp án A, B, C, D
- Chỉ 1 đáp án đúng
- Trả về JSON thuần, không giải thích thêm

Format chính xác như sau:

{
  "questions": [
    {
      "question": "Câu hỏi...",
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
              temperature: 0.7,
              maxOutputTokens: 1500
            }
          })
        }
      );

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return res.status(500).json({ error: "AI không trả dữ liệu" });
      }

      // ==============================
      // 🛠 AUTO FIX JSON
      // ==============================

      let cleanText = text.trim();

      // bỏ ```json nếu có
      cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "");

      try {
        const json = JSON.parse(cleanText);
        return res.status(200).json(json);
      } catch (err) {
        return res.status(500).json({
          error: "AI trả sai format JSON",
          raw: cleanText
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
