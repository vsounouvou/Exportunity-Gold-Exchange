import { readdir, stat, unlink } from "fs/promises";
import { join } from "path";

const AUDIO_DIR = join(process.cwd(), "public", "audio");
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function cleanupOldAudioFiles(audioDir = AUDIO_DIR): Promise<number> {
  try {
    const files = await readdir(audioDir);
    const now = Date.now();
    let deletedCount = 0;

    for (const file of files) {
      if (!file.endsWith(".mp3")) continue;

      const filePath = join(audioDir, file);
      const fileStats = await stat(filePath);
      const fileAge = now - fileStats.mtimeMs;

      if (fileAge > MAX_AGE_MS) {
        await unlink(filePath);
        deletedCount++;
        console.log(`[AudioCleanup] Deleted old audio file: ${file}`);
      }
    }

    if (deletedCount > 0) {
      console.log(`[AudioCleanup] Cleaned up ${deletedCount} audio files`);
    }

    return deletedCount;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return 0;
    console.error("[AudioCleanup] Error during cleanup:", error);
    return 0;
  }
}

export function startAudioCleanupScheduler() {
  setInterval(async () => {
    await cleanupOldAudioFiles();
  }, 60 * 60 * 1000); // Run every hour

  console.log("[AudioCleanup] Audio cleanup scheduler started");
}
