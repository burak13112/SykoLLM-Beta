import { Message } from '../types.ts';

// ============================================================================
// 🧠 SYKO PERSONA AYARLARI
// ============================================================================

const SHARED_THINKING_PROTOCOL = `
    INSTRUCTIONS FOR REASONING:
    1. You are a Deep Reasoning Engine.
    2. BEFORE answering, you MUST start with a <think> block.
    3. Inside <think>, write out your step-by-step logic, analysis, and planning.
    4. Close the tag with </think> and THEN provide the final response.
    5. THIS IS MANDATORY. NO EXCEPTIONS.
`;

const NATURAL_LANGUAGE_PROTOCOL = `
    🗣️ TONE & STYLE:
    - Be cool, direct, and concise.
    - No robotic intros like "Here is the answer".
`;

const SYSTEM_PROMPTS: Record<string, string> = {
  'syko-v2.5': `
    You are SykoLLM V2.5. Helpful, fast, witty.
    ${NATURAL_LANGUAGE_PROTOCOL}
  `,
  'syko-v3-pro': `
    You are SykoLLM PRO. Intelligent and balanced.
    ${SHARED_THINKING_PROTOCOL}
    ${NATURAL_LANGUAGE_PROTOCOL}
  `,
  'syko-super-pro': `
    You are SykoLLM SUPER PRO. The most advanced reasoning model.
    ${SHARED_THINKING_PROTOCOL}
    ${NATURAL_LANGUAGE_PROTOCOL}
  `,
  'syko-coder': `
    You are SykoLLM Coder. Expert software engineer.
    ${SHARED_THINKING_PROTOCOL}
    ${NATURAL_LANGUAGE_PROTOCOL}
    Plan code architecture inside <think> first.
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

  // Model ID ve Key eşleştirmeleri
  switch (modelId) {
    case 'syko-v2.5':
      openRouterModel = "meta-llama/llama-3.3-70b-instruct:free";
      apiKey = process.env.API_KEY || "";
      systemPrompt = SYSTEM_PROMPTS['syko-v2.5'];
      break;
    case 'syko-v3-pro':
      openRouterModel = "xiaomi/mimo-v2-flash:free"; // Veya alternatif akıllı model
      apiKey = process.env.API_KEY1 || "";
      systemPrompt = SYSTEM_PROMPTS['syko-v3-pro'];
      break;
    case 'syko-super-pro':
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

  // 💉 FEW-SHOT INJECTION:
  // Eğer model düşünen model ise (V2.5 hariç), ona sahte bir geçmiş veriyoruz.
  // Bu sayede model "aa ben böyle konuşuyormuşum" diyip taklit ediyor.
  if (modelId !== 'syko-v2.5') {
      messages.push({ 
          role: "user", 
          content: "What is 2+2?" 
      });
      messages.push({ 
          role: "assistant", 
          content: "<think>\nThe user is asking a basic arithmetic question. I need to sum the two integers.\n1. Identify inputs: 2 and 2.\n2. Perform addition: 2 + 2 = 4.\n3. Verify result.\n</think>\nThe answer is 4." 
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

  // 💉 HARD ENFORCEMENT: Son kullanıcı mesajına da not düşüyoruz.
  if (modelId !== 'syko-v2.5') {
      finalUserContent += `\n\n(IMPORTANT: Start your response with <think> tag. Output your internal reasoning, then close with </think>, then give the answer.)`;
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
        include_reasoning: true // DeepSeek R1 için native support varsa
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

          // 1. Native Reasoning (DeepSeek R1 özel alanı)
          const reasoningChunk = delta.reasoning; 
          
          if (reasoningChunk) {
            if (!hasStartedThinking) {
               onChunk("<think>");
               fullText += "<think>";
               hasStartedThinking = true;
            }
            onChunk(reasoningChunk);
            fullText += reasoningChunk;
            continue; 
          }

          // 2. Normal Content
          const contentChunk = delta.content || "";
          
          if (contentChunk) {
            if (hasStartedThinking && !hasFinishedThinking) {
                onChunk("</think>");
                fullText += "</think>";
                hasFinishedThinking = true;
            }
            
            // Eğer model native reasoning KULLANMIYOR ama bizim zorlamamızla
            // text'in içine <think> yazıyorsa, onu olduğu gibi basıyoruz.
            // Frontend'deki ChatMessage bileşeni bunu parse edecek.
            onChunk(contentChunk);
            fullText += contentChunk;
          }

        } catch (e) { }
      }
    }
    
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