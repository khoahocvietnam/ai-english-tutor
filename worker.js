// worker.js - AI English Tutor với Gemini 2.0 Flash
// Deploy lên Cloudflare Worker

// CORS headers - Cho phép gọi từ mọi nơi
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
};

// Xử lý request chính
export default {
    async fetch(request, env) {
        // Handle preflight CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, { 
                headers: corsHeaders 
            });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // ==================== API CHAT ====================
            if (path === '/api/chat' && request.method === 'POST') {
                const { message, history } = await request.json();
                
                // Tạo context từ lịch sử
                let context = '';
                if (history && history.length > 0) {
                    context = history.map(msg => 
                        `${msg.role}: ${msg.content}`
                    ).join('\n') + '\n';
                }

                const prompt = `${context}Bạn là gia sư tiếng Anh cấp 3 chuyên nghiệp, thân thiện. 
Học sinh hỏi: ${message}

Hãy trả lời bằng tiếng Việt, giải thích dễ hiểu, có ví dụ cụ thể.`;

                const response = await callGemini(prompt, env.GEMINI_API_KEY);
                
                return new Response(JSON.stringify({ 
                    response,
                    timestamp: Date.now() 
                }), {
                    headers: { 
                        'Content-Type': 'application/json',
                        ...corsHeaders 
                    }
                });
            }

            // ==================== API TẠO BÀI TẬP ====================
            if (path === '/api/generate-exercise' && request.method === 'POST') {
                const { topic, count = 10, difficulty = 'medium' } = await request.json();

                const prompt = `Tạo bài tập tiếng Anh với các yêu cầu sau:

CHỦ ĐỀ: ${topic}
SỐ CÂU: ${count}
ĐỘ KHÓ: ${difficulty} (easy/medium/hard)

YÊU CẦU:
1. Mỗi câu hỏi là câu trắc nghiệm tiếng Anh
2. Có 4 đáp án A, B, C, D
3. Đánh dấu đáp án đúng (chỉ cần chữ cái)
4. Giải thích đáp án bằng tiếng Việt, dễ hiểu
5. Phù hợp với học sinh cấp 3

ĐỊNH DẠNG JSON (bắt buộc):
{
  "topic": "${topic}",
  "difficulty": "${difficulty}",
  "count": ${count},
  "questions": [
    {
      "id": 1,
      "question": "Câu hỏi tiếng Anh",
      "options": ["A. Đáp án 1", "B. Đáp án 2", "C. Đáp án 3", "D. Đáp án 4"],
      "correct": "A",
      "explanation": "Giải thích tại sao đáp án A đúng (bằng tiếng Việt)"
    }
  ]
}

CHỈ TRẢ VỀ JSON, KHÔNG THÊM TEXT KHÁC.`;

                const response = await callGemini(prompt, env.GEMINI_API_KEY);
                
                // Parse và validate JSON
                try {
                    // Xóa markdown code block nếu có
                    let cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    const jsonData = JSON.parse(cleanResponse);
                    
                    return new Response(JSON.stringify(jsonData), {
                        headers: { 
                            'Content-Type': 'application/json',
                            ...corsHeaders 
                        }
                    });
                } catch (e) {
                    // Nếu parse lỗi, trả về raw response
                    return new Response(JSON.stringify({ 
                        raw: response,
                        error: 'JSON parse error' 
                    }), {
                        headers: { 
                            'Content-Type': 'application/json',
                            ...corsHeaders 
                        }
                    });
                }
            }

            // ==================== API TẠO ĐỀ THI ====================
            if (path === '/api/generate-exam' && request.method === 'POST') {
                const { type, grade, format = 'multiple-choice' } = await request.json();

                // Định nghĩa cấu hình đề thi
                const examConfig = {
                    '15min': { time: 15, questions: 10, name: '15 phút' },
                    'midterm': { time: 45, questions: 30, name: 'giữa kỳ' },
                    'final': { time: 60, questions: 40, name: 'cuối kỳ' },
                    'gifted': { time: 90, questions: 50, name: 'học sinh giỏi' },
                    'graduation': { time: 120, questions: 60, name: 'tốt nghiệp' }
                };

                const config = examConfig[type] || examConfig['15min'];

                const prompt = `Tạo đề thi tiếng Anh với các yêu cầu:

LOẠI ĐỀ: ${config.name}
LỚP: ${grade}
THỜI GIAN: ${config.time} phút
SỐ CÂU: ${config.questions}
DẠNG ĐỀ: ${format}

YÊU CẦU:
1. Tạo ${config.questions} câu hỏi trắc nghiệm
2. Mỗi câu có 4 đáp án A, B, C, D
3. Có đáp án đúng và giải thích bằng tiếng Việt
4. Nội dung phù hợp với học sinh lớp ${grade}
5. Bao gồm các phần: Ngữ âm, Ngữ pháp, Từ vựng, Đọc hiểu

ĐỊNH DẠNG JSON:
{
  "examId": "EXAM_${Date.now()}",
  "type": "${type}",
  "grade": "${grade}",
  "time": ${config.time},
  "totalQuestions": ${config.questions},
  "sections": [
    {
      "name": "Ngữ âm",
      "questions": [...]
    },
    {
      "name": "Ngữ pháp",
      "questions": [...]
    }
  ]
}

CHỈ TRẢ VỀ JSON.`;

                const response = await callGemini(prompt, env.GEMINI_API_KEY);
                
                // Parse và trả về
                let cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                
                return new Response(cleanResponse, {
                    headers: { 
                        'Content-Type': 'application/json',
                        ...corsHeaders 
                    }
                });
            }

            // ==================== API PHÂN TÍCH LỖI ====================
            if (path === '/api/analyze-mistakes' && request.method === 'POST') {
                const { mistakes, topic } = await request.json();

                const prompt = `Phân tích lỗi sai của học sinh:

CHỦ ĐỀ: ${topic}
CÁC LỖI SAI:
${mistakes.map((m, i) => `${i+1}. ${m}`).join('\n')}

Hãy phân tích:
1. Điểm yếu chính là gì?
2. Nguyên nhân sai?
3. Đề xuất 5 bài học cần ôn tập
4. Tạo 5 câu hỏi luyện tập thêm

ĐỊNH DẠNG JSON:
{
  "weakness": "Điểm yếu chính",
  "causes": ["Nguyên nhân 1", "Nguyên nhân 2"],
  "recommendedLessons": ["Bài 1", "Bài 2", "Bài 3", "Bài 4", "Bài 5"],
  "practiceQuestions": [
    {
      "question": "Câu hỏi",
      "options": ["A", "B", "C", "D"],
      "correct": "A",
      "explanation": "Giải thích"
    }
  ]
}`;

                const response = await callGemini(prompt, env.GEMINI_API_KEY);
                
                let cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                
                return new Response(cleanResponse, {
                    headers: { 
                        'Content-Type': 'application/json',
                        ...corsHeaders 
                    }
                });
            }

            // ==================== API TẠO LỘ TRÌNH ====================
            if (path === '/api/generate-learning-path' && request.method === 'POST') {
                const { grade, weakPoints, goals, history } = await request.json();

                const prompt = `Tạo lộ trình học tiếng Anh CÁ NHÂN HÓA:

THÔNG TIN HỌC SINH:
- Lớp: ${grade}
- Điểm yếu: ${weakPoints.join(', ')}
- Mục tiêu: ${goals}
- Lịch sử học tập: ${history || 'Chưa có'}

YÊU CẦU:
1. Tạo lộ trình 4 tuần, mỗi tuần 3 buổi
2. Tập trung vào điểm yếu của học sinh
3. Có bài tập cụ thể cho từng buổi
4. Đánh giá sau mỗi tuần

ĐỊNH DẠNG JSON:
{
  "studentInfo": {
    "grade": "${grade}",
    "weakPoints": ${JSON.stringify(weakPoints)},
    "goals": "${goals}"
  },
  "weeks": [
    {
      "week": 1,
      "focus": "Chủ đề tuần 1",
      "sessions": [
        {
          "day": 1,
          "topic": "Bài học",
          "exercises": ["Bài tập 1", "Bài tập 2"],
          "resources": ["Tài liệu 1", "Tài liệu 2"]
        }
      ],
      "evaluation": "Tiêu chí đánh giá"
    }
  ]
}`;

                const response = await callGemini(prompt, env.GEMINI_API_KEY);
                
                let cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                
                return new Response(cleanResponse, {
                    headers: { 
                        'Content-Type': 'application/json',
                        ...corsHeaders 
                    }
                });
            }

            // ==================== API CHẤM ĐIỂM WRITING ====================
            if (path === '/api/grade-writing' && request.method === 'POST') {
                const { essay, topic, level } = await request.json();

                const prompt = `Chấm điểm bài viết tiếng Anh:

CHỦ ĐỀ: ${topic}
TRÌNH ĐỘ: ${level}
BÀI VIẾT:
${essay}

CHẤM ĐIỂM THEO THANG 10:
1. Ngữ pháp (3 điểm): Kiểm tra thì, cấu trúc câu, lỗi ngữ pháp
2. Từ vựng (3 điểm): Độ đa dạng, chính xác, phù hợp
3. Ý tưởng (2 điểm): Mạch lạc, logic, phát triển ý
4. Cấu trúc (2 điểm): Bố cục, liên kết câu

ĐỊNH DẠNG JSON:
{
  "totalScore": 0,
  "details": {
    "grammar": {"score": 0, "feedback": "Nhận xét", "errors": ["Lỗi 1", "Lỗi 2"]},
    "vocabulary": {"score": 0, "feedback": "Nhận xét"},
    "ideas": {"score": 0, "feedback": "Nhận xét"},
    "structure": {"score": 0, "feedback": "Nhận xét"}
  },
  "strengths": ["Điểm mạnh 1", "Điểm mạnh 2"],
  "improvements": ["Cần cải thiện 1", "Cần cải thiện 2"],
  "correctedVersion": "Phiên bản đã sửa lỗi"
}`;

                const response = await callGemini(prompt, env.GEMINI_API_KEY);
                
                let cleanResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                
                return new Response(cleanResponse, {
                    headers: { 
                        'Content-Type': 'application/json',
                        ...corsHeaders 
                    }
                });
            }

            // ==================== API HEALTH CHECK ====================
            if (path === '/api/health' && request.method === 'GET') {
                return new Response(JSON.stringify({ 
                    status: 'healthy',
                    time: Date.now(),
                    model: 'Gemini 2.0 Flash'
                }), {
                    headers: { 
                        'Content-Type': 'application/json',
                        ...corsHeaders 
                    }
                });
            }

            // 404 cho các route không xác định
            return new Response(JSON.stringify({ error: 'API endpoint not found' }), {
                status: 404,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders 
                }
            });

        } catch (error) {
            // Xử lý lỗi
            return new Response(JSON.stringify({ 
                error: error.message,
                stack: error.stack 
            }), {
                status: 500,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders 
                }
            });
        }
    }
};

/**
 * Gọi Gemini 2.0 Flash API
 * @param {string} prompt - Câu lệnh gửi đến AI
 * @param {string} apiKey - API key từ Google AI Studio
 * @returns {Promise<string>} - Phản hồi từ AI
 */
async function callGemini(prompt, apiKey) {
    // Sử dụng model gemini-2.0-flash-exp (nhanh nhất)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    
    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        generationConfig: {
            temperature: 0.7,           // Sáng tạo vừa phải
            topK: 40,                    // Lấy top 40 tokens
            topP: 0.95,                   // Nucleus sampling
            maxOutputTokens: 4096,        // Độ dài tối đa
        },
        safetySettings: [                 // Cài đặt an toàn
            {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
        ]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        // Kiểm tra response có hợp lệ không
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            console.error('Invalid Gemini response:', JSON.stringify(data));
            throw new Error('Invalid response from Gemini API');
        }

        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Error calling Gemini:', error);
        throw error;
    }
}
