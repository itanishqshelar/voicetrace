# VoiceTrace 🎙️

**VoiceTrace** is an AI-powered sales and expense tracking application built explicitly for street vendors, small business owners, and local shops. It allows users to log their daily transactions simply by speaking in **Hindi**, **English**, or **Hinglish**. 

The app translates voice into text, extracts structured sales data, and immediately provides actionable insights.

![VoiceTrace App](https://via.placeholder.com/800x400?text=VoiceTrace+App+Prev)

## 🚀 Features

- ** Multilingual Voice Logging:** Record sales effortlessly using natural speech (Hindi, English, or Hinglish).
- ** AI-Powered Parsing:** Utilizes the Groq API (Whisper and LLMs) for blazing-fast transcription and intelligent extraction of items, quantities, and prices.
- ** Real-time Dashboard:** Track total earnings, expenses, and analytics with beautiful interactive charts (powered by Recharts).
- ** Item Catalog:** Manage a centralized catalog of your products/services and their prices for quick reference.
- ** Interactive Voice Logs:** Review past recordings with audio playback, synchronized waveform visualization (via WaveSurfer.js), and text highlighting.
- **Secure Cloud Storage:** Data and audio recordings are securely stored and synced using Supabase.
- ** Export Capabilities:** Easily export sales data and reports to Excel (XLSX) or PDF formats.

## 🛠️ Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (React 19)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Backend/Database:** [Supabase](https://supabase.com/)
- **AI Integration:** [Groq API](https://groq.com/)
- **Audio Visualization:** [WaveSurfer.js](https://wavesurfer.xyz/)
- **Charts:** [Recharts](https://recharts.org/)
- **Icons:** [Lucide React](https://lucide.dev/)

## 💻 Getting Started

### Prerequisites

- Node.js (v20 or higher recommended)
- A Supabase account and project
- A Groq API key

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/itanishqshelar/voicetrace.git
   cd voicetrace
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env.local` file in the root directory and add the following keys:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   GROQ_API_KEY=your_groq_api_key
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open the application:**
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser to see the app running.

## 📂 Project Structure

- `/src/app/` - Next.js App Router pages (Home, Dashboard, Catalog, Logs)
- `/src/components/` - Reusable React components (VoiceRecorder, WaveformPlayer, Sidebar, UI components)
- `/src/lib/` - Utility functions, API clients, and AI parsing logic
- `/src/app/api/` - Backend Next.js API routes



## 📄 License

This project is licensed under the MIT License.
