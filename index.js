const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());

app.get("/", (req, res) => res.status(200).send("OK"));

const transports = new Map();

app.get("/sse", async (req, res) => {
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
      const query = request.params.arguments.query;
      console.log(`[LOG] Запрос к Wolfram: ${query}`);
      
      const appid = process.env.WOLFRAM_ALPHA_APP_ID;
      const url = `https://api.wolframalpha.com/v1/result?appid=${appid}&i=${encodeURIComponent(query)}`;
      
      try {
        const response = await axios.get(url);
        console.log(`[LOG] Ответ Wolfram: ${response.data}`);
        return { content: [{ type: "text", text: response.data }] };
      } catch (e) {
        console.error(`[ERR] Ошибка Wolfram API: ${e.message}`);
        return { content: [{ type: "text", text: "Wolfram API Error: " + e.message }] };
      }
    }
  });

  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
  transports.set(transport.sessionId, transport);
  console.log(`[LOG] Новая сессия открыта: ${transport.sessionId}`);

  res.on("close", () => {
    transports.delete(transport.sessionId);
    console.log(`[LOG] Сессия закрыта: ${transport.sessionId}`);
  });
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(404).send("Session not found");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Wolfram MCP (Log Mode) on port ${PORT}`));
