import React, { useState, useEffect, useRef } from 'react';
import { Message, ChatSession, ModelConfig, Theme, UserWallet, DailyUsage, ModelUsage } from './types.ts';
import { streamResponse, generateSykoImage } from './services/sykoService';
import { Icons } from './components/Icon';
import { ModelSelector } from './components/ModelSelector';
import { ChatMessage } from './components/ChatMessage';
import { Toast } from './components/Toast';

// Web Speech API & Google Auth Types extension
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    google: any;
  }
}

// 🤖 MODEL CONFIGURATION
const MODELS: ModelConfig[] = [
  { 
    id: 'syko-v2.5', 
    name: 'SykoLLM V2.5', 
    tag: 'FAST', 
    description: 'Our fast model, optimized for everyday tasks and quick responses.', 
    supportsImages: false 
  },
  { 
    id: 'syko-v3-pro', 
    name: 'SykoLLM PRO', 
    tag: 'SMART', 
    description: 'Our balanced model, delivering smarter reasoning with moderate speed.', 
    supportsImages: true 
  },
  { 
    id: 'syko-super-pro', 
    name: 'SykoLLM SUPER PRO', 
    tag: 'O1-PREVIEW', 
    description: 'Our most advanced reasoning model. Thinks deeply before answering complex queries.', 
    supportsImages: false 
  },
  { 
    id: 'syko-coder', 
    name: 'SykoLLM Coder', 
    tag: 'DEV', 
    description: 'Specialized for programming tasks, debugging, and code generation.', 
    supportsImages: false 
  },
];

// 🔒 GÜVENLİK AYARLARI
const ALLOWED_ADMIN_IP = "78.163.111.69";

// 💰 EKONOMİ VE LİMİT AYARLARI
const LIMITS = {
  v25: { text: 20, imageGen: 2, vision: 2 },
  pro: { text: 15, imageGen: 1, vision: 1 },
  super: { text: 3, imageGen: 1, vision: 1 },
  coder: { text: 5, imageGen: 0, vision: 0 }
};

const PACKAGES = [
  { credits: 10, price: 50 },
  { credits: 20, price: 100 },
  { credits: 60, price: 350 },
];

// Varsayılan boş kullanım objesi
const DEFAULT_USAGE: DailyUsage = {
  date: new Date().toISOString().split('T')[0],
  v25: { text: 0, imageGen: 0, vision: 0 },
  pro: { text: 0, imageGen: 0, vision: 0 },
  super: { text: 0, imageGen: 0, vision: 0 },
  coder: { text: 0, imageGen: 0, vision: 0 }
};

