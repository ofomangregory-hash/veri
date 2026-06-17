import { Router, type IRouter } from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import { authMiddleware, adminOnly } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

const upload = multer({ storage: multer.memoryStorage() });

const ALLOWED_CATEGORIES = ["profile", "auto_loop", "trigger_words", "blurred"] as const;
type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

function isAllowedCategory(value: unknown): value is AllowedCategory {
  return ALLOWED_CATEGORIES.includes(value as AllowedCategory);
}

async function uploadFileToTelegraph(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<string> {
  const form = new FormData();
  form.append("file", fileBuffer, {
    filename: originalName,
    contentType: mimeType,
  });

  const response = await axios.post<Array<{ src: string }>>(
    "https://telegra.ph/upload",
    form,
    {
      headers: form.getHeaders(),
      timeout: 30_000,
    }
  );

  const result = response.data;

  if (!Array.isArray(result) || result.length === 0 || !result[0]?.src) {
    throw new Error(`Unexpected Telegra.ph response for file "${originalName}": ${JSON.stringify(result)}`);
  }

  return `https://telegra.ph${result[0].src}`;
}

router.post(
  "/admin/bulk-upload",
  authMiddleware,
  adminOnly,
  upload.array("images", 50),
  async (req, res): Promise<void> => {
    const category = req.body?.category as unknown;

    if (!isAllowedCategory(category)) {
      res.status(400).json({
        error: `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(", ")}`,
      });
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No images uploaded. Provide at least one file under the 'images' field." });
      return;
    }

    logger.info(
      { category, fileCount: files.length },
      "Admin bulk upload initiated"
    );

    const uploadResults: Array<{ filename: string; url: string; error?: string }> = [];
    const publicUrls: string[] = [];

    for (const file of files) {
      try {
        const url = await uploadFileToTelegraph(
          file.buffer,
          file.originalname,
          file.mimetype
        );
        uploadResults.push({ filename: file.originalname, url });
        publicUrls.push(url);
        logger.info({ filename: file.originalname, url }, "File uploaded to Telegra.ph successfully");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ filename: file.originalname, err }, "Failed to upload file to Telegra.ph");
        uploadResults.push({ filename: file.originalname, url: "", error: message });
      }
    }

    const failedCount = uploadResults.filter((r) => r.error).length;

    if (failedCount === files.length) {
      res.status(502).json({
        error: "All file uploads to Telegra.ph failed.",
        details: uploadResults,
      });
      return;
    }

    logger.info(
      { category, successCount: publicUrls.length, failedCount },
      "Admin bulk upload complete"
    );

    res.status(200).json({
      category,
      urls: publicUrls,
      details: uploadResults,
    });
  }
);

router.get(
  "/admin/characters/:characterId/assets",
  authMiddleware,
  adminOnly,
  async (req, res): Promise<void> => {
    const { characterId } = req.params;

    if (!supabase) {
      res.status(503).json({ error: "Supabase client unavailable — check server environment variables." });
      return;
    }

    logger.info({ characterId }, "Admin assets read: fetching character asset links");

    const { data, error } = await supabase
      .from("characters")
      .select("character_id, avatar_url, trigger_metadata_array")
      .eq("character_id", characterId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        res.status(404).json({ error: `Character "${characterId}" not found.` });
        return;
      }
      logger.error({ characterId, supabaseError: error }, "Admin assets read: Supabase query failed");
      res.status(502).json({ error: "Failed to fetch character assets from database.", detail: error.message });
      return;
    }

    logger.info(
      {
        characterId,
        avatarUrl: data.avatar_url ?? null,
        hasTriggerMetadata: data.trigger_metadata_array !== null,
      },
      "Admin assets read: character asset links retrieved successfully"
    );

    res.status(200).json({
      characterId: data.character_id,
      avatarUrl: data.avatar_url ?? null,
      triggerMetadataArray: data.trigger_metadata_array ?? null,
    });
  }
);

export default router;
