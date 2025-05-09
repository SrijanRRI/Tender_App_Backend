import cron from 'node-cron';
import Tender from '../models/tenderSchema.js';

// Optional: Log on import to verify it runs
console.log("[Cron] Tender auto-close scheduler loaded.");

cron.schedule("0 0 * * *", async () => {
  console.log("[Cron] Auto-close check started...");

  // Calculate end of "yesterday" (i.e., all tenders that closed before today)
  const today = new Date();
  today.setHours(0, 0, 0, 0); // today at 00:00:00

  try {
    const result = await Tender.updateMany(
      { closeDate: { $lt: today }, status: { $ne: "closed" } },
      { $set: { status: "closed" } }
    );

    console.log(`[Cron] Auto-closed ${result.modifiedCount} tenders.`);
  } catch (error) {
    console.error("[Cron] Error during auto-close:", error.message);
  }
});
