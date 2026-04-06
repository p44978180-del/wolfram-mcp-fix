const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

// Разрешаем Perplexity общаться с сервером
app.use(cors());

// Заглушка, чтобы Perplexity не получала HTML-ошибку "Cannot GET /"
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

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

let transport;
app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Wolfram MCP with CORS on port ${PORT}`));
