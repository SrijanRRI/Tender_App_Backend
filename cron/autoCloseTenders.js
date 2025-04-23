import cron from "node-cron";
import Tender from "../models/tenderSchema.js";

// Run every day at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("[Cron] Auto-close check started...");

  const today = new Date();
  today.setHours(0, 0, 0, 0); // normalize to midnight

  try {
    const result = await Tender.updateMany(
      {
        closeDate: { $lt: today }
      },
      { $set: { status: "closed" } }
    );

    console.log(`[Cron] Auto-closed ${result.modifiedCount} tenders.`);
  } catch (error) {
    console.error("[Cron] Error during auto-close:", error.message);
  }
});
