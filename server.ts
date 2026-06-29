import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import Cerebras from "@cerebras/cerebras_cloud_sdk";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Helper function to extract text from an EPUB structure
// We expect the frontend to send the parsed epub data, or at least the raw text of the chapters.
// To save bandwidth, the frontend will extract the text of the EPUB and send it to the backend.

// Rate Limiter for Cerebras
interface TokenLimit {
  rpm: number;
  tpm: number;
  tph: number;
  tpd: number;
}

class RateLimiter {
  private requestTimestamps: number[] = [];
  private tokenTimestamps: { timestamp: number, tokens: number }[] = [];
  private config: TokenLimit;

  constructor(config: TokenLimit) {
    this.config = config;
  }

  async acquire(tokens: number) {
    while (true) {
      const now = Date.now();
      
      this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 24 * 60 * 60 * 1000);
      this.tokenTimestamps = this.tokenTimestamps.filter(t => now - t.timestamp < 24 * 60 * 60 * 1000);

      const reqs1M = this.requestTimestamps.filter(t => now - t < 60000);
      const toks1M = this.tokenTimestamps.filter(t => now - t.timestamp < 60000);
      const toks1H = this.tokenTimestamps.filter(t => now - t.timestamp < 3600000);
      
      const reqCount1M = reqs1M.length;
      const tokens1M = toks1M.reduce((sum, t) => sum + t.tokens, 0);
      const tokens1H = toks1H.reduce((sum, t) => sum + t.tokens, 0);
      const tokens24H = this.tokenTimestamps.reduce((sum, t) => sum + t.tokens, 0);

      let waitTime = 0;

      if (reqCount1M >= this.config.rpm) {
        waitTime = Math.max(waitTime, 60000 - (now - reqs1M[0]));
      }
      
      if (tokens1M + tokens > this.config.tpm) {
        let excess = (tokens1M + tokens) - this.config.tpm;
        let cleared = 0;
        let i = 0;
        while (cleared < excess && i < toks1M.length) {
           cleared += toks1M[i].tokens;
           waitTime = Math.max(waitTime, 60000 - (now - toks1M[i].timestamp));
           i++;
        }
      }

      if (tokens1H + tokens > this.config.tph) {
         waitTime = Math.max(waitTime, 60000); 
      }

      if (tokens24H + tokens > this.config.tpd) {
         waitTime = Math.max(waitTime, 60000);
      }

      if (waitTime > 0) {
        await new Promise(r => setTimeout(r, waitTime + 50));
        continue;
      }

      this.requestTimestamps.push(now);
      this.tokenTimestamps.push({ timestamp: now, tokens });
      break;
    }
  }
}

const cerebrasGemmaRateLimiter = new RateLimiter({
  rpm: 5,
  tpm: 30000,
  tph: 1000000,
  tpd: 1000000
});

app.post("/api/translate", async (req, res) => {
  try {
    const { provider, apiKey, model, targetLanguage, content, systemPrompt } = req.body;

    if (!apiKey) {
      return res.status(401).json({ error: "API key is required" });
    }

    if (!content || !targetLanguage) {
      return res.status(400).json({ error: "Content and targetLanguage are required" });
    }

    const defaultPrompt = `You are a professional literary translator. You must first carefully parse and understand the context, tone, and narrative of the provided book excerpt BEFORE attempting to translate. Maintain the author's voice, formatting, and structural integrity. Translate the following text into ${targetLanguage}. Return ONLY the translated text without any conversational preamble or explanations.`;
    const finalPrompt = systemPrompt || defaultPrompt;

    let translatedText = "";

    if (provider === "openai") {
      const client = new OpenAI({ apiKey });
      
      const response = await client.chat.completions.create({
        model: model || "gpt-4o",
        messages: [
          { role: "system", content: finalPrompt },
          { role: "user", content }
        ],
        temperature: 0.3,
      });
      
      translatedText = response.choices[0].message.content || "";
    } else if (provider === "cerebras") {
      const payload: any = {
        model: model || "llama3.1-8b",
        messages: [
          { role: "system", content: finalPrompt },
          { role: "user", content }
        ],
        temperature: 0.3,
      };

      if (model === "gemma-4-31b") {
        payload.reasoning_effort = "low";
        
        // Use token estimation of 1 token ~= 4 chars
        const estimatedTokens = Math.ceil((content.length + finalPrompt.length) / 4);
        await cerebrasGemmaRateLimiter.acquire(estimatedTokens);
      }

      const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Cerebras API Error: ${response.statusText}`);
      }

      const data = await response.json();
      translatedText = data.choices?.[0]?.message?.content || "";
    } else if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      
      const response = await client.messages.create({
        model: model || "claude-3-5-sonnet-20240620",
        system: finalPrompt,
        messages: [
          { role: "user", content }
        ],
        max_tokens: 4096,
        temperature: 0.3,
      });
      
      translatedText = response.content[0].type === "text" ? response.content[0].text : "";
    } else {
      return res.status(400).json({ error: "Unsupported provider" });
    }

    res.json({ translatedText });
  } catch (error: any) {
    console.error("Translation API Error:", error);
    res.status(500).json({ error: error.message || "Translation failed" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