export default function App() {
  // Privacy State
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [privacyCheckbox, setPrivacyCheckbox] = useState(false);
  const [showDetailedPolicy, setShowDetailedPolicy] = useState(false);

  // Auth State
  const [user, setUser] = useState<{name: string, email: string, picture: string} | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStep, setVerifyStep] = useState(0);

  // Custom Auth State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authError, setAuthError] = useState('');
  
  // Login Info State
  const [showLoginInfo, setShowLoginInfo] = useState(false);

  // App State
  const [theme, setTheme] = useState<Theme>(Theme.DARK);
  const [input, setInput] = useState('');
  const [currentModel, setCurrentModel] = useState(MODELS[0].id);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Notification State
  const [limitError, setLimitError] = useState<{show: boolean, msg: string}>({show: false, msg: ''});
  const [toast, setToast] = useState<{message: string, type: 'error' | 'success'} | null>(null);
  
  // Wallet & Shop State
  const [wallet, setWallet] = useState<UserWallet>({ balance: 0, proCredits: 0 });
  const [usage, setUsage] = useState<DailyUsage>(DEFAULT_USAGE);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState<'credits' | 'deposit'>('credits');
  const [depositAmount, setDepositAmount] = useState<number>(50);
  const [ccNumber, setCcNumber] = useState('');
  const [ccName, setCcName] = useState('');
  const [ccExpiry, setCcExpiry] = useState('');
  const [ccCvv, setCcCvv] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Security State
  const [canShowDevButton, setCanShowDevButton] = useState(false);
  
  // Voice State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Image & Menu State
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isImageGenMode, setIsImageGenMode] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- GOOGLE AUTH HELPERS ---
  const renderGoogleButton = () => {
    const btn = document.getElementById('google-btn');
    if (btn && window.google) {
      try {
        window.google.accounts.id.renderButton(btn, {
          theme: "filled_black",
          size: "large",
          width: "100%", 
          shape: "pill",
          logo_alignment: "left"
        });
      } catch (e) {
        console.error("Google button render error:", e);
      }
    }
  };

  const handleGoogleLogin = (response: any) => { 
    try { 
      const payload = JSON.parse(atob(response.credential.split('.')[1])); 
      setUser({ name: payload.name, email: payload.email, picture: payload.picture }); 
      startVerificationSequence(); 
    } catch (e) { 
      setUser({ name: "Demo User", email: "user@sykollm.com", picture: "https://lh3.googleusercontent.com/a/default-user" }); 
      startVerificationSequence(); 
    } 
  };

  // Initialize
  useEffect(() => {
    // Check Privacy Consent
    const consent = localStorage.getItem('syko_privacy_consent');
    if (consent === 'true') setPrivacyAccepted(true);

    // Load Wallet & Usage
    const storedWallet = localStorage.getItem('syko_wallet');
    if (storedWallet) setWallet(JSON.parse(storedWallet));

    const storedUsage = localStorage.getItem('syko_usage');
    if (storedUsage) {
      const parsedUsage = JSON.parse(storedUsage);
      const today = new Date().toISOString().split('T')[0];
      if (parsedUsage.date !== today) {
        setUsage({ ...DEFAULT_USAGE, date: today });
      } else {
        // Ensure structure compatibility if updated
        setUsage({ ...DEFAULT_USAGE, ...parsedUsage });
      }
    }

    const savedTheme = localStorage.getItem('syko-theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.className = savedTheme;
    }
    const savedSessions = localStorage.getItem('syko-sessions');
    if (savedSessions) setSessions(JSON.parse(savedSessions));

    // IP Check
    const checkAdminAccess = async () => {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        setCanShowDevButton(true);
        return;
      }
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        if (data.ip === ALLOWED_ADMIN_IP) setCanShowDevButton(true);
      } catch (e) { /* ignore */ }
    };
    checkAdminAccess();

    // Init Google Auth
    const initGoogle = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: "721151475753-41v2k5b1f7a8f1f7a8f1f7a8.apps.googleusercontent.com",
          callback: handleGoogleLogin,
          auto_select: false,
          cancel_on_tap_outside: false
        });
        renderGoogleButton();
      }
    };

    if (!window.google) {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval);
          initGoogle();
        }
      }, 300);
      return () => clearInterval(interval);
    } else {
      initGoogle();
    }
  }, []);

  // RE-RENDER GOOGLE BUTTON
  useEffect(() => {
    if (privacyAccepted && !user) {
      setTimeout(() => {
        renderGoogleButton();
      }, 200);
    }
  }, [privacyAccepted, user, authMode]);

  // Sync Persistence
  useEffect(() => { localStorage.setItem('syko_wallet', JSON.stringify(wallet)); }, [wallet]);
  useEffect(() => { localStorage.setItem('syko_usage', JSON.stringify(usage)); }, [usage]);
  useEffect(() => { localStorage.setItem('syko-sessions', JSON.stringify(sessions)); }, [sessions]);

  // UI Effects
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping, selectedImages]);
  useEffect(() => { if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'; } }, [input]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- 🚦 LIMIT CONTROLLER ---
  const checkLimits = (action: 'text' | 'imageGen' | 'vision'): boolean => {
    const today = new Date().toISOString().split('T')[0];
    if (usage.date !== today) {
      setUsage({ ...DEFAULT_USAGE, date: today });
      return true;
    }

    let modelKey: 'v25' | 'pro' | 'super' | 'coder' = 'v25';
    if (currentModel === 'syko-v3-pro') modelKey = 'pro';
    if (currentModel === 'syko-super-pro') modelKey = 'super';
    if (currentModel === 'syko-coder') modelKey = 'coder';

    const currentUsage = usage[modelKey][action];
    const maxLimit = LIMITS[modelKey][action];

    if (currentUsage >= maxLimit) {
      // Check for extra credits ONLY for text messages on PRO/SUPER (optional logic)
      if (action === 'text' && (modelKey === 'pro' || modelKey === 'super') && wallet.proCredits > 0) {
          return true;
      }
      
      let msg = "Günlük limit aşıldı.";
      if (action === 'text') msg = `${currentModel} için günlük mesaj limitiniz (${maxLimit}) doldu.`;
      if (action === 'imageGen') msg = `${currentModel} için günlük görsel üretme limitiniz (${maxLimit}) doldu.`;
      if (action === 'vision') msg = `${currentModel} için günlük görsel inceleme limitiniz (${maxLimit}) doldu.`;
      
      setLimitError({ show: true, msg });
      return false;
    }

    return true;
  };

  const consumeLimit = (action: 'text' | 'imageGen' | 'vision') => {
    const today = new Date().toISOString().split('T')[0];
    let newUsage = { ...usage };

    if (newUsage.date !== today) {
      newUsage = { ...DEFAULT_USAGE, date: today };
    }

    let modelKey: 'v25' | 'pro' | 'super' | 'coder' = 'v25';
    if (currentModel === 'syko-v3-pro') modelKey = 'pro';
    if (currentModel === 'syko-super-pro') modelKey = 'super';
    if (currentModel === 'syko-coder') modelKey = 'coder';

    // Consume logic
    if (action === 'text' && (modelKey === 'pro' || modelKey === 'super') && newUsage[modelKey].text >= LIMITS[modelKey].text) {
        // Use wallet credits if daily limit reached
        if (wallet.proCredits > 0) {
            setWallet(prev => ({...prev, proCredits: prev.proCredits - 1}));
        }
    } else {
        newUsage[modelKey][action] += 1;
    }
    
    setUsage(newUsage);
  };

  // --- HANDLERS ---
  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessingPayment(true);
    setTimeout(() => {
      setWallet(prev => ({ ...prev, balance: prev.balance + depositAmount }));
      setIsProcessingPayment(false);
      setShopTab('credits');
      setCcNumber(''); setCcName(''); setCcExpiry(''); setCcCvv(''); 
      alert(`Başarılı! ${depositAmount} TL cüzdanınıza eklendi.`);
    }, 2000);
  };

  const handleBuyPackage = (pkg: {credits: number, price: number}) => {
    if (wallet.balance < pkg.price) {
      alert("Yetersiz bakiye! Lütfen önce para yükleyin.");
      setShopTab('deposit');
      return;
    }
    setWallet(prev => ({
      balance: prev.balance - pkg.price,
      proCredits: prev.proCredits + pkg.credits
    }));
    alert(`${pkg.credits} Mesaj Kredisi hesabınıza tanımlandı.`);
  };

  const handlePrivacySubmit = () => { if (privacyCheckbox) { localStorage.setItem('syko_privacy_consent', 'true'); setPrivacyAccepted(true); } };
  
  const handleCustomAuth = (e: React.FormEvent) => {
    e.preventDefault(); setAuthError('');
    if (!email || !password) { setAuthError('Please fill in all fields.'); return; }
    const storedUsersStr = localStorage.getItem('syko_users'); const storedUsers = storedUsersStr ? JSON.parse(storedUsersStr) : [];
    if (authMode === 'register') {
      if (!fullName) { setAuthError('Name is required.'); return; }
      if (storedUsers.find((u: any) => u.email === email)) { setAuthError('Account already exists.'); return; }
      const newUser = { email, password, name: fullName, picture: `https://api.dicebear.com/7.x/initials/svg?seed=${fullName}` };
      localStorage.setItem('syko_users', JSON.stringify([...storedUsers, newUser]));
      setUser({ name: newUser.name, email: newUser.email, picture: newUser.picture }); startVerificationSequence();
    } else {
      const foundUser = storedUsers.find((u: any) => u.email === email && u.password === password);
      if (foundUser) { setUser({ name: foundUser.name, email: foundUser.email, picture: foundUser.picture }); startVerificationSequence(); } else { setAuthError('Invalid email or password.'); }
    }
  };

  const handleDemoLogin = () => { setUser({ name: "Developer Admin", email: "admin@sykollm.dev", picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=SykoAdmin" }); startVerificationSequence(); };
  const startVerificationSequence = () => { setIsVerifying(true); let step = 0; const interval = setInterval(() => { step++; setVerifyStep(step); if (step >= 4) { clearInterval(interval); setTimeout(() => setIsVerifying(false), 1000); } }, 1000); };
  const handleLogout = () => { setUser(null); setIsVerifying(false); setVerifyStep(0); setEmail(''); setPassword(''); setFullName(''); setAuthError(''); };
  const toggleVoiceInput = () => { if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; } const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SpeechRecognition) return alert("Desteklenmiyor."); const rec = new SpeechRecognition(); rec.lang = 'tr-TR'; rec.onstart = () => setIsListening(true); rec.onend = () => setIsListening(false); rec.onresult = (e: any) => setInput(Array.from(e.results).map((r: any) => r[0].transcript).join('')); recognitionRef.current = rec; rec.start(); };
  const toggleTheme = () => { const newTheme = theme === Theme.DARK ? Theme.LIGHT : Theme.DARK; setTheme(newTheme); document.documentElement.className = newTheme; localStorage.setItem('syko-theme', newTheme); };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isListening && recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); }
    if ((!input.trim() && selectedImages.length === 0) || isTyping) return;

    // --- CHECK LIMITS BEFORE ACTION ---
    if (isImageGenMode) {
      if (!checkLimits('imageGen')) return;
    } else {
      // Normal chat OR vision
      if (selectedImages.length > 0) {
         if (!checkLimits('vision')) return;
      }
      if (!checkLimits('text')) return;
    }

    const currentInput = input.trim();
    setInput('');
    setIsTyping(true);
    setLimitError({show: false, msg: ''});
    
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentInput,
      timestamp: Date.now(),
      images: selectedImages.length > 0 ? [...selectedImages] : undefined
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    const imagesToProcess = [...selectedImages];
    setSelectedImages([]); 
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    if (isImageGenMode) {
      try {
        const result = await generateSykoImage(currentModel, currentInput, imagesToProcess);
        consumeLimit('imageGen');
        const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', content: result.text || "Generated:", images: result.images, timestamp: Date.now() };
        setMessages(prev => [...prev, aiMsg]);
      } catch (error: any) {
        setToast({ message: error.message, type: 'error' });
      } finally {
        setIsTyping(false);
        setIsImageGenMode(false);
      }
      return;
    }

    abortControllerRef.current = new AbortController();
    try {
      const aiMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: aiMsgId, role: 'model', content: '', timestamp: Date.now() }]);
      
      let hasConsumed = false;
      await streamResponse(currentModel, newMessages, (chunk) => {
        // Only deduct on first successful chunk
        if (!hasConsumed) {
          consumeLimit('text');
          if (imagesToProcess.length > 0) consumeLimit('vision');
          hasConsumed = true;
        }
        setMessages(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, content: msg.content + chunk } : msg));
      }, abortControllerRef.current.signal, userMsg.images);
    } catch (error: any) {
       if (error.name === 'AbortError') return;
       setMessages(prev => prev.filter(m => m.content !== ''));
       
       if (error.message.toLowerCase().includes('429') || error.message.toLowerCase().includes('quota')) {
         setLimitError({show: true, msg: "API Kotası Aşıldı (429)"});
       } else {
         setToast({ message: error.message, type: 'error' });
       }
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  // --- VIEW 0: PRIVACY (Existing Code) ---
  if (!privacyAccepted) {
     return (
      <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center p-4 backdrop-blur-3xl">
        <div className="bg-syko-gray border border-white/10 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
          <div className="p-6 border-b border-white/10 flex items-center gap-4 bg-black/20">
             <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-black shadow-lg"><Icons.Shield size={24} /></div>
             <div><h1 className="text-xl font-black text-white tracking-tight">GİZLİLİK VE GÜVENLİK SÖZLEŞMESİ</h1><p className="text-white/40 text-xs font-mono uppercase tracking-wider">SykoLLM Enterprise Gateway</p></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
             {!showDetailedPolicy ? (
               <div className="space-y-4 animate-fade-in">
                 <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl flex gap-3 items-start"><Icons.Lock className="text-green-500 shrink-0 mt-0.5" size={20} /><div><h3 className="text-green-500 font-bold text-sm mb-1">MİKROFON VE KAMERA GÜVENLİĞİ</h3><p className="text-sm text-gray-300 leading-relaxed">Bu site, siz <b className="text-white">mikrofon butonuna basmadığınız sürece</b> ortam dinlemesi yapmaz. Kamera erişimi sadece manuel dosya yüklemesinde gerçekleşir.</p></div></div>
                 <p className="text-sm text-gray-400 leading-relaxed">SykoLLM'i kullanarak veri işlemeyi kabul etmiş sayılırsınız.</p>
                 <button onClick={() => setShowDetailedPolicy(true)} className="text-white text-xs font-bold underline decoration-white/30 hover:decoration-white underline-offset-4 transition-all flex items-center gap-1"><Icons.Globe size={12} />Gizlilik sözleşmesi detaylarını görüntüle</button>
               </div>
             ) : (
               <div className="animate-fade-in space-y-6 text-sm text-gray-300">
                  <button onClick={() => setShowDetailedPolicy(false)} className="mb-4 flex items-center gap-2 text-white/50 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors"><Icons.ChevronDown className="rotate-90" size={14}/> Geri Dön</button>
                  <div className="prose prose-invert prose-sm max-w-none"><h3 className="text-white font-bold">1. Veri Toplama ve İşleme</h3><p>Verileriniz geçici olarak işlenir.</p><h3 className="text-white font-bold">2. Bakiye ve Ödemeler</h3><p>Kredi kartı bilgileri simülasyon amaçlıdır, gerçek çekim yapılmaz. Bakiye tarayıcı hafızasında saklanır.</p></div>
               </div>
             )}
          </div>
          <div className="p-6 border-t border-white/10 bg-black/40">
             <label className="flex items-center gap-3 cursor-pointer group mb-4 select-none"><div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${privacyCheckbox ? 'bg-white border-white' : 'border-white/30 group-hover:border-white'}`}>{privacyCheckbox && <Icons.CheckSquare size={14} className="text-black" />}</div><span className={`text-xs font-medium transition-colors ${privacyCheckbox ? 'text-white' : 'text-white/50 group-hover:text-white'}`}>Yukarıdaki şartları okudum, anladım ve kabul ediyorum.</span><input type="checkbox" className="hidden" checked={privacyCheckbox} onChange={(e) => setPrivacyCheckbox(e.target.checked)} /></label>
             <button onClick={handlePrivacySubmit} disabled={!privacyCheckbox} className="w-full bg-white text-black font-black py-4 rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed uppercase tracking-wide text-sm flex items-center justify-center gap-2">{privacyCheckbox ? <Icons.Lock size={16} /> : <Icons.Lock size={16} className="opacity-50"/>}Güvenli Giriş Yap</button>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 1: LOGIN (Existing Code) ---
  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-4 text-white overflow-hidden relative bg-black">
        <div className="absolute inset-0 z-0" style={{ backgroundImage: "url('https://4kwallpapers.com/images/wallpapers/gargantua-black-5200x3250-9659.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} />
        <div className="absolute inset-0 z-0 bg-black/30" />
        <div className="relative z-10 w-full max-w-sm animate-slide-up">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-white rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.3)]"><Icons.Cpu size={32} className="text-black" /></div>
            <h1 className="text-3xl font-black tracking-tighter mb-1 drop-shadow-lg">SykoLLM</h1>
            <p className="text-white/60 text-[10px] uppercase tracking-[0.3em] font-mono drop-shadow-md">Secure Enterprise Gateway</p>
          </div>
          <div className="bg-syko-gray/80 border border-white/10 p-6 rounded-3xl backdrop-blur-xl shadow-2xl">
            <div className="flex bg-black/30 p-1 rounded-xl mb-4">
              <button onClick={() => {setAuthMode('login'); setAuthError('');}} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${authMode === 'login' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}>GİRİŞ YAP</button>
              <button onClick={() => {setAuthMode('register'); setAuthError('');}} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${authMode === 'register' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}>KAYDOL</button>
            </div>
            <form onSubmit={handleCustomAuth} className="space-y-3">
              {authMode === 'register' && (<div className="space-y-1"><label className="text-[10px] uppercase font-bold text-white/40 ml-1">İsim Soyisim</label><input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-white/40 transition-colors" placeholder="Adınız..." /></div>)}
              <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-white/40 ml-1">E-Posta</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-white/40 transition-colors" placeholder="mail@ornek.com" /></div>
              <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-white/40 ml-1">Şifre</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-white/40 transition-colors" placeholder="••••••••" /></div>
              {authError && (<div className="text-red-500 text-xs font-bold text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">{authError}</div>)}
              <button type="submit" className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors mt-1 text-sm">{authMode === 'login' ? 'GİRİŞ YAP' : 'HESAP OLUŞTUR'}</button>
            </form>
            <div className="relative my-4"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-[#1a1a1a] px-2 text-white/30">veya</span></div></div>
            <div id="google-btn" className="flex justify-center google-btn-container min-h-[44px] w-full overflow-hidden mb-2" />
            <div className="flex flex-col items-center"><button onClick={() => setShowLoginInfo(!showLoginInfo)} className="text-[10px] text-white/40 hover:text-white underline decoration-dotted decoration-white/20 hover:decoration-white transition-all flex items-center gap-1">Neden bunu görüyorum?<Icons.ChevronDown size={10} className={`transform transition-transform ${showLoginInfo ? 'rotate-180' : ''}`} /></button>{showLoginInfo && (<div className="mt-2 text-[10px] text-green-400 bg-green-500/10 px-3 py-2 rounded-lg border border-green-500/20 animate-slide-up w-full text-center">Yasal gereklilik ve kullanıcı güvenliği için.</div>)}</div>
            {canShowDevButton && (<div className="flex flex-col items-center gap-3 animate-fade-in border-t border-white/10 pt-4 mt-4"><button onClick={handleDemoLogin} className="w-full bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-black font-bold font-mono text-xs px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 border border-green-500/20 hover:border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.1)] hover:shadow-[0_0_20px_rgba(34,197,94,0.4)] active:scale-95"><Icons.Terminal size={16} /><span>GELİŞTİRİCİ GİRİŞİ YAP</span></button></div>)}
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 2: VERIFICATION (Existing Code) ---
  if (isVerifying) {
    const steps = [{ id: 1, name: "Edge / Gateway Authorization", detail: "Checking IP & Rate Limits...", icon: <Icons.Globe size={24} /> }, { id: 2, name: "Authentication Protocol", detail: "Validating Credentials...", icon: <Icons.Shield size={24} /> }, { id: 3, name: "Backend Security Sync", detail: "Establishing Handshake...", icon: <Icons.Lock size={24} /> }, { id: 4, name: "AI API Token Grant", detail: "Finalizing Session...", icon: <Icons.Cpu size={24} /> }];
    return (<div className="h-screen bg-black flex flex-col items-center justify-center p-6 text-white font-mono"><div className="w-full max-w-sm space-y-8"><div className="text-center space-y-2 mb-12"><h2 className="text-xl font-bold tracking-widest uppercase animate-pulse">Establishing Link</h2><p className="text-xs text-white/40">Routing through Syko Security Layers...</p></div><div className="space-y-6">{steps.map((step, i) => (<div key={step.id} className={`flex items-center gap-4 transition-all duration-500 transform ${verifyStep >= step.id ? 'opacity-100 translate-x-0' : 'opacity-20 translate-x-4'}`}><div className={`p-3 rounded-xl transition-colors duration-300 ${verifyStep > step.id ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.6)]' : (verifyStep === step.id ? 'bg-white text-black animate-pulse' : 'bg-white/5 text-white/50')}`}>{step.icon}</div><div className="flex-1"><div className="flex justify-between items-center"><div className="text-[10px] uppercase opacity-40">Layer 0{step.id}</div>{verifyStep > step.id && <span className="text-green-500 text-[10px] font-bold tracking-wider">SECURE</span>}</div><div className="text-sm font-bold">{step.name}</div>{verifyStep === step.id && <div className="text-[10px] text-white/60 mt-1">{step.detail}</div>}</div></div>))}</div><div className="pt-12 text-center"><div className="h-1 w-full bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-green-500 transition-all duration-1000 ease-linear" style={{width: `${(verifyStep/4)*100}%`}} /></div><div className="mt-2 text-[10px] text-white/30">{Math.min(100, Math.round((verifyStep/4)*100))}% COMPLETED</div></div></div></div>);
  }

  // --- VIEW 3: MAIN APP (CHAT) ---
  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-black text-black dark:text-white font-sans">
      
      {/* 🔔 TOAST NOTIFICATION */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* 🛑 LIMIT ERROR MODAL (Sadece Kota Dolduğunda) */}
      {limitError.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-syko-gray border border-black/10 dark:border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl animate-slide-up text-center relative overflow-hidden">
             <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
             <div className="w-20 h-20 bg-red-500/10 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-red-500/5"><Icons.Alert size={36} /></div>
             
             <h2 className="text-3xl font-black mb-4 tracking-tight">LİMİT DOLDU</h2>
             <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium mb-6">{limitError.msg}</p>

             <button onClick={() => {setLimitError({show:false, msg: ''}); setIsShopOpen(true);}} className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-bold mb-3 hover:scale-[1.02] active:scale-[0.98] transition-all">MAĞAZAYI AÇ</button>
             <button onClick={() => setLimitError({show: false, msg: ''})} className="text-xs font-bold opacity-50 hover:opacity-100 mt-2">KAPAT</button>
          </div>
        </div>
      )}

      {/* 💰 SHOP MODAL */}
      {isShopOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-fade-in">
           <div className="bg-syko-gray border border-white/10 w-full max-w-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/40">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-yellow-500/20 rounded-xl text-yellow-500"><Icons.Wallet size={24}/></div>
                   <div><h2 className="font-black text-xl text-white">SYKO MAĞAZA</h2><p className="text-xs text-white/40 font-mono">SECURE PAYMENT GATEWAY</p></div>
                </div>
                <button onClick={() => setIsShopOpen(false)} className="p-2 hover:bg-white/10 rounded-full text-white"><Icons.Close size={20}/></button>
              </div>

              {/* Balance Bar */}
              <div className="bg-gradient-to-r from-gray-900 to-black p-6 flex justify-between items-center border-b border-white/5">
                 <div>
                    <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-1">MEVCUT BAKİYE</div>
                    <div className="text-3xl font-black text-white font-mono">{wallet.balance.toFixed(2)} TL</div>
                 </div>
                 <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider mb-1">PRO KREDİLERİ</div>
                    <div className="text-xl font-bold text-green-500 flex items-center gap-2 justify-end"><Icons.Coins size={18}/> {wallet.proCredits}</div>
                 </div>
              </div>

              {/* Tabs */}
              <div className="flex p-2 gap-2 bg-black/20">
                 <button onClick={() => setShopTab('credits')} className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${shopTab === 'credits' ? 'bg-white text-black' : 'text-white/40 hover:bg-white/5'}`}>Kredi Satın Al</button>
                 <button onClick={() => setShopTab('deposit')} className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${shopTab === 'deposit' ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)]' : 'text-white/40 hover:bg-white/5'}`}>Para Yükle</button>
              </div>

              {/* Content */}
              <div className="p-6 flex-1 overflow-y-auto">
                 {shopTab === 'credits' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       {PACKAGES.map((pkg, i) => (
                          <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center text-center hover:bg-white/10 transition-all hover:border-white/30 group">
                             <div className="w-12 h-12 rounded-full bg-yellow-500/10 text-yellow-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Icons.Coins size={24}/></div>
                             <div className="text-2xl font-black text-white mb-1">{pkg.credits}</div>
                             <div className="text-xs text-white/40 uppercase font-bold mb-4">Mesaj Hakkı</div>
                             <div className="mt-auto w-full">
                                <div className="text-lg font-bold text-white mb-2">{pkg.price} TL</div>
                                <button onClick={() => handleBuyPackage(pkg)} className="w-full py-2 bg-white text-black font-bold rounded-lg text-xs hover:bg-gray-200">SATIN AL</button>
                             </div>
                          </div>
                       ))}
                       <p className="col-span-full text-center text-[10px] text-white/30 mt-4">Krediler sadece PRO ve SUPER PRO modellerinde geçerlidir.</p>
                    </div>
                 ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-6 animate-fade-in">
                       <div className="w-24 h-24 bg-yellow-500/10 rounded-full flex items-center justify-center text-yellow-500 mb-2">
                           <Icons.Alert size={40} />
                       </div>
                       <div className="space-y-2">
                           <h3 className="text-xl font-black text-white uppercase tracking-wider">ÖDEME SİSTEMİ KAPALI</h3>
                           <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
                               ödeme Sistemi geçiçi olarak kapalıdır. ödeme altyapısı şu anda geliştirme / test (beta) aşamasındadır.
                           </p>
                       </div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-gray-50 dark:bg-syko-dark border-r border-black/10 dark:border-white/10 transform transition-transform duration-300 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 flex flex-col gap-4">
          <button onClick={() => {setMessages([]); setCurrentSessionId(null); setIsImageGenMode(false); setSidebarOpen(false);}} className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl hover:border-black/30 dark:hover:border-white/30 transition-all shadow-sm group">
            <div className="p-1 bg-black text-white dark:bg-white dark:text-black rounded-lg"><Icons.Plus size={16} /></div>
            <span className="font-bold text-sm">New Chat</span>
          </button>
        </div>
        
        {/* Wallet Button */}
        <div className="px-4">
           <button onClick={() => setIsShopOpen(true)} className="w-full p-3 bg-gradient-to-r from-gray-900 to-black text-white rounded-xl border border-white/10 hover:border-yellow-500/50 transition-all flex items-center justify-between group shadow-lg">
              <div className="flex items-center gap-3">
                 <div className="p-1.5 bg-white/10 rounded-lg text-yellow-500 group-hover:scale-110 transition-transform"><Icons.Wallet size={16}/></div>
                 <div className="text-left">
                    <div className="text-[10px] opacity-50 font-bold uppercase tracking-wide">Cüzdan</div>
                    <div className="text-sm font-black font-mono">{wallet.balance.toFixed(2)} TL</div>
                 </div>
              </div>
              <div className="text-xs bg-white/10 px-2 py-1 rounded text-green-400 font-bold">+{wallet.proCredits} Cr</div>
           </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1 mt-4">
          <div className="px-2 pb-2 text-[10px] font-bold opacity-30 uppercase tracking-widest">Session History</div>
          {sessions.map(s => (
            <div key={s.id} onClick={() => {setMessages(s.messages); setCurrentSessionId(s.id); setSidebarOpen(false);}} className={`group flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-all ${currentSessionId === s.id ? 'bg-black/10 dark:bg-white/10 font-bold' : 'opacity-60 hover:opacity-100 hover:bg-black/5'}`}>
              <div className="flex items-center gap-3 truncate text-sm"><Icons.Chat size={14} /><span className="truncate">{s.title}</span></div>
            </div>
          ))}
        </div>

        {/* Donation & Profile */}
        <div className="p-4 border-t border-black/5 dark:border-white/5 space-y-2">
           <a href="#" onClick={(e) => {e.preventDefault(); alert("Bağış sistemi yakında aktif olacak!");}} className="flex items-center justify-center gap-2 w-full py-2 bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/20 rounded-lg text-xs font-bold transition-all mb-2">
              <Icons.Heart size={14} className="fill-current"/> <span>Support Developer</span>
           </a>

           <div className="flex items-center gap-3 p-3 bg-white dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl mb-2 shadow-sm">
              <img src={user.picture} className="w-9 h-9 rounded-full border border-black/10" referrerPolicy="no-referrer" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{user.name}</div>
                <div className="text-[10px] opacity-40 truncate">{user.email}</div>
              </div>
              <button onClick={handleLogout} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors" title="Logout"><Icons.LogOut size={16}/></button>
           </div>
           <button onClick={toggleTheme} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-black/5 transition-colors text-xs font-bold opacity-60 hover:opacity-100">
            {theme === Theme.DARK ? <Icons.Sun size={14} /> : <Icons.Moon size={14} />}
            <span>{theme === Theme.DARK ? 'SWITCH TO LIGHT' : 'SWITCH TO DARK'}</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative">
        <header className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-10 backdrop-blur-md border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 -ml-2"><Icons.Menu size={20} /></button>
            <div className="font-bold text-lg tracking-tight">SykoLLM <span className="text-[10px] bg-black text-white dark:bg-white dark:text-black px-1.5 py-0.5 rounded font-mono">ALPHA</span></div>
          </div>
          <ModelSelector currentModel={currentModel} models={MODELS} onSelect={setCurrentModel} />
        </header>

        <div className="flex-1 overflow-y-auto pt-20 pb-4 scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
              <div className="w-20 h-20 bg-white dark:bg-white rounded-3xl flex items-center justify-center mb-6 shadow-2xl">
                 <Icons.Cpu size={40} className="text-black" />
              </div>
              <h2 className="text-3xl font-black mb-2 tracking-tight">Welcome to SykoLLM</h2>
              <p className="opacity-40 text-lg mb-12">Simple, natural, and powerful AI.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                {[
                  "Hey, what's up?",
                  "Analyze an image for me", 
                  "Explain quantum physics simply",
                  "Tell me a joke"
                ].map(s => (
                  <button key={s} onClick={() => setInput(s)} className="p-5 rounded-2xl border border-black/10 dark:border-white/10 text-sm font-bold text-left hover:bg-black/5 dark:hover:bg-white/5 transition-all hover:scale-[1.02] shadow-sm">
                    "{s}"
                  </button>
                ))}
              </div>
              <div className="mt-8 text-xs text-gray-400">
                  <p className="mb-1 text-center font-bold opacity-70">Daily Limit Status</p>
                  <div className="flex flex-wrap justify-center gap-4 md:gap-6 text-[10px]">
                      <div>V2.5: {LIMITS.v25.text - usage.v25.text} Left</div>
                      <div>PRO: {LIMITS.pro.text - usage.pro.text} Left</div>
                      <div>SUPER: {LIMITS.super.text - usage.super.text} Left</div>
                      <div>CODER: {LIMITS.coder.text - usage.coder.text} Left</div>
                  </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col min-h-full">
              {messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}
              {isTyping && <div className="p-8"><div className="w-2 h-2 bg-current rounded-full animate-bounce" /></div>}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        <div className="p-4 md:p-8 bg-gradient-to-t from-white via-white dark:from-black dark:via-black to-transparent">
          <div className="max-w-3xl mx-auto relative">
             {selectedImages.length > 0 && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                   {selectedImages.map((img, i) => (
                      <div key={i} className="relative group shrink-0">
                         <img src={img} className="h-20 w-20 object-cover rounded-2xl border border-black/10 dark:border-white/20" />
                         <button onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg group-hover:scale-110 transition-all"><Icons.Close size={12} /></button>
                      </div>
                   ))}
                </div>
             )}

             {isImageGenMode && (
                <div className="flex items-center justify-between bg-purple-500/10 text-purple-600 dark:text-purple-300 px-4 py-2 rounded-t-2xl text-[10px] font-black border border-b-0 border-purple-500/20">
                   <div className="flex items-center gap-2"><Icons.Sparkles size={14} className="animate-pulse" /> SYKO VISION MODE ACTIVE</div>
                   <button onClick={() => setIsImageGenMode(false)}><Icons.XCircle size={14} /></button>
                </div>
             )}

             <div className="relative group">
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
                  const reader = new FileReader();
                  if (e.target.files?.[0]) {
                    reader.onloadend = () => setSelectedImages(prev => [...prev, reader.result as string]);
                    reader.readAsDataURL(e.target.files[0]);
                  }
                }} />
                
                <button onClick={() => fileInputRef.current?.click()} className="absolute left-3 bottom-3 p-2 rounded-xl text-black/50 dark:text-white/50 hover:bg-black/5 z-10 hover:text-black dark:hover:text-white transition-colors"><Icons.Plus size={18} /></button>
                
                <div className="absolute left-12 bottom-3 z-20" ref={menuRef}>
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded-xl hover:bg-black/5 text-black/50 dark:text-white/50 transition-colors hover:text-black dark:hover:text-white"><Icons.MoreHorizontal size={18} /></button>
                    {isMenuOpen && (
                        <div className="absolute bottom-full mb-3 left-0 w-64 bg-white dark:bg-syko-gray border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl p-1 overflow-hidden animate-slide-up origin-bottom-left">
                            <button onClick={() => {setIsImageGenMode(true); setIsMenuOpen(false);}} className="w-full text-left p-4 hover:bg-black/5 rounded-xl flex items-center gap-3 transition-all">
                                <div className="p-2 bg-purple-500/20 text-purple-600 rounded-xl"><Icons.Image size={16} /></div>
                                <div className="flex flex-col"><span className="text-xs font-black uppercase">Syko Vision</span><span className="text-[10px] opacity-40">Creative Engine</span></div>
                            </button>
                        </div>
                    )}
                </div>

                <textarea ref={textareaRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSubmit())} placeholder={isImageGenMode ? "Describe something to imagine..." : "Type a secure message..."}
                  className={`w-full bg-gray-100 dark:bg-syko-gray text-base pl-24 pr-28 px-5 py-4 rounded-2xl border-none focus:ring-2 resize-none max-h-48 shadow-sm transition-all placeholder:opacity-40 font-medium ${isImageGenMode ? 'focus:ring-purple-500/50 rounded-tl-none border-t border-purple-500/30' : 'focus:ring-black/10 dark:focus:ring-white/10'}`} style={{ minHeight: '56px' }}
                />

                 <button onClick={toggleVoiceInput} className={`absolute right-14 bottom-3 p-2 rounded-xl transition-all z-20 ${isListening ? 'bg-red-500/10 text-red-500 animate-pulse' : 'text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white'}`}><Icons.Mic size={18} /></button>
                
                <button onClick={() => isTyping ? abortControllerRef.current?.abort() : handleSubmit()} disabled={!input.trim() && selectedImages.length === 0 && !isTyping} className={`absolute right-3 bottom-3 p-2 rounded-xl text-white transition-all shadow-md ${isTyping ? 'bg-black dark:bg-white dark:text-black' : isImageGenMode ? 'bg-purple-600' : 'bg-black dark:bg-white dark:text-black disabled:opacity-0 disabled:scale-90'}`}>
                  {isTyping ? <Icons.Square size={18} fill="currentColor" /> : isImageGenMode ? <Icons.Sparkles size={18} /> : <Icons.Send size={18} />}
                </button>
             </div>
          </div>
          <div className="text-center mt-4"><p className="text-[10px] font-black opacity-20 tracking-[0.2em] uppercase flex items-center justify-center gap-2"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Security Clearance: Cleared - Tier 1</p></div>
        </div>
      </main>
    </div>
  );
}