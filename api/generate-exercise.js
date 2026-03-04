const { topic, grade, message } = req.body;

// =========================
// 🔵 CHAT AI
// =========================
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
        ]
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

// =========================
// 🟣 TẠO ĐỀ THI
// =========================
if (topic && grade) {
  // giữ nguyên phần tạo đề thi
}
else {
  return res.status(400).json({
    error: "Thiếu dữ liệu: cần message hoặc topic + grade"
  });
}
