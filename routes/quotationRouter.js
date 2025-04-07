// routes/quotationRoutes.js
import express from "express";
import { submitQuotation } from "../controller/quotationController.js";
import { jwtAuth } from "../middleware/jwtAuth.js";
import { upload } from "../middleware/uploadMiddleware.js"; // multer

const router = express.Router();

router.post("/submit/:id", jwtAuth, upload.single('file'), submitQuotation);

export default router;
