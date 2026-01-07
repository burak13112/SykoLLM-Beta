import { Message } from '../types.ts';

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

// ============================================================================
// 🎨 SYKO VISION (GEMINI 2.5 FLASH IMAGE)
// ============================================================================
export const generateSykoImage = async (modelId: string, prompt: string, referenceImages?: string[]): Promise<{ text: string, images: string[] }> => {
  
  // 🔑 GEMINI API KEY (Google AI Studio)
  const rawKey = process.env.API_KEY4 || ""; 
  const geminiKey = rawKey.trim(); // Boşlukları temizle
  
  if (!geminiKey) {
      throw new Error("API_KEY4 eksik! Görsel üretimi için Google AI Studio anahtarı gerekli.");
  }

  // KULLANICININ İSTEDİĞİ NET MODEL
  const targetModel = "gemini-2.5-flash-image";

  console.log(`[SykoLLM Vision] Model: ${targetModel} ile üretim başlatılıyor...`);

  try {
      // Gemini Görsel Üretim Endpoint'i
      // Not: Bu model generateContent kullanır ama nano serisi olduğu için parametreler hassastır.
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${geminiKey}`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json"
            // CORS hatasını önlemek için gereksiz header eklemiyoruz
          },
          body: JSON.stringify({
              contents: [{
                  parts: [{ text: prompt }]
              }]
              // Config eklemiyoruz, nano modellerde responseMimeType desteklenmez.
          })
      });

      if (!response.ok) {
          const status = response.status;
          const errText = await response.text();
          console.error(`Gemini API Error (${status}):`, errText);
          
          if (status === 404) {
             throw new Error(`Model Bulunamadı (404): '${targetModel}'. Google bu modeli henüz hesabınız için aktif etmemiş olabilir.`);
          }
          if (status === 429) {
             // Rate limit mesajını netleştir
             throw new Error("Google Kotası Doldu (429). Lütfen 1-2 dakika bekleyip tekrar deneyin.");
          }
          if (status === 400) {
              throw new Error("İstek Hatası (400): API Anahtarı veya Prompt formatı geçersiz.");
          }
          throw new Error(`API Hatası (${status}): ${response.statusText}`);
      }

      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const images: string[] = [];
      let textOutput = "";
      
      // Inline Data (Base64) kontrolü - Görseli buradan alıyoruz
      for (const part of parts) {
          if (part.inline_data) {
             images.push(`data:${part.inline_data.mime_type};base64,${part.inline_data.data}`);
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
          // Eğer image yoksa safety filter'a takılmış olabilir
          console.warn("Safety Filter Tetiklenmiş Olabilir:", data);
          throw new Error("Görsel üretilemedi. Prompt 'Güvenlik Filtresi'ne takılmış olabilir veya model şu an görsel üretemiyor.");
      }

  } catch (error: any) {
      console.error("Görsel Üretim Kritik Hata:", error);
      
      // Failed to fetch hatasını yakala ve açıkla
      if (error.name === "TypeError" && error.message === "Failed to fetch") {
          throw new Error("Bağlantı Hatası: 'Failed to fetch'. Bu genellikle Ağ Problemi, AdBlocker veya CORS kaynaklıdır. Lütfen sayfayı yenileyip tekrar deneyin.");
      }
      throw error;
  }
};

// ============================================================================
// 👁️ VISION BRIDGE (Görsel Analiz - Gemini 1.5 Flash)
// ============================================================================
const getVisionDescription = async (imageUrl: string): Promise<string> => {
    try {
        const rawKey = process.env.API_KEY4 || "";
        const geminiKey = rawKey.trim();
        
        if (!geminiKey) return "Vision API Key (API_KEY4) is missing.";

        const { mimeType, data } = extractBase64Data(imageUrl);

        // Vision analiz için Gemini 1.5 Flash (Stabil olan bu)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: "Analyze this image in extreme detail. Describe every object, text, color, layout, and context visible. Be precise." },
                        { inline_data: { mime_type: mimeType, data: data } }
                    ]
                }]
            })
        });

        if (!response.ok) {
            console.error("Gemini Vision API Error:", await response.text());
            return "Image analysis failed via Google Gemini API.";
        }

        const resData = await response.json();
        return resData.candidates?.[0]?.content?.parts?.[0]?.text || "No description generated.";

    } catch (e) {
        console.error(e);
        return "System error during Gemini image analysis.";
    }
};

// ============================================================================
// 🚀 OPENROUTER STREAMING SERVICE (Sohbet Modelleri - DOKUNULMADI)
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

  // Sadece SOHBET modelleri OpenRouter kullanır
  switch (modelId) {
    case 'syko-v2.5':
      openRouterModel = "meta-llama/llama-3.3-70b-instruct:free";
      apiKey = process.env.API_KEY || "";
      systemPrompt = SYSTEM_PROMPTS['syko-v2.5'];
      break;
    
    case 'syko-v3-pro':
      openRouterModel = "mistralai/devstral-2512:free";
      apiKey = process.env.API_KEY1 || process.env.API_KEY || "";
      systemPrompt = SYSTEM_PROMPTS['syko-v3-pro'];
      break;
      
    case 'syko-super-pro':
      openRouterModel = "deepseek/deepseek-r1-0528:free";
      apiKey = process.env.API_KEY2 || process.env.API_KEY || "";
      systemPrompt = SYSTEM_PROMPTS['syko-super-pro'];
      break;
      
    case 'syko-coder':
      openRouterModel = "kwaipilot/kat-coder-pro:free";
      apiKey = process.env.API_KEY3 || process.env.API_KEY || "";
      systemPrompt = SYSTEM_PROMPTS['syko-coder'];
      break;
      
    default:
      openRouterModel = "meta-llama/llama-3.3-70b-instruct:free";
      apiKey = process.env.API_KEY || "";
  }
  
  const lastMsg = history[history.length - 1];
  let finalUserContent = lastMsg.content;
  
  // 🌉 VISION BRIDGE LOGIC (Resimli Sohbet)
  if (images && images.length > 0) {
      console.log(`[SykoLLM System] Vision Bridge Activated using Google Gemini (API_KEY4)...`);
      
      const imageDescription = await getVisionDescription(images[0]);
      
      finalUserContent = `[SYSTEM INSTRUCTION: The user has attached an image. Since you cannot see images directly, an external Google Gemini Vision AI has analyzed it for you. Here is the description of the image:]
      
      --- START OF IMAGE DESCRIPTION ---
      ${imageDescription}
      --- END OF IMAGE DESCRIPTION ---
      
      [USER REQUEST BASED ON THIS IMAGE]:
      ${lastMsg.content}
      `;
  }

  if (!apiKey) throw new Error(`API Anahtarı eksik! (${modelId}). Lütfen .env dosyasını kontrol et.`);

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
        temperature: 0.6,
        include_reasoning: true 
      }),
      signal: signal
    });

    if (!response.ok) {
        if (response.status === 404) throw new Error("Model servisine ulaşılamadı (404).");
        if (response.status === 429) throw new Error("Sunucu çok yoğun (429). Lütfen 10-15 saniye bekleyip tekrar deneyin.");
        throw new Error(`API Error: ${response.status} - ${response.statusText}`);
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

          const reasoningChunk = delta.reasoning; 
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
    throw new Error(error.message || "Bağlantı hatası.");
  }
};