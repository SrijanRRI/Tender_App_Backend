import express from "express";
import {
  createTender,
  getAllTendersByRRUser,
  getTendersForTransporter,
  getSingleTender,
  getTenderQuotations,
  finalizeTender,
  deleteTender,
  getMyQuotationPosition,
  getUpcomingTendersForTransporter,
  reopenTender,
  getQuotationHistoryForTransporter,
  // getAllFinalizedTendersWithQuotations
} from "../controller/tenderController.js";

import {jwtAuth} from "../middleware/jwtAuth.js";

const router = express.Router();

// ✅ 1. Create a new tender (RR user)
router.post("/create-tender", jwtAuth, createTender);

// ✅ 2. Get all tenders created by RR user
router.get("/my-tenders", jwtAuth, getAllTendersByRRUser);

// ✅ 3. Get all tenders assigned to a transporter
router.get("/assigned", jwtAuth, getTendersForTransporter);

// ✅ 4. Get single tender by ID
router.get("/:id", jwtAuth, getSingleTender);

// ✅ 5. Get quotations for a tender
router.get("/quotations/:id", jwtAuth, getTenderQuotations);

// ✅ 6. Finalize a tender (choose a quotation)
router.put("/finalize/:id", jwtAuth, finalizeTender);

// ✅ 7. Delete a tender (by RR user)
router.delete("/:id", jwtAuth, deleteTender);

router.get("/quotation/history", jwtAuth, getQuotationHistoryForTransporter);

// router.get("/my-finalized-tenders", jwtAuth, getAllFinalizedTendersWithQuotations);

router.get("/my-position/:tenderId", jwtAuth, getMyQuotationPosition);

router.get("/transporter/upcoming", jwtAuth, getUpcomingTendersForTransporter);

router.post("/reopen/:id", jwtAuth, reopenTender);



export default router;