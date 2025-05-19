import express from "express";
import { jwtAuth } from "../middleware/jwtAuth.js";
import {
  getPendingApprovals,
  approveUser,
  rejectUser,
  getApprovedTransportUsers,
  getAllTenders,
  getRankedBestQuotationsWithDetails,
} from "../controller/adminController.js";

const adminRouter = express.Router();

// Admin routes for user approval
adminRouter.get("/pending-approvals", getPendingApprovals);
adminRouter.put("/approve-user/:userId", approveUser);
adminRouter.delete("/reject-user/:userId", rejectUser);
adminRouter.get("/transport-users", getApprovedTransportUsers);
adminRouter.get("/all-tender", getAllTenders);
adminRouter.get("/tenders/:tenderId/ranked-best-report",jwtAuth , getRankedBestQuotationsWithDetails);

export default adminRouter;
