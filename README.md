# SykoLLM Web Interface

Bu proje SykoLLM için hazırlanmış modern, siyah temalı bir sohbet arayüzüdür.

## 🚀 Kurulum (Modeli Bağlama)

Bu arayüzün çalışması için bir API Anahtarına ihtiyacı vardır.

### 1. API Anahtarı Alın
[Google AI Studio](https://aistudio.google.com/app/apikey) adresinden ücretsiz bir API Key alın.

### 2. Anahtarı Tanımlayın

#### Bilgisayarınızda (Local) Çalıştırıyorsanız:
1. Projenin ana dizininde `.env` adında bir dosya oluşturun.
2. İçine şu satırı ekleyin:
   ```
   API_KEY=AIzaSy... (Buraya kendi anahtarınızı yapıştırın)
   ```
3. Uygulamayı başlatın: `npm run dev`

#### Vercel / Netlify Üzerinde Yayınlıyorsanız:
1. Proje ayarlarında **Environment Variables** bölümüne gidin.
2. Key: `API_KEY`
3. Value: `Sizin_API_Anahtarınız`
4. Projeyi **Redeploy** yapın.

## ⚙️ Modeli Özelleştirme (SykoLLM Kişiliği)

Modelin nasıl davranacağını, ismini veya kurallarını değiştirmek için:
`services/sykoService.ts` dosyasını açın ve `SYSTEM_INSTRUCTION` değişkenini düzenleyin.

```typescript
const SYSTEM_INSTRUCTION = `
You are SykoLLM, an advanced AI model...
(Buraya modelinizin nasıl davranmasını istediğinizi yazın)
`;
```

## 🛠 Kullanılan Teknolojiler
- React + Vite
- TailwindCSS
- Google GenAI SDK
- Lucide Icons
