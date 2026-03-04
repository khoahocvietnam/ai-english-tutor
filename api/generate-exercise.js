export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { topic, grade } = req.body;

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
          ]
        })
      }
    );

    const data = await response.json();

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
