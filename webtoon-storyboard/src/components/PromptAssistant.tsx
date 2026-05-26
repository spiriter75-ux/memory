import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Bot, Trash2, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default function PromptAssistant() {
  const { chatMessages, addChatMessage, clearChat, toggleSidebar, settings } = useAppStore();
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    setInput('');
    addChatMessage({ role: 'user', content: userMsg });

    setIsTyping(true);
    try {
      const genAI = new GoogleGenerativeAI(settings.apiKey);
      const model = genAI.getGenerativeModel({ model: settings.aiModel || 'gemini-2.5-flash' });

      const chatHistory = chatMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const systemPrompt = `
당신은 전문 웹툰 프롬프트 연구원입니다. 사용자가 **Z-Anime (S3-DiT)** 모델을 사용하여 최상의 웹툰 이미지를 생성할 수 있도록 조언하고 프롬프트를 튜닝해 줍니다.

[지침]
1. Z-Anime는 자연어(Full Sentences)를 선호합니다.
2. 사용자의 질문에 맞춰 구체적인 영어 프롬프트 예시를 제공하세요.
3. 캐릭터의 일관성, 조명 효과, 시네마틱한 구도에 집중하여 조언하세요.
4. 답변은 한국어로 하되, 프롬프트 예시는 영어로 제공합니다.
`.trim();

      const chat = model.startChat({
        history: chatHistory,
        generationConfig: { maxOutputTokens: 1000 },
      });

      const result = await chat.sendMessage(userMsg);
      const responseText = result.response.text();
      
      addChatMessage({ role: 'assistant', content: responseText });
    } catch (err: any) {
      addChatMessage({ role: 'assistant', content: `오류가 발생했습니다: ${err.message}` });
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 shadow-xl animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-white">
          <Sparkles className="w-5 h-5 text-primary-500" />
          <span>프롬프트 어시스턴트</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={clearChat}
            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
            title="대화 초기화"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button 
            onClick={toggleSidebar}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 dark:text-slate-500 px-6">
            <Bot className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">Z-Anime 프롬프트에 대해 궁금한 점을 물어보세요!<br/>예: "머리카락에 윤기를 더하는 프롬프트는?"</p>
          </div>
        )}
        
        {chatMessages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in fade-in duration-300`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              msg.role === 'user' ? 'bg-primary-100 text-primary-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}>
              {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
            </div>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-primary-600 text-white rounded-tr-none' 
                : 'bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-200 dark:border-slate-700'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Bot className="w-5 h-5 text-slate-400" />
            </div>
            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-2xl rounded-tl-none">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="메시지를 입력하세요..."
            rows={1}
            className="w-full pl-4 pr-12 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm resize-none text-sm transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className={`absolute right-2 top-2 p-2 rounded-xl transition-all ${
              input.trim() && !isTyping 
                ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-md' 
                : 'text-slate-400 bg-transparent'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
