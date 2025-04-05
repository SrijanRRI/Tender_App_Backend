import cron from "node-cron";
import Tender from "../models/tenderSchema.js";

// Run every day at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("[Cron] Auto-close check started...");

  const today = new Date();

  try {
    const tenders = await Tender.find({
      status: { $in: ["open", "quoted"] },
    });

    let closedCount = 0;

    for (const tender of tenders) {
      const closeDate = new Date(tender.closeDate);
      if (closeDate < today) {
        tender.status = "closed";
        await tender.save();
        closedCount++;
      }
    }

    console.log(`[Cron] Auto-closed ${closedCount} tenders.`);
  } catch (error) {
    console.error("[Cron] Error during auto-close:", error.message);
  }
});
