export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { topic, grade } = req.body;

    if (!topic || !grade) {
      return res.status(400).json({
        error: "Thiếu topic hoặc grade"
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY chưa được cấu hình"
      });
    }

    const prompt = `
Tạo đề thi tiếng Anh cho lớp ${grade}.
Chủ đề: ${topic}.
Gồm 10 câu trắc nghiệm, có đáp án và giải thích.
Trả về JSON theo format:
{
  questions: [
    {
      question: "",
      options: ["A", "B", "C", "D"],
      correct: "",
      explanation: ""
    }
  ]
}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
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
        error: "Gemini không trả về nội dung"
      });
    }

    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;

    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(500).json({
        error: "Gemini trả về JSON không hợp lệ",
        raw: text
      });
    }

    res.status(200).json(parsed);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
