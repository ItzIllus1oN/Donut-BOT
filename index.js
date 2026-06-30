const express = require("express");
const http = require("http");
const https = require("https");

const mineflayer = require("mineflayer");
const { pathfinder, Movements } = require("mineflayer-pathfinder");

const config = require("./settings.json");

// ============================================================
// APP SETUP
// ============================================================
const app = express();
const PORT = process.env.PORT || 5000;

let bot = null;
let botState = {
  connected: false,
  startTime: Date.now(),
  reconnecting: false
};

// ============================================================
// DASHBOARD (simple safe version)
// ============================================================
app.get("/", (req, res) => {
  res.send(`
    <h2>${config.name} is running</h2>
    <p>Status: ${botState.connected ? "Online" : "Offline"}</p>
  `);
});

app.get("/ping", (req, res) => res.send("pong"));

app.get("/health", (req, res) => {
  res.json({
    status: botState.connected ? "connected" : "disconnected",
    uptime: Math.floor((Date.now() - botState.startTime) / 1000)
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Server] Running on ${PORT}`);
});

// ============================================================
// KEEP ALIVE (Render safe)
// ============================================================
function keepAlive() {
  setInterval(() => {
    const url =
      process.env.RENDER_EXTERNAL_URL ||
      `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;

    if (!url) return;

    const protocol = url.startsWith("https") ? https : http;

    protocol.get(`${url}/ping`, () => {}).on("error", () => {});
  }, 10 * 60 * 1000);

  console.log("[KeepAlive] Active");
}

keepAlive();

// ============================================================
// BOT SYSTEM
// ============================================================
function createBot() {
  console.log("[Bot] Starting...");

  bot = mineflayer.createBot({
    username: config["bot-account"].username,
    password: config["bot-account"].password || undefined,
    auth: config["bot-account"].type,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version
  });

  bot.loadPlugin(pathfinder);

  bot.once("spawn", () => {
    console.log("[Bot] Connected");

    botState.connected = true;
    botState.reconnecting = false;

    const mcData = require("minecraft-data")(config.server.version);
    const move = new Movements(bot, mcData);

    bot.pathfinder.setMovements(move);

    startModules(bot);
  });

  bot.on("end", () => {
    console.log("[Bot] Disconnected");
    botState.connected = false;
    reconnect();
  });

  bot.on("error", (err) => {
    console.log("[Bot Error]", err.message);
  });
}

// ============================================================
// SAFE RECONNECT SYSTEM
// ============================================================
function reconnect() {
  if (botState.reconnecting) return;

  botState.reconnecting = true;

  setTimeout(() => {
    console.log("[Bot] Reconnecting...");
    createBot();
  }, 5000);
}

// ============================================================
// MODULES (SAFE VERSION)
// ============================================================
function startModules(bot) {
  console.log("[Modules] Loading...");

  // Anti AFK (safe interval)
  if (config.utils?.["anti-afk"]?.enabled) {
    setInterval(() => {
      if (!botState.connected) return;

      try {
        bot.setControlState("jump", true);
        setTimeout(() => bot.setControlState("jump", false), 200);
      } catch {}
    }, 5000);
  }

  // Simple chat responder
  bot.on("chat", (username, message) => {
    if (username === bot.username) return;

    if (message.startsWith("!tp")) {
      const target = message.split(" ")[1];
      if (target) bot.chat(`/tp ${target}`);
    }
  });
}

// ============================================================
// GLOBAL CRASH SAFETY
// ============================================================
process.on("uncaughtException", (err) => {
  console.log("[Crash]", err.message);
});

process.on("unhandledRejection", (err) => {
  console.log("[Promise Error]", err);
});

// ============================================================
// START BOT
// ============================================================
createBot();
