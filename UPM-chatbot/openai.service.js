const fs = require("fs");
const path = require("path");

const createAssistant = async (openai) => {
  const assistantFilePath = "assistant.json";

  if (!fs.existsSync(assistantFilePath)) {
    const fileIds = [];

    // مجلد ملفات البيانات الجديد
    const dataFilesDir = path.join("public", "data files");

    // قراءة جميع الملفات ذات الامتداد .docx
    const dataFiles = fs
      .readdirSync(dataFilesDir)
      .filter((file) => file.endsWith(".docx"));

    for (const filename of dataFiles) {
      const filePath = path.join(dataFilesDir, filename);
      const uploadedFile = await openai.files.create({
        file: fs.createReadStream(filePath),
        purpose: "assistants",
      });
      fileIds.push(uploadedFile.id);
    }

    // إنشاء vector store
    const vectorStore = await openai.beta.vectorStores.create({
      name: "UPM Knowledge Base",
      file_ids: fileIds,
    });

    // إنشاء الـ assistant
    const assistant = await openai.beta.assistants.create({
      name: "UPM Assistant",
      instructions: `Answer questions about University of Prince Mugrin (UPM) using only the uploaded documents. Respond in the same language the user uses: if the user asks in English, respond in English; if the user asks in Arabic, respond in Arabic. if you are asked to provide a study plan then you must provide the whole study plan with all years and all courses. Do not add references to any documents at the end of your response unless explicitly asked.`,
      tools: [{ type: "file_search" }],
      tool_resources: { file_search: { vector_store_ids: [vectorStore.id] } },
      model: "gpt-4o-mini",
    });

    fs.writeFileSync(assistantFilePath, JSON.stringify(assistant));
    return assistant;
  } else {
    const assistant = JSON.parse(fs.readFileSync(assistantFilePath));
    return assistant;
  }
};

module.exports = { createAssistant };
