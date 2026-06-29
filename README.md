# Offline EPUBer with AI Translation

A high-performance, offline-first reading application designed with fluid column pagination, customizable styling, sandboxed IndexedDB storage, and AI-powered multilingual translation capabilities.

## Key Features

- **Multi-Format Reading Engine**: Supports parsing and rendering of `.epub`, `.txt`, and `.md` files directly in the browser.
- **Offline Storage**: Uses IndexedDB for secure, local, and offline access to uploaded books.
- **Fluid Pagination & Styling**: Adaptive multi-column layouts with customizable themes, typography, font sizing, and margins.
- **AI-Powered Translations**: 
  - Translates chapters into multiple target languages with granular control.
  - **Cloud Providers**: Integrates with OpenAI, Anthropic, and Cerebras APIs.
  - **On-Device WebGPU**: Runs LLMs entirely on-device (offline) using MLC WebLLM. Built-in support for Gemma 2B, Qwen 1.5B, and custom local models.
  - **Customizable Output**: Edit translation system prompts directly in the UI and export results as `.txt` or `.md`.

## Technical Architecture

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide React.
- **Text & EPUB Parsers**: `marked` for Markdown rendering, alongside specialized chunking algorithms for EPUB and plain text.
- **Local Database**: IndexedDB for persistent, offline book storage.
- **Backend Proxy**: Express server to securely proxy AI translation requests to Cloud LLM providers.
- **Local AI Engine**: `@mlc-ai/web-llm` for hardware-accelerated local browser inference via WebGPU.

## Setup & Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

4. Start the production server:
   ```bash
   npm run start
   ```
