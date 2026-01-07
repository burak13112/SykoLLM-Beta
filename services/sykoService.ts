import { Message } from '../types.ts';

// ============================================================================
// 🧠 SYKO PERSONA AYARLARI
// ============================================================================

// Sadece 'Zorlama Düşünme' gerektiren modeller için (V3 Pro, Coder)
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
  
  // DeepSeek R1 için System Prompt sade olmalı, model zaten ne yapacağını biliyor.
  'syko-super-pro': `You are SykoLLM SUPER PRO (DeepSeek R1). You are a deep reasoning engine. Output your thought process naturally.`,
  
  'syko-coder': `You are SykoLLM Coder. Expert developer. ${SYNTHETIC_THINKING_PROMPT}`
};

// ============================================================================
// 🎨 SYKO VISION (IMAGE GENERATION & REMIX) SERVICE
// ============================================================================
export const generateSykoImage = async (modelId: string, prompt: string, referenceImages?: string[]): Promise<{ text: string, images: string[] }> => {
  
  // UX Gecikmesi
  await new Promise(resolve => setTimeout(resolve, 1000));

  let finalPrompt = prompt;
  let responseText = `Generated visual asset based on: "${prompt}"`;

  // 🖼️ IMAGE-TO-IMAGE (REMIX) MANTIĞI
  if (referenceImages && referenceImages.length > 0) {
     try {
        const apiKey = process.env.API_KEY1 || process.env.API_KEY || "";
        const remixResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": window.location.href,
              "X-Title": "SykoLLM Web Remix"
            },
            body: JSON.stringify({
              model: "mistralai/devstral-2512:free",
              messages: [
                {
                  role: "user",
                  content: [
                    { 
                      type: "text", 
                      text: `I want to generate a new image based on this image. 
                      Describe this image in extreme visual detail (colors, composition, subject). 
                      Then, apply this modification request to the description: "${prompt}".
                      Output ONLY the final detailed prompt for an image generator (like Flux/Midjourney). Do not add any conversational text.` 
                    },
                    { type: "image_url", image_url: { url: referenceImages[0] } }
                  ]
                }
              ]
            })
        });

        if (remixResponse.ok) {
            const data = await remixResponse.json();
            const enhancedPrompt = data.choices?.[0]?.message?.content;
            if (enhancedPrompt) {
                finalPrompt = enhancedPrompt;
                responseText = `Remixed visual asset based on reference and: "${prompt}"`;
            }
        }
     } catch (e) {
         console.warn("Remix enhancement failed, falling back to raw prompt.");
     }
  }

  // Prompt'u URL için hazırla
  const encodedPrompt = encodeURIComponent(finalPrompt + " high quality, detailed, masterpiece, cinematic lighting, 8k");
  const randomSeed = Math.floor(Math.random() * 100000);
  
  // Pollinations Flux Model URL
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&seed=${randomSeed}&nologo=true`;

  return {
    text: responseText,
    images: [imageUrl]
  };
};

// ============================================================================
// 👁️ VISION BRIDGE (The "Sneaky" Image Analyst)
// ============================================================================
// Bu fonksiyon görseli alır, Gemini'ye okutur ve detaylı bir metin betimlemesi döndürür.
const getVisionDescription = async (imageUrl: string): Promise<string> => {
    try {
        const apiKey = process.env.API_KEY1 || process.env.API_KEY || "";
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.href,
                "X-Title": "SykoLLM Vision Bridge"
            },
            body: JSON.stringify({
                model: "google/gemma-3-27b-it:free", // En güçlü vision modeli
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Analyze this image in extreme detail. Describe every object, text, color, layout, and context visible. Output ONLY the description, nothing else." },
                            { type: "image_url", image_url: { url: imageUrl } }
                        ]
                    }
                ]
            })
        });

        if (!response.ok) return "Image analysis failed due to server load.";
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "No description generated.";
    } catch (e) {
        return "System error during image analysis.";
    }
};

// ============================================================================
// 🚀 OPENROUTER STREAMING SERVICE (PURE FETCH)
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

  // Model ID Eşleştirmeleri
  switch (modelId) {
    case 'syko-v2.5':
      openRouterModel = "meta-llama/llama-3.3-70b-instruct:free";
      apiKey = process.env.API_KEY || "";
      systemPrompt = SYSTEM_PROMPTS['syko-v2.5'];
      break;
    
    case 'syko-v3-pro':
      // Bu model zaten native vision destekler (Gemini backend)
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

  // 🌉 VISION BRIDGE LOGIC (Sinsice araya girme)
  // Eğer resim varsa VE seçili model native vision desteklemiyorsa (yani Llama, DeepSeek, Qwen ise)
  if (images && images.length > 0) {
      if (modelId === 'syko-v2.5' || modelId === 'syko-super-pro' || modelId === 'syko-coder') {
          console.log(`[SykoLLM System] Vision Bridge Activated for ${modelId}. Analyzing image first...`);
          
          // Kullanıcıya bilgi ver (Thinking gibi görünecek ama aslında resim analiz ediyoruz)
          // onChunk("<think>\nAnalyzing the provided image using Syko Vision Bridge...\n");

          // 1. Resmi Gemini'ye analiz ettir
          const imageDescription = await getVisionDescription(images[0]);
          
          // onChunk("Image analysis complete. Processing request with chosen model...\n</think>\n");

          // 2. Prompt'u manipüle et (Prompt Injection)
          // Asıl modele resmi değil, resmin metnini gönderiyoruz.
          finalUserContent = `[SYSTEM INSTRUCTION: The user has attached an image. Since you cannot see images directly, an external Vision AI has analyzed it for you. Here is the description of the image:]
          
          --- START OF IMAGE DESCRIPTION ---
          ${imageDescription}
          --- END OF IMAGE DESCRIPTION ---
          
          [USER REQUEST BASED ON THIS IMAGE]:
          ${lastMsg.content}
          `;

          // 3. Bridge modunu aktifleştir (Resim verisini API çağrısından sildirir)
          useVisionBridge = true;
      }
  }

  if (!apiKey) throw new Error(`API Anahtarı eksik! (${modelId}). Lütfen .env dosyasını kontrol et.`);

  const messages: any[] = [{ role: "system", content: systemPrompt }];

  // Geçmiş mesajları ekle
  for (let i = 0; i < history.length - 1; i++) {
    messages.push({
      role: history[i].role === 'model' ? 'assistant' : 'user',
      content: history[i].content
    });
  }

  // Mesaj payload'ını hazırla
  if (images && images.length > 0 && !useVisionBridge) {
    // Native Vision Destekleyen Modeller (Gemini - V3 Pro)
    // Resmi doğrudan yolla
    const contentArray: any[] = [{ type: "text", text: finalUserContent }];
    images.forEach(img => contentArray.push({ type: "image_url", image_url: { url: img } }));
    messages.push({ role: "user", content: contentArray });
  } else {
    // Text-Only Modeller (DeepSeek, Llama, Qwen)
    // Vision Bridge sayesinde resim metne dönüştü, artık sadece text yolluyoruz.
    // Böylece 400 hatası almıyoruz.
    messages.push({ role: "user", content: finalUserContent });
  }

  // FEW-SHOT INJECTION for Coder
  if (modelId === 'syko-coder' && !finalUserContent.includes("SYSTEM INSTRUCTION")) {
       // ... coder specific logic (isteğe bağlı, bridge durumunda gerek yok)
  }

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
        include_reasoning: true // DeepSeek R1 için kritik
      }),
      signal: signal
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.error("OpenRouter API Error:", errorData);
        if (response.status === 404) {
            throw new Error("Model servisine ulaşılamadı (404).");
        }
        if (response.status === 429) {
             throw new Error("Sunucu çok yoğun (429). Lütfen 10-15 saniye bekleyip tekrar deneyin.");
        }
        throw new Error(`API Error: ${response.status} - ${response.statusText}`);
    }
    if (!response.body) throw new Error("Empty response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    
    // Reasoning State Management
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

          // 1. NATIVE REASONING (DeepSeek R1)
          const reasoningChunk = delta.reasoning; 
          
          if (reasoningChunk) {
            if (!hasStartedThinking) {
               onChunk("<think>");
               hasStartedThinking = true;
            }
            onChunk(reasoningChunk);
            continue; 
          }

          // 2. NORMAL CONTENT
          const contentChunk = delta.content || "";
          
          if (contentChunk) {
            if (hasStartedThinking && !hasFinishedThinking) {
                onChunk("</think>");
                hasFinishedThinking = true;
            }
            onChunk(contentChunk);
          }

        } catch (e) { }
      }
    }
    
    if (hasStartedThinking && !hasFinishedThinking) {
        onChunk("</think>");
    }

    return "DONE";

  } catch (error: any) {
    if (error.name === 'AbortError') return "[ABORTED]";
    console.error("Stream Error:", error);
    throw new Error(error.message || "Bağlantı hatası.");
  }
};
