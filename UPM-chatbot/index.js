const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const { createAssistant } = require("./openai.service");

const app = express();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

function logMessageToFile(threadId, role, content) {
  const filePath = path.join(logsDir, `thread_${threadId}.json`);
  const logEntry = {
    timestamp: new Date().toISOString(),
    role,
    content,
  };

  let existingLogs = [];

  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf8");
      existingLogs = JSON.parse(data);
    } catch (err) {
      console.error("Failed to read or parse existing log file:", err);
    }
  }

  existingLogs.push(logEntry);
  fs.writeFileSync(filePath, JSON.stringify(existingLogs, null, 2));
}

(async () => {
  const assistant = await createAssistant(openai);

  app.get("/", (req, res) => {
    res.send("Welcome to UPM Chat Assistant API");
  });

  app.get("/start", async (req, res) => {
    try {
      const thread = await openai.beta.threads.create();
      return res.json({ thread_id: thread.id });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to create thread" });
    }
  });

  app.post("/chat", async (req, res) => {
    try {
      const assistantId = assistant.id;
      const threadId = req.body.thread_id;
      const message = req.body.message;

      if (!threadId) {
        return res.status(400).json({ error: "Missing thread_id" });
      }

      logMessageToFile(threadId, "user", message);
      console.log(`Received message: ${message} for thread ID: ${threadId}`);

      await openai.beta.threads.messages.create(threadId, {
        role: "user",
        content: message,
      });

      // Create the run with file_search tool
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        tool_choice: { type: "file_search" },
      });

      // Polling until run is completed
      let runStatus;
      do {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      } while (
        runStatus.status !== "completed" &&
        runStatus.status !== "failed"
      );

      if (runStatus.status === "failed") {
        throw new Error("Assistant run failed");
      }

      const messages = await openai.beta.threads.messages.list(threadId);
      const assistantMessage = messages.data.find(
        (msg) => msg.role === "assistant",
      );

      if (!assistantMessage || !assistantMessage.content?.[0]?.text?.value) {
        throw new Error("No response from assistant");
      }

      const response = assistantMessage.content[0].text.value;
      logMessageToFile(threadId, "assistant", response);
      return res.json({ response });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  app.listen(8080, () => {
    console.log("Server running on port 8080");
  });
})();
