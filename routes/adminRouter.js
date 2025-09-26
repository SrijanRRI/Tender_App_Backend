import express from "express";
import { jwtAuth } from "../middleware/jwtAuth.js";
import {
  getPendingApprovals,
  rejectUser,
  getApprovedTransportUsers,
  getAllTenders,
  getRankedBestQuotationsForAllTenders,
  approveUserTwoStep,
} from "../controller/adminController.js";

const adminRouter = express.Router();

// Admin routes for user approval
adminRouter.get("/pending-approvals", getPendingApprovals);
// adminRouter.put("/approve-user/:userId", approveUser);
adminRouter.put("/users/:userId/approve",jwtAuth,approveUserTwoStep)
adminRouter.delete("/reject-user/:userId", rejectUser);
adminRouter.get("/transport-users", getApprovedTransportUsers);
adminRouter.get("/all-tender", getAllTenders);
adminRouter.get("/tenders/ranked-best-report",jwtAuth , getRankedBestQuotationsForAllTenders);

export default adminRouter;
