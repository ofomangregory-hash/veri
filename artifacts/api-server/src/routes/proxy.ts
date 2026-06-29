import { Router, type IRouter } from "express";

const router: IRouter = Router();

const ALLOWED_HOSTS = ["image.pollinations.ai"];

router.get("/proxy-image", async (req, res): Promise<void> => {
  const url = req.query.url as string | undefined;

  if (!url) {
    res.status(400).json({ error: "Missing url parameter" });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    res.status(403).json({ error: "URL not allowed" });
    return;
  }

  try {
    const response = await fetch(url, {
      headers: { "Referer": "https://pollinations.ai" },
      signal: AbortSignal.timeout(65000),
    });

    if (!response.ok) {
      res.status(response.status).end();
      return;
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const buffer = await response.arrayBuffer();

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.log("[PROXY IMAGE] fetch error:", err?.message);
    res.status(502).json({ error: "Failed to fetch image" });
  }
});

export default router;
