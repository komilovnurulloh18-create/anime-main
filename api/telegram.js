// api/telegram.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).json({ ok: true });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const token = process.env.TG_BOT_TOKEN;  // Vercel env
    const chatId = process.env.TG_CHAT_ID;   // Vercel env

    if (!token || !chatId)
      return res.status(500).json({ ok: false, error: "Missing token or chatId" });

    
    const { text } = req.body || {};
    if (!text)
      return res.status(400).json({ ok: false, error: "text required" });

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const tgRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    const data = await tgRes.json().catch(() => ({}));

    if (!tgRes.ok || data?.ok === false)
      return res.status(500).json({ ok: false, error: "Telegram error", details: data });

    return res.status(200).json({ ok: true, result: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}