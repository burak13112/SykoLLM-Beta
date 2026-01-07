import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../types.ts';
import { Icons } from './Icon';

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const [isExpanded, setIsExpanded] = useState(true); 
  
  // Parsing Logic - GÜÇLENDİRİLMİŞ DEFANSİF KOD
  const parseContent = (rawContent: string) => {
    // Eğer içerik null, undefined veya boş ise çökmemesi için default değerler dön
    if (!rawContent) {
        return { hasThought: false, thought: "", content: "", isThinking: false };
    }

    let thought = "";
    let content = rawContent;
    let hasThought = false;
    let isThinking = false;

    const startTag = "<think>";
    const endTag = "</think>";

    try {
        if (rawContent.includes(startTag)) {
          hasThought = true;
          const startIndex = rawContent.indexOf(startTag) + startTag.length;
          
          if (rawContent.includes(endTag)) {
            // Düşünce tamamlanmış
            const endIndex = rawContent.indexOf(endTag);
            thought = rawContent.substring(startIndex, endIndex).trim();
            content = rawContent.substring(endIndex + endTag.length).trim();
            isThinking = false;
          } else {
            // Düşünce hala akıyor (Streaming)
            thought = rawContent.substring(startIndex).trim();
            content = ""; // Henüz cevap yok, sadece düşünüyor
            isThinking = true;
          }
        }
    } catch (e) {
        // Parsing sırasında beklenmedik bir hata olursa raw içeriği göster, çökme.
        console.error("Message parsing error:", e);
        content = rawContent;
    }

    return { hasThought, thought, content, isThinking };
  };

  const { hasThought, thought, content, isThinking } = parseContent(message.content);

  // Streaming sırasında düşünce varsa kutuyu otomatik açık tut
  useEffect(() => {
    if (isThinking) {
        setIsExpanded(true);
    }
  }, [isThinking]);

  // Eğer kullanıcı mesajıysa direkt render et
  if (isUser) {
    return (
        <div className="w-full animate-slide-up bg-transparent">
            <div className="max-w-3xl mx-auto py-8 px-4 md:px-6 flex gap-4 md:gap-6">
                <div className="shrink-0 w-8 h-8 rounded-lg bg-black text-white dark:bg-white dark:text-black flex items-center justify-center">
                    <Icons.Terminal size={16} />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                    <div className="font-bold text-sm tracking-wide">YOU</div>
                    {message.images && message.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                        {message.images.map((img, i) => (
                            <img key={i} src={img} className="max-h-64 rounded-xl border border-black/10 dark:border-white/10" />
                        ))}
                        </div>
                    )}
                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none leading-relaxed whitespace-pre-wrap">
                        {message.content}
                    </div>
                </div>
            </div>
        </div>
    );
  }

  // Model mesajı için özel render
  return (
    <div className="w-full animate-slide-up bg-black/5 dark:bg-white/5 border-y border-black/5 dark:border-white/5">
      <div className="max-w-3xl mx-auto py-8 px-4 md:px-6 flex gap-4 md:gap-6">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-gray-700 to-black text-white dark:from-gray-200 dark:to-white dark:text-black flex items-center justify-center">
          <Icons.Cpu size={16} />
        </div>

        <div className="flex-1 min-w-0 space-y-2 overflow-hidden">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm tracking-wide">SYKO LLM</span>
            <span className="text-[10px] bg-red-600 text-white px-1 rounded font-bold uppercase">ALPHA</span>
          </div>
          
          {/* THINKING MODULE */}
          {hasThought && (
            <div className="mb-6 mt-2">
              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest opacity-80 hover:opacity-100 transition-opacity select-none group w-full"
              >
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                   {isExpanded ? <Icons.ChevronDown size={14} /> : <Icons.ChevronRight size={14} />}
                   <Icons.Brain size={14} className={isThinking ? "animate-pulse" : ""} />
                </div>
                <span className={`font-bold ${isThinking ? "animate-pulse text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-300"}`}>
                  {isThinking ? "GENERATING THOUGHT PROCESS..." : "THOUGHT PROCESS"}
                </span>
                {!isThinking && <div className="h-px bg-black/10 dark:bg-white/10 flex-1 ml-2"></div>}
              </button>
              
              {(isExpanded || isThinking) && (
                <div className="mt-2 pl-4 ml-1.5 border-l-2 border-indigo-500/20 dark:border-indigo-500/30 animate-fade-in">
                  <div className="text-xs md:text-sm font-mono text-gray-800 dark:text-gray-300 leading-relaxed break-words whitespace-pre-wrap bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-r-lg rounded-bl-lg border border-indigo-100 dark:border-indigo-500/10">
                    {thought || <span className="opacity-50 animate-pulse">Initializing logic cores...</span>}
                    {isThinking && <span className="inline-block w-2 h-4 bg-indigo-500 ml-1 animate-pulse align-middle"></span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MAIN CONTENT TEXT */}
          <div className={`prose prose-sm md:prose-base dark:prose-invert max-w-none leading-relaxed prose-p:my-1 prose-pre:bg-black/10 dark:prose-pre:bg-black prose-pre:rounded-lg ${message.isError ? 'text-red-500 font-medium' : ''}`}>
             <ReactMarkdown>{content}</ReactMarkdown>
             {!content && !isThinking && !hasThought && (
               <span className="animate-pulse inline-block w-2 h-4 bg-current align-middle ml-1"></span>
             )}
          </div>

          {/* GENERATED IMAGES (MODEL) - FIX İÇİN EKLENDİ */}
          {message.images && message.images.length > 0 && (
             <div className="mt-4 animate-fade-in">
               <div className="grid grid-cols-1 gap-4 max-w-lg">
                 {message.images.map((img, i) => (
                    <div key={i} className="relative group overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl bg-black/5 dark:bg-white/5">
                      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                         <a href={img} target="_blank" rel="noopener noreferrer" className="p-2 bg-black/50 text-white rounded-lg backdrop-blur hover:bg-black/70 transition-colors block" title="Orijinal Boyutta Aç">
                           <Icons.Image size={16} />
                         </a>
                      </div>
                      <img 
                        src={img} 
                        alt="SykoLLM Vision Generated Asset" 
                        className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105" 
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://placehold.co/600x400/black/white?text=Generation+Error";
                        }}
                      />
                    </div>
                 ))}
               </div>
               <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-400 font-mono">
                  <Icons.Sparkles size={12} className="text-purple-500" />
                  <span>Generated by SykoLLM Vision (Flux Engine)</span>
               </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};