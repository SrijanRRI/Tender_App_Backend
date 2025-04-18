// routes/quotationRoutes.js
import express from "express";
import { submitQuotation } from "../controller/quotationController.js";
import { jwtAuth } from "../middleware/jwtAuth.js";
import { upload } from "../middleware/uploadMiddleware.js"; // multer
import { getMyQuotationsForTender } from "../controller/quotationController.js";

const router = express.Router();

router.post("/submit/:id", jwtAuth, upload.single("file"), submitQuotation);
router.get("/my-tender-quotes/:tenderId", jwtAuth, getMyQuotationsForTender);

export default router;
