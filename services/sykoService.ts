import { Message } from '../types.ts';

// ============================================================================
// 🧠 SYKO PERSONA AYARLARI
// ============================================================================

const SHARED_THINKING_PROTOCOL = `
    CRITICAL INSTRUCTION:
    1. You are a Deep Reasoning Model.
    2. You MUST think before answering.
    3. YOUR THOUGHT PROCESS MUST BE ENCLOSED IN <think> AND </think> TAGS.
    4. The <think> block must come BEFORE your final answer.
    5. DO NOT output the thought process as plain text. It MUST be tagged.
    6. Example: <think>I need to calculate the result...</think> Here is the answer.
`;

const NATURAL_LANGUAGE_PROTOCOL = `
    🗣️ TONE & STYLE GUIDE:
    1. **BE NATURAL:** Speak like a smart, cool human friend. Avoid academic, robotic, or overly formal language.
    2. **KEEP IT SIMPLE:** Use daily life language. Be concise and direct.
    3. **NO REPETITION:** DO NOT constantly say "As SykoLLM" or "SykoLLM-PRO here". Just answer the question.
    4. **NO FILLERS:** Avoid starting with "Sure!", "Here is the answer", "I can help with that". Dive straight into the value.
    5. **LANGUAGE:** Strictly stick to English or Turkish based on the user's input.
`;

const SYSTEM_PROMPTS: Record<string, string> = {
  'syko-v2.5': `
    You are SykoLLM V2.5 (powered by Llama 3.3).
    Identity: A helpful, quick-witted AI companion.
    ${NATURAL_LANGUAGE_PROTOCOL}
  `,
  'syko-v3-pro': `
    You are SykoLLM PRO (powered by Xiaomi Mimo).
    Identity: A highly intelligent, balanced AI entity.
    ${NATURAL_LANGUAGE_PROTOCOL}
    ${SHARED_THINKING_PROTOCOL}
  `,
  'syko-super-pro': `
    You are SykoLLM SUPER PRO (powered by DeepSeek R1).
    Identity: The most advanced, deep-reasoning AI entity in the system.
    ${NATURAL_LANGUAGE_PROTOCOL}
    ${SHARED_THINKING_PROTOCOL}
  `,
  'syko-coder': `
    You are SykoLLM Coder (powered by Qwen Coder).
    Identity: An expert software engineer and debugger.
    ${NATURAL_LANGUAGE_PROTOCOL}
    ${SHARED_THINKING_PROTOCOL}
    Note: Plan your code architecture inside <think> tags first.
  `
};

export const generateSykoImage = async (modelId: string, prompt: string, referenceImages?: string[]): Promise<{ text: string, images: string[] }> => {
  throw new Error("Görsel üretim servisi bakım modundadır. Lütfen Chat modunu kullanın.");
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
      openRouterModel = "xiaomi/mimo-v2-flash:free";
      apiKey = process.env.API_KEY1 || "";
      systemPrompt = SYSTEM_PROMPTS['syko-v3-pro'];
      break;
    case 'syko-super-pro':
      openRouterModel = "deepseek/deepseek-r1:free"; // Güncel model ID
      apiKey = process.env.API_KEY2 || "";
      systemPrompt = SYSTEM_PROMPTS['syko-super-pro'];
      break;
    case 'syko-coder':
      openRouterModel = "qwen/qwen-2.5-coder-32b-instruct:free";
      apiKey = process.env.API_KEY3 || "";
      systemPrompt = SYSTEM_PROMPTS['syko-coder'];
      break;
    default:
      throw new Error("Geçersiz Model ID");
  }

  if (!apiKey) throw new Error(`API Anahtarı eksik! (${modelId})`);

  const messages: any[] = [{ role: "system", content: systemPrompt }];

  for (let i = 0; i < history.length - 1; i++) {
    messages.push({
      role: history[i].role === 'model' ? 'assistant' : 'user',
      content: history[i].content
    });
  }

  const lastMsg = history[history.length - 1];
  
  if (images && images.length > 0) {
    const contentArray: any[] = [{ type: "text", text: lastMsg.content }];
    images.forEach(img => contentArray.push({ type: "image_url", image_url: { url: img } }));
    messages.push({ role: "user", content: contentArray });
  } else {
    messages.push({ role: "user", content: lastMsg.content });
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
        include_reasoning: true 
      }),
      signal: signal
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    if (!response.body) throw new Error("Empty response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    
    let fullText = "";
    let buffer = "";
    
    // Reasoning State Management
    let hasStartedThinking = false;
    let hasFinishedThinking = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") continue;

        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta;
          
          if (!delta) continue;

          // 1. Düşünce Akışı (Reasoning Field)
          // OpenRouter DeepSeek R1 gibi modeller bazen buraya yazar.
          const reasoningChunk = delta.reasoning; 
          
          if (reasoningChunk) {
            if (!hasStartedThinking) {
               // API'den reasoning kanalı geliyorsa biz elle etiket ekliyoruz
               onChunk("<think>");
               fullText += "<think>";
               hasStartedThinking = true;
            }
            onChunk(reasoningChunk);
            fullText += reasoningChunk;
            continue; 
          }

          // 2. Normal İçerik (Content Field)
          const contentChunk = delta.content || "";
          
          if (contentChunk) {
            // Eğer API reasoning kanalını kullandıysa ve şimdi content'e geçtiyse etiketi kapat
            if (hasStartedThinking && !hasFinishedThinking) {
                onChunk("</think>");
                fullText += "</think>";
                hasFinishedThinking = true;
            }

            // Eğer API reasoning kanalı YERİNE content içinde <think> gönderiyorsa (Bazı modeller böyle yapar)
            // Bu durumda parser'ın kafası karışmasın, direkt akıtalım.
            // Arka plandaki ChatMessage bileşeni zaten <think> tagini görünce parse edecek.
            
            onChunk(contentChunk);
            fullText += contentChunk;
          }

        } catch (e) { }
      }
    }
    
    // Döngü bittiğinde hala düşünce açıksa kapat (Güvenlik önlemi)
    if (hasStartedThinking && !hasFinishedThinking) {
        onChunk("</think>");
        fullText += "</think>";
    }

    return fullText;

  } catch (error: any) {
    if (error.name === 'AbortError') return "[ABORTED]";
    throw new Error(error.message || "Bağlantı hatası.");
  }
};