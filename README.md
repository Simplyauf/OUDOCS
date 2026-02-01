# OuDocs

**Your Personal Intelligence Layer over any document.**

OuDocs transforms static PDFs, Docs, and text into an interactive knowledge base. Ask questions, extract insights, and summarize content instantly using advanced RAG (Retrieval Augmented Generation).

## Features

-   **Multi-Format Analysis:** Upload PDF (`.pdf`), Word (`.docx`), or paste raw text.
-   **Smart RAG Memory:** Remembers your conversation context (e.g., "how much?", "does it apply?").
-   **Installable App (PWA):** Works on mobile and desktop with offline support.
-   **Secure Guest Mode:**
    -   Try instantly without login.
    -   **Abuse Prevention:** Uses device fingerprinting + IP limits to prevent span.
    -   **Auto-Resume:** Reconnecting from the same device restores your session.
-   **Google Auth:** Sign in to save workspaces and increase limits.

## Tech Stack

-   **Frontend:** Next.js 15 (App Router), TailwindCSS, Framer Motion.
-   **Backend:** Next.js API Routes.
-   **Database:** Supabase (PostgreSQL + Vector Store).
-   **AI Engine:** Google Gemini Flash 2.0 (via LangChain).
-   **Security:** FingerprintJS, Supabase Auth.

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Simplyauf/OUDOCS.git
    cd OUDOCS
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env.local` file:
    ```bash
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
    SUPABASE_SERVICE_ROLE_KEY=your_service_key
    GOOGLE_API_KEY=your_gemini_key
    ```

4.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000)

## License

Private / Proprietary.
