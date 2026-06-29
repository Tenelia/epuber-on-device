import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Helper function to extract text from an EPUB structure
// We expect the frontend to send the parsed epub data, or at least the raw text of the chapters.
// To save bandwidth, the frontend will extract the text of the EPUB and send it to the backend.

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

    if (provider === "openai" || provider === "cerebras") {
      const baseURL = provider === "cerebras" ? "https://api.cerebras.ai/v1" : undefined;
      const client = new OpenAI({ apiKey, baseURL });
      
      const response = await client.chat.completions.create({
        model: model || (provider === "cerebras" ? "llama3.1-70b" : "gpt-4o"),
        messages: [
          { role: "system", content: finalPrompt },
          { role: "user", content }
        ],
        temperature: 0.3,
      });
      
      translatedText = response.choices[0].message.content || "";
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
