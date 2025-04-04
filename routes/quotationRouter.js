import express from "express";
import { submitQuotation } from "../controller/quotationController.js";
import { jwtAuth } from "../middleware/jwtAuth.js";

const router = express.Router();

// POST /quotation/submit/:id  --> id = tender ID
router.post("/submit/:id", jwtAuth, submitQuotation);

export default router;
