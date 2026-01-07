import { Message } from '../types';

// ============================================================================
// 🧠 SYKO PERSONA AYARLARI
// ============================================================================

const SYNTHETIC_THINKING_PROMPT = `
[IMPORTANT INSTRUCTION]
You are a Deep Reasoning AI.
Before answering, you MUST start a structured thought process block.
1. Start with <think>.
2. Break down the user's request logically.
3. Plan your response step-by-step.
4. End with </think>.
5. Finally, provide the answer.
DO NOT put conversational filler inside the think block. Only logic.
`;

const SYSTEM_PROMPTS: Record<string, string> = {
  'syko-v2.5': `You are SykoLLM V2.5. Helpful, fast, witty companion. Speak naturally.`,
  'syko-v3-pro': `You are SykoLLM PRO. Intelligent and balanced. ${SYNTHETIC_THINKING_PROMPT}`,
  'syko-super-pro': `You are SykoLLM SUPER PRO (DeepSeek R1). You are a deep reasoning engine. Output your thought process naturally.`,
  'syko-coder': `You are SykoLLM Coder. Expert developer. ${SYNTHETIC_THINKING_PROMPT}`
};

// 🛠️ YARDIMCI FONKSİYON: Base64 Temizleyici
const extractBase64Data = (dataUrl: string) => {
  const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return { mimeType: 'image/jpeg', data: '' };
  }
  return { mimeType: matches[1], data: matches[2] };
};

// 🛠️ YARDIMCI FONKSİYON: Retry Mechanism (429 Hataları için)
const fetchWithRetry = async (url: string, options: any, retries = 3, backoff = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      
      // Eğer başarılıysa veya retry gerektirmeyen bir hataysa (örn: 400 Bad Request) direkt dön
      if (response.ok || (response.status !== 429 && response.status !== 503)) {
        return response;
      }

      // Eğer 429 (Kota) veya 503 (Sunucu hatası) ise bekle
      console.warn(`SykoLLM API Busy (Attempt ${i + 1}/${retries}). Retrying in ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      backoff *= 2; // Süreyi katla (Exponential Backoff)
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
  throw new Error("Maksimum deneme sayısına ulaşıldı. Google servisleri şu an yanıt vermiyor.");
};

// ============================================================================
// 🎨 SYKO VISION (GEMINI 2.5 FLASH IMAGE)
// ============================================================================
export const generateSykoImage = async (modelId: string, prompt: string, referenceImages?: string[]): Promise<{ text: string, images: string[] }> => {
  
  // 🔑 GEMINI API KEY
  const rawKey = process.env.API_KEY4 || process.env.API_KEY || ""; 
  const geminiKey = rawKey.trim();
  
  if (!geminiKey) {
      throw new Error("API_KEY eksik! Görsel üretimi için Google AI Studio anahtarı gerekli.");
  }

  // Google'ın önerdiği görsel üretim modeli
  const targetModel = "gemini-2.5-flash-image";

  console.log(`[SykoLLM Vision] Model: ${targetModel} | Prompt: ${prompt.slice(0, 20)}...`);

  try {
      const response = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              contents: [{
                  parts: [{ text: prompt }]
              }],
              // Nano modeller için generationConfig kısıtlıdır, responseMimeType eklemiyoruz.
          })
        }
      );

      if (!response.ok) {
          const status = response.status;
          const errText = await response.text();
          console.error(`Gemini API Error (${status}):`, errText);
          
          if (status === 404) throw new Error(`Model Bulunamadı: '${targetModel}'. API Key'inizin bu modele erişimi olmayabilir.`);
          if (status === 429) throw new Error("Google Kota Sınırı (429). Sistem şu an çok yoğun, lütfen 30 saniye sonra tekrar deneyin.");
          throw new Error(`API Hatası (${status})`);
      }

      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const images: string[] = [];
      let textOutput = "";
      
      for (const part of parts) {
          // REST API returns snake_case (inline_data), SDK usually camelCase. We check both.
          const inlineData = part.inline_data || part.inlineData;
          
          if (inlineData) {
             images.push(`data:${inlineData.mime_type || inlineData.mimeType};base64,${inlineData.data}`);
          } else if (part.text) {
             textOutput += part.text;
          }
      }

      if (images.length > 0) {
          return {
              text: textOutput || `**${targetModel}** tarafından oluşturuldu.`,
              images: images
          };
      } else {
          // Eğer image yoksa ama text varsa, model reddetmiş olabilir
          if (textOutput) {
            throw new Error(`Model görsel üretemedi, sadece metin döndü: "${textOutput}"`);
          }
          throw new Error("Görsel üretilemedi. Güvenlik filtresi (Safety Settings) devreye girmiş olabilir.");
      }

  } catch (error: any) {
      console.error("Görsel Üretim Hatası:", error);
      throw error;
  }
};

