const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());

// Заглушка
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// Хранилище активных сессий
const transports = new Map();

app.get("/sse", async (req, res) => {
  // 1. Создаем новый инстанс сервера для КАЖДОГО подключения
  const server = new Server({
    name: "wolfram-alpha",
    version: "1.0.0"
  }, {
    capabilities: { tools: {} }
  });

  server.setRequestHandler(require("@modelcontextprotocol/sdk/types.js").ListToolsRequestSchema, async () => ({
    tools: [{
      name: "calculate",
      description: "Query Wolfram Alpha for math and facts",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    }]
  }));

  server.setRequestHandler(require("@modelcontextprotocol/sdk/types.js").CallToolRequestSchema, async (request) => {
    if (request.params.name === "calculate") {
      const appid = process.env.WOLFRAM_ALPHA_APP_ID;
      const url = `https://api.wolframalpha.com/v1/result?appid=${appid}&i=${encodeURIComponent(request.params.arguments.query)}`;
      try {
        const response = await axios.get(url);
        return { content: [{ type: "text", text: response.data }] };
      } catch (e) {
        return { content: [{ type: "text", text: "Error: " + e.message }] };
      }
    }
  });

  try {
    // 2. Открываем транспорт и сохраняем его по уникальному sessionId
    const transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);
    
    transports.set(transport.sessionId, transport);

    // Удаляем сессию, если клиент отключился
    res.on("close", () => {
      transports.delete(transport.sessionId);
    });
  } catch (e) {
    console.error("SSE Error:", e);
    res.status(500).send("Internal SSE Error");
  }
});

app.post("/messages", async (req, res) => {
  // 3. Направляем команды от Perplexity в правильную сессию
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(404).send("Session not found");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Wolfram MCP Multi-session on port ${PORT}`));
