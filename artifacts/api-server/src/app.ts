import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const staticDirs = [
  path.join(__dirname, "../../z-fantasy/dist/public"),
  path.join(__dirname, "../../../artifacts/z-fantasy/dist/public"),
  path.join(__dirname, "../../z-fantasy/dist"),
  path.join(__dirname, "dist"),
  path.join(__dirname, "build"),
];

for (const dir of staticDirs) {
  if (fs.existsSync(dir)) {
    app.use(express.static(dir));
    logger.info({ dir }, "Serving static frontend from directory");
    break;
  }
}

app.use("/api", router);

app.get("/{*path}", (_req, res) => {
  const possibleIndexFiles = [
    path.join(__dirname, "../../z-fantasy/dist/public/index.html"),
    path.join(__dirname, "../../../artifacts/z-fantasy/dist/public/index.html"),
    path.join(__dirname, "../../z-fantasy/dist/index.html"),
    path.join(__dirname, "dist/index.html"),
    path.join(__dirname, "build/index.html"),
  ];

  for (const file of possibleIndexFiles) {
    if (fs.existsSync(file)) {
      res.sendFile(file);
      return;
    }
  }

  res.send("Server Active - Static Frontend Bundle Compiling or Missing");
});

export default app;