// ============================================================================
// 👁️ VISION BRIDGE (Görsel Analiz)
// ============================================================================
const getVisionDescription = async (imageUrl: string): Promise<string> => {
    try {
        const rawKey = process.env.API_KEY4 || process.env.API_KEY || "";
        const geminiKey = rawKey.trim();
        
        if (!geminiKey) return "Vision API Key is missing.";

        const { mimeType, data } = extractBase64Data(imageUrl);

        // Vision analiz için Gemini 2.0 Flash (Hızlı ve multimodal)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: "Analyze this image in technical detail for a hacker database." },
                        { inline_data: { mime_type: mimeType, data: data } }
                    ]
                }]
            })
        });

        if (!response.ok) return "Image analysis unavailable.";

        const resData = await response.json();
        return resData.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis data.";

    } catch (e) {
        return "System error during analysis.";
    }
};

// ============================================================================
// 🚀 OPENROUTER STREAMING SERVICE
// ============================================================================

export const streamResponse = async (
  modelId: string, 
  history: Message[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  images?: string[] 
): Promise<string> => {

  let openRouterModel = "";
  let apiKey = "";
  let systemPrompt = SYSTEM_PROMPTS['syko-v2.5'];

  switch (modelId) {
    case 'syko-v2.5':
      openRouterModel = "meta-llama/llama-3.3-70b-instruct:free";
      apiKey = process.env.API_KEY || "";
      systemPrompt = SYSTEM_PROMPTS['syko-v2.5'];
      break;
    
    case 'syko-v3-pro':
      openRouterModel = "mistralai/mistral-large-2402"; // Fallback to a stable model if needed
      apiKey = process.env.API_KEY1 || process.env.API_KEY || "";
      systemPrompt = SYSTEM_PROMPTS['syko-v3-pro'];
      break;
      
    case 'syko-super-pro':
      openRouterModel = "deepseek/deepseek-r1:free";
      apiKey = process.env.API_KEY2 || process.env.API_KEY || "";
      systemPrompt = SYSTEM_PROMPTS['syko-super-pro'];
      break;
      
    case 'syko-coder':
      openRouterModel = "meta-llama/llama-3-70b-instruct";
      apiKey = process.env.API_KEY3 || process.env.API_KEY || "";
      systemPrompt = SYSTEM_PROMPTS['syko-coder'];
      break;
      
    default:
      openRouterModel = "meta-llama/llama-3.3-70b-instruct:free";
      apiKey = process.env.API_KEY || "";
  }
  
  const lastMsg = history[history.length - 1];
  let finalUserContent = lastMsg.content;
  
  if (images && images.length > 0) {
      const imageDescription = await getVisionDescription(images[0]);
      finalUserContent = `[SYSTEM: User uploaded an image. Analysis: ${imageDescription}]\n\nUser Question: ${lastMsg.content}`;
  }

  if (!apiKey) throw new Error(`API Anahtarı eksik! (${modelId}).`);

  const messages: any[] = [{ role: "system", content: systemPrompt }];

  for (let i = 0; i < history.length - 1; i++) {
    messages.push({
      role: history[i].role === 'model' ? 'assistant' : 'user',
      content: history[i].content
    });
  }

  messages.push({ role: "user", content: finalUserContent });

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.href,
        "X-Title": "SykoLLM Web"
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages: messages,
        stream: true,
        temperature: 0.7
      }),
      signal: signal
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }
    if (!response.body) throw new Error("Empty response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    
    let hasStartedThinking = false;
    let hasFinishedThinking = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkStr = decoder.decode(value, { stream: true });
      const lines = chunkStr.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") continue;

        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;

          // DeepSeek reason handling
          const reasoningChunk = (delta as any).reasoning; 
          if (reasoningChunk) {
            if (!hasStartedThinking) { onChunk("<think>"); hasStartedThinking = true; }
            onChunk(reasoningChunk);
            continue; 
          }

          const contentChunk = delta.content || "";
          if (contentChunk) {
            if (hasStartedThinking && !hasFinishedThinking) { onChunk("</think>"); hasFinishedThinking = true; }
            onChunk(contentChunk);
          }
        } catch (e) { }
      }
    }
    
    if (hasStartedThinking && !hasFinishedThinking) onChunk("</think>");

    return "DONE";

  } catch (error: any) {
    if (error.name === 'AbortError') return "[ABORTED]";
    console.error("Stream Error:", error);
    throw error;
  }
};