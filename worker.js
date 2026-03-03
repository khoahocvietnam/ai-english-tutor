// worker.js - ĐÃ SỬA LỖI JSON PARSE
export default {
    async fetch(request, env) {
        // CORS headers
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers });
        }

        const url = new URL(request.url);

        try {
            // HEALTH CHECK - GET
            if (url.pathname === '/api/health') {
                return new Response(JSON.stringify({ 
                    status: 'healthy', 
                    time: Date.now(),
                    message: 'Worker is running'
                }), { 
                    headers: { 'Content-Type': 'application/json', ...headers } 
                });
            }

            // CHAT API - POST
            if (url.pathname === '/api/chat') {
                // Kiểm tra method
                if (request.method !== 'POST') {
                    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
                        status: 405, 
                        headers: { 'Content-Type': 'application/json', ...headers } 
                    });
                }

                // Đọc body với kiểm tra lỗi
                let body;
                try {
                    body = await request.json();
                } catch (e) {
                    return new Response(JSON.stringify({ 
                        error: 'Invalid JSON body',
                        details: e.message 
                    }), { 
                        status: 400, 
                        headers: { 'Content-Type': 'application/json', ...headers } 
                    });
                }

                // Kiểm tra message có tồn tại không
                if (!body.message) {
                    return new Response(JSON.stringify({ 
                        error: 'Missing message field' 
                    }), { 
                        status: 400, 
                        headers: { 'Content-Type': 'application/json', ...headers } 
                    });
                }

                // Gọi Gemini API
                try {
                    const geminiResponse = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${env.GEMINI_API_KEY}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [{
                                        text: `Bạn là gia sư tiếng Anh cấp 3. Hãy trả lời câu hỏi sau bằng tiếng Việt, giải thích dễ hiểu: ${body.message}`
                                    }]
                                }]
                            })
                        }
                    );

                    const geminiData = await geminiResponse.json();
                    
                    // Kiểm tra response từ Gemini
                    if (!geminiData.candidates || !geminiData.candidates[0]) {
                        return new Response(JSON.stringify({ 
                            error: 'Invalid Gemini response',
                            details: geminiData 
                        }), { 
                            status: 500, 
                            headers: { 'Content-Type': 'application/json', ...headers } 
                        });
                    }

                    const reply = geminiData.candidates[0].content.parts[0].text;

                    return new Response(JSON.stringify({ 
                        response: reply 
                    }), { 
                        headers: { 'Content-Type': 'application/json', ...headers } 
                    });

                } catch (e) {
                    return new Response(JSON.stringify({ 
                        error: 'Gemini API error',
                        details: e.message 
                    }), { 
                        status: 500, 
                        headers: { 'Content-Type': 'application/json', ...headers } 
                    });
                }
            }

            // GENERATE EXERCISE - POST
            if (url.pathname === '/api/generate-exercise') {
                // Đọc body
                let body;
                try {
                    body = await request.json();
                } catch (e) {
                    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
                        status: 400, 
                        headers: { 'Content-Type': 'application/json', ...headers } 
                    });
                }

                const { topic, count = 5 } = body;

                const prompt = `Tạo ${count} câu hỏi trắc nghiệm tiếng Anh về chủ đề "${topic}". 
Mỗi câu có 4 đáp án A, B, C, D. Trả về JSON array.`;

                const geminiResponse = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${env.GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{ text: prompt }]
                            }]
                        })
                    }
                );

                const geminiData = await geminiResponse.json();
                const reply = geminiData.candidates[0].content.parts[0].text;

                return new Response(reply, { 
                    headers: { 'Content-Type': 'application/json', ...headers } 
                });
            }

            // Not found
            return new Response(JSON.stringify({ error: 'Endpoint not found' }), { 
                status: 404, 
                headers: { 'Content-Type': 'application/json', ...headers } 
            });

        } catch (error) {
            return new Response(JSON.stringify({ 
                error: error.message,
                stack: error.stack 
            }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json', ...headers } 
            });
        }
    }
};
