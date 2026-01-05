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
      // DeepSeek R1 native reasoning kullanır
      openRouterModel = "deepseek/deepseek-r1:free"; 
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

  // 💉 FEW-SHOT INJECTION SADECE ZORLAMA MODELLER İÇİN
  // DeepSeek R1 (Super Pro) için bunu yapmıyoruz, kafası karışıyor.
  // Sadece V3 Pro ve Coder gibi "sonradan akıllanan" modellere örnek veriyoruz.
  if (modelId === 'syko-v3-pro' || modelId === 'syko-coder') {
      messages.push({ 
          role: "user", 
          content: "Hello" 
      });
      messages.push({ 
          role: "assistant", 
          content: "<think>\nThe user is greeting me. I should respond politely and wait for their request.\n</think>\nHello! How can I help you today?" 
      });
  }

  // Geçmiş mesajları ekle
  for (let i = 0; i < history.length - 1; i++) {
    messages.push({
      role: history[i].role === 'model' ? 'assistant' : 'user',
      content: history[i].content
    });
  }

  const lastMsg = history[history.length - 1];
  let finalUserContent = lastMsg.content;

  // Sadece zorlama gereken modellere not düşüyoruz.
  if (modelId === 'syko-v3-pro' || modelId === 'syko-coder') {
      finalUserContent += `\n\n(Remember: You MUST start with <think> tag and explain your logic first.)`;
  }
  
  if (images && images.length > 0) {
    const contentArray: any[] = [{ type: "text", text: finalUserContent }];
    images.forEach(img => contentArray.push({ type: "image_url", image_url: { url: img } }));
    messages.push({ role: "user", content: contentArray });
  } else {
    messages.push({ role: "user", content: finalUserContent });
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
        include_reasoning: true // Bu flag DeepSeek R1 için kritiktir.
      }),
      signal: signal
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
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

          // 1. NATIVE REASONING (DeepSeek R1 / Super Pro)
          // Bu kısım "include_reasoning: true" sayesinde gelir.
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
            // Eğer reasoning kanalından geliyorduysa ve bittiyse kapat
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
    throw new Error(error.message || "Bağlantı hatası.");
  }
};