export default {
    async fetch(request, env) {
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, {headers});
        }

        try {
            const url = new URL(request.url);
            const body = await request.json();

            if (url.pathname === '/api/chat') {
                const response = await callGemini(`Bạn là gia sư tiếng Anh. Hãy trả lời câu hỏi sau: ${body.message}`, env.GEMINI_API_KEY);
                return new Response(JSON.stringify({response}), {headers});
            }

            if (url.pathname === '/api/generate-exercise') {
                const response = await callGemini(`Tạo 3 câu hỏi trắc nghiệm tiếng Anh về chủ đề "${body.topic}". Mỗi câu có 4 đáp án.`, env.GEMINI_API_KEY);
                return new Response(JSON.stringify({response}), {headers});
            }

            if (url.pathname === '/api/generate-exam') {
                const response = await callGemini(`Tạo đề thi ${body.type} tiếng Anh với 5 câu hỏi trắc nghiệm.`, env.GEMINI_API_KEY);
                return new Response(JSON.stringify({response}), {headers});
            }

            return new Response('Not Found', {status: 404, headers});
        } catch (error) {
            return new Response(JSON.stringify({error: error.message}), {status: 500, headers});
        }
    }
};

async function callGemini(prompt, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            contents: [{
                parts: [{text: prompt}]
            }]
        })
    });
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}
