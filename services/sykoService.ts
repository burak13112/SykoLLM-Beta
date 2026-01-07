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
// 🎨 SYKO VISION (IMAGEN 3 POWERED)
// ============================================================================
export const generateSykoImage = async (modelId: string, prompt: string, referenceImages?: string[]): Promise<{ text: string, images: string[] }> => {
  
  // UX Gecikmesi
  await new Promise(resolve => setTimeout(resolve, 500));

  // 🔑 GEMINI API KEY (Google AI Studio)
  const geminiKey = process.env.API_KEY4 || ""; 
  
  if (!geminiKey) {
      throw new Error("API_KEY4 eksik! Görsel üretimi için Google AI Studio anahtarı gerekli.");
  }

  let finalPrompt = prompt;
  
  // 1. PROMPT GÜÇLENDİRME (Prompt Engineering) - Gemini 1.5 Flash (Stabil)
  try {
      // 404 hatasını çözmek için 'gemini-2.0-flash' yerine 'gemini-1.5-flash' kullanıyoruz.
      const enhancementResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              contents: [{
                  parts: [{
                      text: `You are an expert AI Art Director. 
                      Rewrite this user prompt into a concise but highly descriptive prompt suitable for an AI image generator (Imagen 3).
                      Focus on subject, style, lighting, and composition.
                      USER PROMPT: "${prompt}"
                      Output ONLY the raw English prompt. No introductions.`
                  }]
              }]
          })
      });

      if (enhancementResponse.ok) {
          const data = await enhancementResponse.json();
          const enhancedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (enhancedText) {
              console.log("Original Prompt:", prompt);
              console.log("Enhanced Prompt:", enhancedText);
              finalPrompt = enhancedText.trim();
          }
      }
  } catch (e) {
      console.warn("Prompt enhancement failed, using raw prompt.", e);
  }

  // 2. IMAGEN 3 İLE GÖRSEL ÜRETİMİ (Stabil)
  // Gemini 2.5 Flash Image 429 verdiği için Imagen 3.0 kullanıyoruz.
  try {
      // Not: Imagen API yapısı Gemini generateContent'ten farklıdır.
      const imagenResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImages?key=${geminiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              prompt: finalPrompt,
              number_of_images: 1,
              // referenceImages desteği Imagen REST API'da farklı olduğu için şimdilik sadece Text-to-Image
          })
      });

      if (!imagenResponse.ok) {
          const errText = await imagenResponse.text();
          console.error("Imagen API Error:", errText);
          
          // Hata mesajını daha anlaşılır yap
          if (errText.includes("429") || imagenResponse.status === 429) {
             throw new Error("Google Resim Üretme Kotası Doldu (429). Lütfen daha sonra deneyin.");
          }
          throw new Error(`Görsel üretilemedi (${imagenResponse.status}): ${imagenResponse.statusText}`);
      }

      const data = await imagenResponse.json();
      
      // Imagen Base64 döner
      const imageBytes = data.generatedImages?.[0]?.image?.imageBytes;

      if (imageBytes) {
          const generatedImageUrl = `data:image/jpeg;base64,${imageBytes}`;
          return {
              text: `**Syko Vision (Imagen 3)** tarafından oluşturuldu.\n\n*Prompt: ${finalPrompt}*`,
              images: [generatedImageUrl]
          };
      } else {
          throw new Error("Model geçerli bir görsel verisi döndürmedi.");
      }

  } catch (error: any) {
      console.error("Görsel Üretim Hatası:", error);
      throw new Error("Görsel oluşturulamadı: " + error.message);
  }
};

// ============================================================================
// 👁️ VISION BRIDGE (Doğrudan Google Gemini API)
// ============================================================================
const getVisionDescription = async (imageUrl: string): Promise<string> => {
    try {
        // 🔑 GEMINI API KEY (Google AI Studio)
        const geminiKey = process.env.API_KEY4 || "";
        
        if (!geminiKey) return "Vision API Key (API_KEY4) is missing.";

        const { mimeType, data } = extractBase64Data(imageUrl);

        // 404 hatasını çözmek için 'gemini-2.0-flash' yerine 'gemini-1.5-flash' kullanıyoruz.
        // Gemini 1.5 Flash Vision konusunda çok yetenekli ve stabildir.
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
// 🚀 OPENROUTER STREAMING SERVICE (Sohbet Modelleri)
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
  let useVisionBridge = false;

  // 🌉 VISION BRIDGE LOGIC (Resimli Sohbet)
  // Eğer kullanıcı resim attıysa, model ne olursa olsun resmi GEMINI (API_KEY4) ile okuyoruz.
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

      useVisionBridge = true;
  }

  if (!apiKey) throw new Error(`API Anahtarı eksik! (${modelId}). Lütfen .env dosyasını kontrol et.`);

  const messages: any[] = [{ role: "system", content: systemPrompt }];

  for (let i = 0; i < history.length - 1; i++) {
    messages.push({
      role: history[i].role === 'model' ? 'assistant' : 'user',
      content: history[i].content
    });
  }

  // Vision Bridge kullanılıyorsa, dönüştürülmüş metni yolla.
  // Kullanılmıyorsa (resim yoksa) normal metni yolla.
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